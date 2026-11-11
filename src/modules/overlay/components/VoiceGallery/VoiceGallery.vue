<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onRadioKeydown } from '../../composables/radioGroup';
import {
  MIN_ELEVENLABS_KEY_CHARS,
  useElevenLabsVoices,
} from '../../composables/useElevenLabsVoices';
import { VOICE_VOLUME_RANGE } from '../../constants';
import { fractionOf, stepTo } from '../../utils/range';
import { useSettingsStore } from '@/modules/settings';
import { logError } from '@/shared/errors';
import { KEY_PAGE } from '@/shared/providers/elevenlabs/config';
import { createElevenLabsTts } from '@/shared/providers/elevenlabs/tts';
import { INTERPRETER_MODEL, VOICES } from '@/shared/providers/openai/config';
import { createOpenAiVoice } from '@/shared/providers/openai/realtime/realtimeVoice';
import type { TtsEngine } from '@/shared/speech/types';
import { useOverlayStore } from '../../store/useOverlayStore';

/** One voice card: which engine reads, with which of its voices */
interface Choice {
  /** Unique across engines: "openai:marin", "elevenlabs:<id>" */
  id: string;
  engine: TtsEngine;
  voice: string;
  name: string;
  tag: string;
}

const RECOMMENDED: ReadonlySet<string> = new Set(['marin', 'cedar']);

/**
 * Picks the voice that reads the translation: OpenAI's (the default, with the OpenAI key)
 * or ElevenLabs' (optional, with the user's ElevenLabs key, asked for here). Each has a
 * short sample to hear it first; a sample is a tiny request billed to the key and not
 * counted in the session cost. The browser's voice is not offered: it only reads when the
 * chosen voice fails (useSpeech).
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
/** The card whose sample is playing, if any */
const playing = ref<Choice | null>(null);
const failed = ref(false);
const keyVisible = ref(false);
const openAi = createOpenAiVoice(() => ({
  apiKey: settings.apiKey,
  endpoint: settings.endpoint,
  model: settings.tts.model,
  voice: playing.value?.engine === 'openai' ? playing.value.voice : settings.tts.voice,
  volume: store.voiceVolume,
}));
const elevenLabs = createElevenLabsTts(() => ({
  apiKey: settings.voiceKey,
  model: settings.tts.elevenLabsModel,
  voice:
    playing.value?.engine === 'elevenlabs' ? playing.value.voice : settings.tts.elevenLabsVoice,
  volume: store.voiceVolume,
}));

const { voices, loading, error: loadError } = useElevenLabsVoices(() => settings.voiceKey);

const openAiChoices = computed<Choice[]>(() =>
  VOICES.map((voice) => ({
    id: `openai:${voice}`,
    engine: 'openai',
    voice,
    name: voice.charAt(0).toUpperCase() + voice.slice(1),
    tag: RECOMMENDED.has(voice) ? t('overlay.voice.recommended') : 'OpenAI',
  })),
);
const elevenLabsChoices = computed<Choice[]>(() =>
  voices.value.map((voice) => ({
    id: `elevenlabs:${voice.id}`,
    engine: 'elevenlabs',
    voice: voice.id,
    name: voice.name,
    tag: voice.category === 'premade' ? 'ElevenLabs' : t('overlay.voice.yours'),
  })),
);
/** The cards in two groups: OpenAI (default) and ElevenLabs (optional, once its key works) */
const groups = computed(() =>
  [
    { id: 'openai', title: t('overlay.voice.openai'), choices: openAiChoices.value },
    { id: 'elevenlabs', title: t('overlay.voice.elevenlabs'), choices: elevenLabsChoices.value },
  ].filter((group) => group.choices.length > 0),
);

const selected = computed(() => {
  const { engine, voice, elevenLabsVoice } = settings.tts;
  return engine === 'elevenlabs' ? `elevenlabs:${elevenLabsVoice}` : `openai:${voice}`;
});
const hasOpenAiKey = computed(() => settings.apiKey.trim() !== '');
const hasVoices = computed(() => voices.value.length > 0);
/** In interpreter mode the model speaks with its own voice */
const interpreter = computed(() => settings.models.translation === INTERPRETER_MODEL);

// Without a usable ElevenLabs key its voices cannot read: back to OpenAI's, the default
watch(
  () => settings.voiceKey,
  (key) => {
    if (key.trim().length < MIN_ELEVENLABS_KEY_CHARS && settings.tts.engine === 'elevenlabs') {
      settings.tts.engine = 'openai';
    }
  },
  { immediate: true },
);

function choose(choice: Choice): void {
  // Picking a voice means wanting to hear it: with the voice off nothing would read
  store.options.voice = true;
  settings.tts.engine = choice.engine;
  if (choice.engine === 'openai') settings.tts.voice = choice.voice;
  if (choice.engine === 'elevenlabs') settings.tts.elevenLabsVoice = choice.voice;
}

function canPreview(choice: Choice): boolean {
  return choice.engine !== 'openai' || hasOpenAiKey.value;
}

function stop(): void {
  openAi.stop();
  elevenLabs.stop();
  playing.value = null;
}

async function preview(choice: Choice): Promise<void> {
  const again = playing.value?.id === choice.id;
  stop();
  if (again) return;
  failed.value = false;
  playing.value = choice;
  try {
    const engine = choice.engine === 'elevenlabs' ? elevenLabs : openAi;
    await engine.speak(t('overlay.voice.sample'), locale.value);
  } catch (err) {
    logError('Voice sample failed', err);
    failed.value = true;
  } finally {
    if (playing.value?.id === choice.id) playing.value = null;
  }
}

onBeforeUnmount(() => {
  stop();
  openAi.close?.();
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
        <template v-for="group in groups" :key="group.id">
          <p class="voices__group">{{ group.title }}</p>
          <div
            v-for="choice in group.choices"
            :key="choice.id"
            class="voices__card"
            :class="{ 'voices__card--on': selected === choice.id }"
          >
            <button
              class="voices__pick"
              type="button"
              role="radio"
              :aria-checked="selected === choice.id"
              :tabindex="selected === choice.id ? 0 : -1"
              @click="choose(choice)"
            >
              {{ choice.name }}
              <small>{{ choice.tag }}</small>
            </button>
            <button
              class="voices__play"
              type="button"
              :disabled="!canPreview(choice)"
              :title="canPreview(choice) ? undefined : t('overlay.voice.needsKey')"
              :aria-label="t('overlay.voice.listen', { voice: choice.name })"
              :aria-pressed="playing?.id === choice.id"
              @click="preview(choice)"
            >
              <span aria-hidden="true">{{ playing?.id === choice.id ? '■' : '▶' }}</span>
            </button>
          </div>
        </template>
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

  // A heading over each engine's voices, across the whole grid
  &__group {
    grid-column: 1 / -1;
    margin: 6px 0 0;
    color: var(--glass-muted);
    font-size: 11px;
    font-weight: 600;

    &:first-child {
      margin-top: 0;
    }
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
