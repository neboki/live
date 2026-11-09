<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onRadioKeydown } from '../../composables/radioGroup';
import { VOICE_VOLUME_RANGE } from '../../constants';
import { fractionOf, stepTo } from '../../utils/range';
import { useSettingsStore } from '@/modules/settings';
import { logError } from '@/shared/errors';
import { INTERPRETER_MODEL } from '@/shared/providers/openai/config';
import { createOpenAiTts } from '@/shared/providers/openai/tts/tts';
import { createBrowserTts } from '@/shared/speech/browserTts';
import { useOverlayStore } from '../../store/useOverlayStore';

/** Voices of OpenAI's speech endpoint; marin and cedar sound best */
const OPENAI_VOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const;
const RECOMMENDED: ReadonlySet<string> = new Set(['marin', 'cedar']);
/** The browser's own voice, free; not an OpenAI voice name */
const BROWSER = 'browser';

/**
 * Picks the voice that reads the translation: the browser's (free) or one of
 * OpenAI's, each with a short sample to hear it first. A sample is a tiny OpenAI
 * request, billed to the key and not counted in the session cost.
 */
const store = useOverlayStore();
const settings = useSettingsStore();
const { t, locale } = useI18n();
const volumeLabel = computed(() =>
  new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }).format(
    store.voiceVolume,
  ),
);
const volumeFill = computed(() => `${fractionOf(VOICE_VOLUME_RANGE, store.voiceVolume) * 100}%`);

// No instanceof: inside the floating window the input belongs to another window
function onVolume(event: Event): void {
  const value = Number((event.target as HTMLInputElement | null)?.value);
  if (Number.isFinite(value)) store.voiceVolume = stepTo(VOICE_VOLUME_RANGE, value);
}
/** The voice whose sample is playing, if any */
const playing = ref<string | null>(null);
const failed = ref(false);
const openAi = createOpenAiTts(() => ({
  apiKey: settings.apiKey,
  endpoint: settings.endpoint,
  model: settings.tts.model,
  voice: playing.value ?? settings.tts.voice,
  volume: store.voiceVolume,
}));
const browser = createBrowserTts(() => store.voiceVolume);

const selected = computed(() => (settings.tts.engine === 'browser' ? BROWSER : settings.tts.voice));
const canPreview = computed(() => settings.apiKey.trim() !== '');
/** In interpreter mode the model speaks with its own voice */
const interpreter = computed(() => settings.models.translation === INTERPRETER_MODEL);

function choose(voice: string): void {
  if (voice === BROWSER) {
    settings.tts.engine = 'browser';
    return;
  }
  settings.tts.engine = 'openai';
  settings.tts.voice = voice;
}

function stop(): void {
  openAi.stop();
  browser.stop();
  playing.value = null;
}

async function preview(voice: string): Promise<void> {
  const again = playing.value === voice;
  stop();
  if (again) return;
  failed.value = false;
  playing.value = voice;
  try {
    const engine = voice === BROWSER ? browser : openAi;
    await engine.speak(t('overlay.voice.sample'), locale.value);
  } catch (err) {
    logError('Voice sample failed', err);
    failed.value = true;
  } finally {
    if (playing.value === voice) playing.value = null;
  }
}

function isRecommended(voice: string): boolean {
  return RECOMMENDED.has(voice);
}

onBeforeUnmount(() => {
  stop();
  openAi.close?.();
});
</script>

<template>
  <div class="voices">
    <p v-if="interpreter" class="voices__note">{{ t('overlay.voice.interpreter') }}</p>
    <div
      v-else
      class="voices__grid"
      role="radiogroup"
      :aria-label="t('overlay.voice.voice')"
      @keydown="onRadioKeydown"
    >
      <div class="voices__card" :class="{ 'voices__card--on': selected === BROWSER }">
        <button
          class="voices__pick"
          type="button"
          role="radio"
          :aria-checked="selected === BROWSER"
          :tabindex="selected === BROWSER ? 0 : -1"
          @click="choose(BROWSER)"
        >
          {{ t('overlay.voice.browser') }}
          <small>{{ t('overlay.voice.free') }}</small>
        </button>
        <button
          class="voices__play"
          type="button"
          :aria-label="t('overlay.voice.listen', { voice: t('overlay.voice.browser') })"
          :aria-pressed="playing === BROWSER"
          @click="preview(BROWSER)"
        >
          <span aria-hidden="true">{{ playing === BROWSER ? '■' : '▶' }}</span>
        </button>
      </div>
      <div
        v-for="voice in OPENAI_VOICES"
        :key="voice"
        class="voices__card"
        :class="{ 'voices__card--on': selected === voice }"
      >
        <button
          class="voices__pick"
          type="button"
          role="radio"
          :aria-checked="selected === voice"
          :tabindex="selected === voice ? 0 : -1"
          @click="choose(voice)"
        >
          {{ voice }}
          <small v-if="isRecommended(voice)">{{ t('overlay.voice.recommended') }}</small>
          <small v-else>OpenAI</small>
        </button>
        <button
          class="voices__play"
          type="button"
          :disabled="!canPreview"
          :title="canPreview ? undefined : t('overlay.voice.needsKey')"
          :aria-label="t('overlay.voice.listen', { voice })"
          :aria-pressed="playing === voice"
          @click="preview(voice)"
        >
          <span aria-hidden="true">{{ playing === voice ? '■' : '▶' }}</span>
        </button>
      </div>
    </div>
    <label class="voices__volume">
      <span>{{ t('overlay.sound.voice') }}</span>
      <output class="voices__value">{{ volumeLabel }}</output>
      <input
        class="voices__range"
        type="range"
        :min="VOICE_VOLUME_RANGE.min"
        :max="VOICE_VOLUME_RANGE.max"
        :step="VOICE_VOLUME_RANGE.step"
        :value="store.voiceVolume"
        :aria-valuetext="volumeLabel"
        :style="{ '--fill': volumeFill }"
        @input="onVolume"
      />
    </label>
    <template v-if="!interpreter">
      <p v-if="failed" class="voices__note voices__note--error" role="status">
        {{ t('overlay.voice.sampleFailed') }}
      </p>
      <p class="voices__note">{{ t('overlay.voice.cost') }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/glass-range' as range;

.voices {
  display: grid;
  gap: 6px;

  // Same layout as the sound controls: label and value, the slider under them
  &__volume {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 6px;
    align-items: center;
    margin-top: 4px;
    color: var(--glass-fg);
    font-size: 12.5px;
  }

  &__value {
    min-width: 4ch;
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  &__range {
    @include range.slider;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
    gap: 4px;
  }

  &__card {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--glass-line);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition:
      border-color 0.15s,
      background 0.15s;

    &--on {
      border-color: var(--glass-accent);
      background: color-mix(in srgb, var(--glass-accent) 20%, transparent);
    }
  }

  &__pick,
  &__play {
    border: 0;
    background: transparent;
    color: var(--glass-fg);
    cursor: pointer;
    appearance: none;

    &:hover:not(:disabled) {
      background: var(--glass-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: -2px;
    }
  }

  &__pick {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    font: 500 12.5px var(--font-ui);
    text-align: left;
    text-transform: capitalize;

    small {
      display: block;
      color: var(--glass-muted);
      font-size: 10.5px;
      font-weight: 400;
      text-transform: none;
    }
  }

  &__play {
    width: 30px;
    border-left: 1px solid var(--glass-line);
    font-size: 10px;

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
  }

  &__note {
    margin: 0;
    color: var(--glass-muted);
    font-size: 11px;

    &--error {
      color: #f87171;
    }
  }
}
</style>
