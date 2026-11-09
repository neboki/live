<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFloatingWindow } from '@/modules/overlay';
import { THEMES, applyTheme, setTheme, theme, type Theme } from '@/shared/theme/theme';

/**
 * Light, dark or the system's choice, for the whole app and the floating window. The
 * choice is remembered across visits.
 */
const { t } = useI18n();
const floating = useFloatingWindow();

const current = computed({
  get: (): Theme => theme.value,
  set: (value: Theme) => {
    setTheme(value);
    const pipRoot = floating.pipWindow?.document.documentElement;
    if (pipRoot) applyTheme(value, pipRoot);
  },
});
</script>

<template>
  <label class="lg-inline-select" :title="t('nav.theme.label')">
    <svg class="lg-inline-select__icon" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v14a7 7 0 0 0 0-14z" fill="currentcolor" stroke="none" />
    </svg>
    <span class="lg-inline-select__value" aria-hidden="true">{{ t(`nav.theme.${current}`) }}</span>
    <select v-model="current" class="lg-inline-select__select" :aria-label="t('nav.theme.label')">
      <option v-for="option in THEMES" :key="option" :value="option">
        {{ t(`nav.theme.${option}`) }}
      </option>
    </select>
  </label>
</template>
