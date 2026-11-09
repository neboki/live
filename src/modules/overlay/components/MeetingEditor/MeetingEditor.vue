<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  languageLabel,
  TARGET_LANGUAGES,
  MAX_MEETING_LANGUAGES,
  useSettingsStore,
} from '@/modules/settings';
import { MAX_TOPIC_CHARS } from '@/shared/providers/openai/config';

/**
 * What the meeting is about and which languages people speak. Both go to the
 * transcriber when a session starts, so it hears names and switches of language
 * better. Left empty, it listens for any language.
 */
const settings = useSettingsStore();
const { t, locale } = useI18n();
const open = ref(false);

const languages = computed(() =>
  TARGET_LANGUAGES.map((code) => ({ code, label: languageLabel(code, locale.value) })).sort(
    (a, b) => a.label.localeCompare(b.label, locale.value),
  ),
);
const full = computed(() => settings.meeting.languages.length >= MAX_MEETING_LANGUAGES);

function isChosen(code: string): boolean {
  return settings.meeting.languages.includes(code);
}

function toggleLanguage(code: string): void {
  const chosen = settings.meeting.languages;
  if (isChosen(code)) settings.meeting.languages = chosen.filter((item) => item !== code);
  else if (!full.value) settings.meeting.languages = [...chosen, code];
}
</script>

<template>
  <div class="meeting lg-disclosure">
    <button
      class="lg-disclosure__toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="lg-meeting"
      @click="open = !open"
    >
      <span class="lg-disclosure__text">
        {{ t('overlay.meeting.label') }}
        <small>{{ t('overlay.meeting.hint') }}</small>
      </span>
      <span class="lg-disclosure__chevron" aria-hidden="true">›</span>
    </button>
    <div v-show="open" id="lg-meeting" class="meeting__body">
      <label class="meeting__field">
        {{ t('overlay.meeting.topic') }}
        <input
          v-model="settings.meeting.topic"
          type="text"
          :maxlength="MAX_TOPIC_CHARS"
          :placeholder="t('overlay.meeting.topicPlaceholder')"
        />
      </label>
      <fieldset class="meeting__languages">
        <legend>{{ t('overlay.meeting.languages', { max: MAX_MEETING_LANGUAGES }) }}</legend>
        <button
          v-for="language in languages"
          :key="language.code"
          class="meeting__chip"
          type="button"
          :aria-pressed="isChosen(language.code)"
          :disabled="full && !isChosen(language.code)"
          @click="toggleLanguage(language.code)"
        >
          {{ language.label }}
        </button>
      </fieldset>
      <p class="meeting__note">{{ t('overlay.meeting.note') }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Toggle row from lg-disclosure; the section it opens
.meeting {
  &__body {
    display: grid;
    gap: 8px;
    padding: 0 8px 6px;
  }

  &__field {
    display: grid;
    gap: 4px;
    color: var(--glass-muted);
    font-size: 11.5px;

    input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--glass-line);
      border-radius: var(--radius-sm);
      background: var(--glass-field);
      color: var(--glass-fg);
      font: 400 12.5px var(--font-ui);

      &::placeholder {
        color: var(--glass-muted);
      }
    }
  }

  &__languages {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    border: 0;

    legend {
      margin-bottom: 4px;
      padding: 0;
      color: var(--glass-muted);
      font-size: 11.5px;
    }
  }

  &__chip {
    padding: 3px 9px;
    border: 1px solid var(--glass-line);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--glass-fg);
    font: 400 12px var(--font-ui);
    cursor: pointer;
    appearance: none;
    transition:
      background 0.15s,
      border-color 0.15s;

    &:hover:not(:disabled) {
      background: var(--glass-hover);
    }

    &[aria-pressed='true'] {
      border-color: var(--glass-accent);
      background: color-mix(in srgb, var(--glass-accent) 25%, transparent);
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: 1px;
    }
  }

  &__note {
    margin: 0;
    color: var(--glass-muted);
    font-size: 11px;
  }
}
</style>
