<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/modules/settings';
import { KEY_PAGE } from '@/shared/providers/elevenlabs/config';
import type { TtsEngine } from '@/shared/speech/types';
import { onRadioKeydown } from '../../composables/radioGroup';
import {
  MIN_ELEVENLABS_KEY_CHARS,
  useElevenLabsVoices,
} from '../../composables/useElevenLabsVoices';
import { useOverlayStore } from '../../store/useOverlayStore';

type KeyState = 'empty' | 'short' | 'loading' | 'error' | 'ready';

/** Off (captions only) or the engine that reads: one choice, so the state is never ambiguous */
type VoiceChoice = 'off' | TtsEngine;
const CHOICES: readonly VoiceChoice[] = ['off', 'openai', 'elevenlabs'];
const CHOICE_LABEL: Readonly<Record<VoiceChoice, string>> = {
  off: 'overlay.voice.engineOff',
  openai: 'overlay.voice.engineOpenAi',
  elevenlabs: 'overlay.voice.engineElevenLabs',
};

withDefaults(defineProps<{ choosable?: boolean }>(), { choosable: false });
const emit = defineEmits<{
  /** Take the person to the voice gallery to pick another voice */
  choose: [];
}>();

/**
 * Which voice reads the translation, OpenAI's or ElevenLabs', said plainly and switchable
 * like OpenAI/Azure for the main key. The ElevenLabs key box only shows under ElevenLabs, so
 * it is never read as part of OpenAI. A key that works switches the voice to ElevenLabs; until
 * then whatever was reading keeps reading.
 */
const settings = useSettingsStore();
const overlay = useOverlayStore();
const { t } = useI18n();
const uid = useId();
const visible = ref(false);
const { voices, loading, error, limited } = useElevenLabsVoices(() => settings.voiceKey);

const state = computed<KeyState>(() => {
  const key = settings.voiceKey.trim();
  if (!key) return 'empty';
  if (key.length < MIN_ELEVENLABS_KEY_CHARS) return 'short';
  if (loading.value) return 'loading';
  if (error.value) return 'error';
  return voices.value.length > 0 ? 'ready' : 'loading';
});
const engine = computed(() => settings.tts.engine);
const current = computed<VoiceChoice>(() => (overlay.options.voice ? engine.value : 'off'));
/** The tab in view: ElevenLabs can be open, asking for its key, before it reads anything */
const picked = ref<VoiceChoice>(current.value);
const waitingForKey = computed(() => picked.value === 'elevenlabs' && state.value !== 'ready');
const voiceName = computed(() => {
  if (engine.value === 'elevenlabs') {
    const id = settings.tts.elevenLabsVoice;
    return voices.value.find((voice) => voice.id === id)?.name ?? id;
  }
  const voice = settings.tts.voice;
  return voice.charAt(0).toUpperCase() + voice.slice(1);
});

function use(next: VoiceChoice): void {
  picked.value = next;
  if (next === 'off') {
    overlay.options.voice = false;
    return;
  }
  if (next === 'elevenlabs' && state.value !== 'ready') {
    // No working key yet: show its box and wait there; nothing changes in what reads
    void nextTick(() => document.getElementById(`${uid}-key`)?.focus());
    return;
  }
  settings.tts.engine = next;
  // Choosing a voice means wanting to hear it
  overlay.options.voice = true;
}

// The key started to work while ElevenLabs was open: now it can read
watch(state, (now) => {
  if (now === 'ready' && picked.value === 'elevenlabs') use('elevenlabs');
});
// Follow a change made elsewhere (the voice gallery, Settings), unless a key is being typed
watch(current, (now) => {
  if (!waitingForKey.value) picked.value = now;
});
</script>

