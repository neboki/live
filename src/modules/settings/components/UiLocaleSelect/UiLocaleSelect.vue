<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@/shared/i18n';

/**
 * Picks the language of the interface itself (not the one captions are translated
 * into). Each option is named in its own language, so a user who landed in the
 * wrong one can still find theirs. The choice is remembered across visits.
 */
const { t, locale } = useI18n();

/** "en" → "English", "es" → "Español": each language named in itself */
function ownName(code: Locale): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}

const options = computed(() => SUPPORTED_LOCALES.map((code) => ({ code, label: ownName(code) })));
const current = computed({
  get: (): Locale => locale.value as Locale,
  set: (value: Locale) => setLocale(value),
});
</script>

<template>
  <label class="ui-lang" :title="t('nav.uiLanguage')">
    <svg class="ui-lang__icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c-2.5 2.5-2.5 11.5 0 14M10 3c2.5 2.5 2.5 11.5 0 14" />
    </svg>
    <span class="ui-lang__value" aria-hidden="true">{{ ownName(current) }}</span>
    <select v-model="current" class="ui-lang__select" :aria-label="t('nav.uiLanguage')">
      <option v-for="option in options" :key="option.code" :value="option.code">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<style scoped lang="scss">
// The native select sits invisible over the visible value: native list, custom look
.ui-lang {
  position: relative;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--subtle);
  font-size: 12.5px;
  cursor: pointer;

  &:hover,
  &:focus-within {
    color: var(--fg);
  }

  &:focus-within &__value {
    text-decoration: underline;
  }

  &__icon {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-width: 1.4;
  }

  &__select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }
}
</style>
