<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onRadioKeydown } from '../../composables/radioGroup';
import { VOICE_VOLUME_RANGE } from '../../constants';
import { fractionOf, stepTo } from '../../utils/range';
import { useSettingsStore } from '@/modules/settings';
import { AppError, logError } from '@/shared/errors';
import { KEY_PAGE } from '@/shared/providers/elevenlabs/config';
import { createElevenLabsTts } from '@/shared/providers/elevenlabs/tts';
import { type ElevenLabsVoice, listElevenLabsVoices } from '@/shared/providers/elevenlabs/voices';
import { INTERPRETER_MODEL } from '@/shared/providers/openai/config';
import { createBrowserTts } from '@/shared/speech/browserTts';
import { useOverlayStore } from '../../store/useOverlayStore';

/** The browser's own voice, free; not an ElevenLabs voice id */
const BROWSER = 'browser';
/** Shorter than any ElevenLabs key: not worth asking for the voices yet */
const MIN_KEY_CHARS = 20;

/**
 * Picks the voice that reads the translation: the browser's (free) or one of the
 * ElevenLabs account's, each with a short sample to hear it first. ElevenLabs needs the
 * user's own ElevenLabs key, asked for here; a sample is a tiny request billed to it and
 * not counted in the session cost.
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
const keyVisible = ref(false);
const elevenLabs = createElevenLabsTts(() => ({
  apiKey: settings.voiceKey,
  model: settings.tts.model,
  voice: playing.value ?? settings.tts.voice,
  volume: store.voiceVolume,
}));
const browser = createBrowserTts(() => store.voiceVolume);

/** The account's voices; empty until loaded or without a key */
const voices = ref<ElevenLabsVoice[]>([]);
const loading = ref(false);
/** i18n key of why the voices could not be loaded, or null */
const loadError = ref<string | null>(null);
let loadController: AbortController | null = null;

/** The key works: its voices came back */
const hasVoices = computed(() => voices.value.length > 0);
const selected = computed(() => (settings.tts.engine === 'browser' ? BROWSER : settings.tts.voice));
/** In interpreter mode the model speaks with its own voice */
const interpreter = computed(() => settings.models.translation === INTERPRETER_MODEL);

async function loadVoices(key: string): Promise<void> {
  loadController?.abort();
  voices.value = [];
  loadError.value = null;
  if (key.trim().length < MIN_KEY_CHARS) return;
  const controller = new AbortController();
  loadController = controller;
  loading.value = true;
  try {
    voices.value = await listElevenLabsVoices(key, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) return;
    logError('Loading the ElevenLabs voices failed', err);
    const refused = err instanceof AppError && err.userMessageKey === 'errors.ttsKey';
    loadError.value = refused ? 'overlay.voice.keyRefused' : 'overlay.voice.loadFailed';
  } finally {
    if (loadController === controller) {
      loading.value = false;
      loadController = null;
    }
  }
}

watch(
  () => settings.voiceKey,
  (key) => {
    // Without a usable key the browser reads; with one, a voice from the list can be picked
    if (key.trim().length < MIN_KEY_CHARS && settings.tts.engine === 'elevenlabs') {
      settings.tts.engine = 'browser';
    }
    void loadVoices(key);
  },
  { immediate: true },
);

function choose(voice: string): void {
  if (voice === BROWSER) {
    settings.tts.engine = 'browser';
    return;
  }
  settings.tts.engine = 'elevenlabs';
  settings.tts.voice = voice;
}

function stop(): void {
  elevenLabs.stop();
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
    const engine = voice === BROWSER ? browser : elevenLabs;
    await engine.speak(t('overlay.voice.sample'), locale.value);
  } catch (err) {
    logError('Voice sample failed', err);
    failed.value = true;
  } finally {
    if (playing.value === voice) playing.value = null;
  }
}

onBeforeUnmount(() => {
  loadController?.abort();
  stop();
  elevenLabs.close?.();
});
</script>

<template>
  <div class="voices">
    <p v-if="interpreter" class="voices__note">{{ t('overlay.voice.interpreter') }}</p>
    <template v-else>
      <div
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
          v-for="voice in voices"
          :key="voice.id"
          class="voices__card"
          :class="{ 'voices__card--on': selected === voice.id }"
        >
          <button
            class="voices__pick"
            type="button"
            role="radio"
            :aria-checked="selected === voice.id"
            :tabindex="selected === voice.id ? 0 : -1"
            @click="choose(voice.id)"
          >
            {{ voice.name }}
            <small>{{
              voice.category === 'premade' ? 'ElevenLabs' : t('overlay.voice.yours')
            }}</small>
          </button>
          <button
            class="voices__play"
            type="button"
            :aria-label="t('overlay.voice.listen', { voice: voice.name })"
            :aria-pressed="playing === voice.id"
            @click="preview(voice.id)"
          >
            <span aria-hidden="true">{{ playing === voice.id ? '■' : '▶' }}</span>
          </button>
        </div>
      </div>
      <p v-if="loading" class="voices__note" role="status">{{ t('overlay.voice.loading') }}</p>
      <p v-else-if="loadError" class="voices__note voices__note--error" role="status">
        {{ t(loadError) }}
      </p>
      <label class="voices__key">
        <span>{{ t('overlay.voice.key') }}</span>
        <span class="voices__key-line">
          <input
            v-model.trim="settings.voiceKey"
            class="voices__key-input"
            :type="keyVisible ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            placeholder="sk_…"
          />
          <button
            class="voices__key-toggle"
            type="button"
            :aria-pressed="keyVisible"
            @click="keyVisible = !keyVisible"
          >
            {{ keyVisible ? t('start.key.hide') : t('start.key.show') }}
          </button>
        </span>
        <small>
          {{ hasVoices ? t('overlay.voice.keySet') : t('overlay.voice.keyHelp') }}
          <a :href="KEY_PAGE" target="_blank" rel="noopener noreferrer">{{
            t('overlay.voice.getKey')
          }}</a>
        </small>
      </label>
    </template>
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
  &__play,
  &__key-toggle {
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
    overflow-wrap: anywhere;

    small {
      display: block;
      color: var(--glass-muted);
      font-size: 10.5px;
      font-weight: 400;
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

  // The optional ElevenLabs key, under the voices it unlocks
  &__key {
    display: grid;
    gap: 4px;
    margin-top: 4px;
    color: var(--glass-fg);
    font-size: 12.5px;

    small {
      color: var(--glass-muted);
      font-size: 11px;
    }

    a {
      color: var(--glass-accent);
    }
  }

  &__key-line {
    display: flex;
    gap: 4px;
  }

  &__key-input {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--glass-line);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--glass-fg);
    font: 12px var(--font-mono);

    // Edge adds its own reveal button; the Show button next to it does that already
    &::-ms-reveal {
      display: none;
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: -1px;
    }
  }

  &__key-toggle {
    padding: 0 8px;
    border: 1px solid var(--glass-line);
    border-radius: var(--radius-sm);
    font: 500 11.5px var(--font-ui);
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