<template>
  <div class="eleven" :class="`eleven--${state}`">
    <span :id="`${uid}-title`" class="eleven__title">{{ t('overlay.voice.engineLabel') }}</span>
    <div
      class="eleven__engines"
      role="radiogroup"
      :aria-labelledby="`${uid}-title`"
      @keydown="onRadioKeydown"
    >
      <button
        v-for="option in CHOICES"
        :key="option"
        class="eleven__engine"
        :class="{ 'eleven__engine--on': picked === option }"
        type="button"
        role="radio"
        :aria-checked="picked === option"
        :tabindex="picked === option ? 0 : -1"
        @click="use(option)"
      >
        {{ t(CHOICE_LABEL[option]) }}
      </button>
    </div>

    <p class="eleven__using" role="status">
      <template v-if="waitingForKey">
        {{ t(current === 'off' ? 'overlay.voice.needsKey' : 'overlay.voice.needsKeyMeanwhile') }}
      </template>
      <template v-else-if="current === 'off'">{{ t('overlay.voice.usingNone') }}</template>
      <template v-else-if="engine === 'elevenlabs'">
        {{ t('overlay.voice.usingElevenLabs', { voice: voiceName }) }}
      </template>
      <template v-else>{{ t('overlay.voice.usingOpenAi', { voice: voiceName }) }}</template>
      <button
        v-if="choosable && !waitingForKey"
        class="eleven__link"
        type="button"
        @click="emit('choose')"
      >
        {{ t('overlay.voice.chooseVoice') }}
      </button>
    </p>

    <template v-if="picked === 'elevenlabs'">
      <label class="eleven__label" :for="`${uid}-key`">{{ t('overlay.voice.keyLabel') }}</label>
      <div class="eleven__box">
        <input
          :id="`${uid}-key`"
          v-model.trim="settings.voiceKey"
          class="eleven__input"
          :type="visible ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="sk_…"
          :aria-invalid="state === 'error'"
          :aria-describedby="`${uid}-status`"
        />
        <span class="eleven__check" aria-hidden="true">✓</span>
        <button
          class="eleven__toggle"
          type="button"
          :aria-pressed="visible"
          @click="visible = !visible"
        >
          {{ visible ? t('start.key.hide') : t('start.key.show') }}
        </button>
      </div>
      <p :id="`${uid}-status`" class="eleven__help">
        <template v-if="state === 'empty'">
          {{ t('overlay.voice.keyHelp') }}
          <a :href="KEY_PAGE" target="_blank" rel="noopener noreferrer">{{
            t('overlay.voice.getKey')
          }}</a>
        </template>
        <template v-else-if="state === 'short'">{{ t('overlay.voice.keyShort') }}</template>
        <template v-else-if="state === 'loading'">{{ t('overlay.voice.loading') }}</template>
        <template v-else-if="state === 'error' && error">{{ t(error) }}</template>
        <template v-else-if="limited">{{ t('overlay.voice.keyLimited') }}</template>
        <template v-else>
          {{ t('overlay.voice.keyWorks', { count: voices.length }, voices.length) }}
        </template>
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
// Same look as the main key (ApiKeyField): a segmented control, then the key box
.eleven {
  display: grid;
  gap: 8px;

  &__title {
    color: var(--fg);
    font: 600 13px var(--font-ui);
  }

  &__engines {
    display: inline-flex;
    gap: 2px;
    width: fit-content;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
  }

  &__engine {
    padding: 4px 10px;
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    background: none;
    color: var(--muted);
    font: 500 12px var(--font-ui);
    cursor: pointer;
    transition:
      background-color 0.12s,
      color 0.12s;

    &:hover {
      color: var(--fg);
    }

    &--on,
    &--on:hover {
      background: var(--accent-fill);
      box-shadow: var(--shadow-sm);
      color: #fff;
      font-weight: 600;
    }
  }

  &__label {
    margin-top: 4px;
    color: var(--fg);
    font: 600 12.5px var(--font-ui);
  }

  &__using {
    margin: 0;
    color: var(--fg);
    font-size: 12.5px;
  }

  &__link {
    margin-left: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  &__box {
    display: flex;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    transition:
      border-color 0.12s,
      box-shadow 0.12s;

    &:focus-within {
      border-color: var(--accent);
      box-shadow: var(--shadow-focus);
    }
  }

  &--ready &__box {
    border-color: var(--success);
  }

  &--error &__box {
    border-color: var(--danger);
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: 400 13px var(--font-mono);
    outline: none;

    &::placeholder {
      color: var(--subtle);
    }

    // Edge adds its own reveal icon; the Show button does that already
    &::-ms-reveal {
      display: none;
    }
  }

  &__check {
    color: var(--success);
    font-weight: 600;
    opacity: 0;
  }

  &--ready &__check {
    opacity: 1;
  }

  &__toggle {
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 500 12px var(--font-ui);
    cursor: pointer;

    &:hover {
      color: var(--fg);
    }
  }

  &__help {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;

    a {
      color: var(--accent);
    }
  }

  &--ready &__help {
    color: var(--success);
  }

  &--error &__help {
    color: var(--danger);
  }
}
</style>
