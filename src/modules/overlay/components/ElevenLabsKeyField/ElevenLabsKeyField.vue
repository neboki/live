<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/modules/settings';
import { KEY_PAGE } from '@/shared/providers/elevenlabs/config';
import {
  MIN_ELEVENLABS_KEY_CHARS,
  useElevenLabsVoices,
} from '../../composables/useElevenLabsVoices';

type KeyState = 'empty' | 'short' | 'loading' | 'error' | 'ready';

const emit = defineEmits<{
  /** The key works: take the person to the voices to pick one */
  choose: [];
}>();

/**
 * The optional ElevenLabs key on its own card, next to the OpenAI key, so it is found
 * without opening the voice gallery. It says at once whether the key works (by loading the
 * account's voices) and offers the way to pick one of them.
 */
const settings = useSettingsStore();
const { t } = useI18n();
const uid = useId();
const visible = ref(false);
const { voices, loading, error } = useElevenLabsVoices(() => settings.voiceKey);

const state = computed<KeyState>(() => {
  const key = settings.voiceKey.trim();
  if (!key) return 'empty';
  if (key.length < MIN_ELEVENLABS_KEY_CHARS) return 'short';
  if (loading.value) return 'loading';
  if (error.value) return 'error';
  return voices.value.length > 0 ? 'ready' : 'loading';
});
const using = computed(() => settings.tts.engine === 'elevenlabs');
</script>

<template>
  <div class="eleven" :class="`eleven--${state}`">
    <label class="eleven__label" :for="`${uid}-key`">
      {{ t('overlay.voice.key') }}
      <small>{{ t('overlay.voice.keyHelp') }}</small>
    </label>
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
      <button
        class="eleven__toggle"
        type="button"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        {{ visible ? t('start.key.hide') : t('start.key.show') }}
      </button>
    </div>
    <p :id="`${uid}-status`" class="eleven__status" role="status">
      <template v-if="state === 'empty'">
        {{ t('overlay.voice.keySteps') }}
        <a :href="KEY_PAGE" target="_blank" rel="noopener noreferrer">{{
          t('overlay.voice.getKey')
        }}</a>
      </template>
      <template v-else-if="state === 'short'">{{ t('overlay.voice.keyShort') }}</template>
      <template v-else-if="state === 'loading'">{{ t('overlay.voice.loading') }}</template>
      <template v-else-if="state === 'error' && error">{{ t(error) }}</template>
      <template v-else>
        {{
          using
            ? t('overlay.voice.keyInUse')
            : t('overlay.voice.keyWorks', { count: voices.length }, voices.length)
        }}
      </template>
    </p>
    <button v-if="state === 'ready'" class="eleven__choose" type="button" @click="emit('choose')">
      {{ t('overlay.voice.chooseVoice') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.eleven {
  display: grid;
  gap: 8px;

  &__label {
    display: grid;
    gap: 2px;
    color: var(--fg);
    font: 600 13px var(--font-ui);

    small {
      color: var(--muted);
      font-weight: 400;
      font-size: 12px;
    }
  }

  &__box {
    display: flex;
    gap: 6px;
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--fg);
    font: 13px var(--font-mono);

    // Edge adds its own reveal button; the Show button next to it does that already
    &::-ms-reveal {
      display: none;
    }
  }

  &--ready &__input {
    border-color: var(--success);
  }

  &--error &__input {
    border-color: var(--danger);
  }

  &__toggle {
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
    color: var(--fg);
    font: 500 12px var(--font-ui);
    cursor: pointer;
  }

  &__status {
    margin: 0;
    color: var(--muted);
    font-size: 12px;

    a {
      color: var(--accent);
    }
  }

  &--ready &__status {
    color: var(--success);
  }

  &--error &__status {
    color: var(--danger);
  }

  &__choose {
    width: fit-content;
    padding: 8px 14px;
    border: 0;
    border-radius: var(--radius);
    background: var(--accent-fill);
    color: #fff;
    font: 600 13px var(--font-ui);
    cursor: pointer;
  }
}
</style>
