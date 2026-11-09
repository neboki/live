<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFloatingWindow } from '@/modules/overlay';
import {
  BRANDS,
  BRAND_IDS,
  applyBrand,
  brandId,
  setBrand,
  type BrandId,
} from '@/shared/brand/brand';

/**
 * Whose name, logo and colours the app wears, for the whole app and the floating window.
 * The choice is remembered across visits. Hidden while there is only one brand.
 */
const { t } = useI18n();
const floating = useFloatingWindow();

const current = computed({
  get: (): BrandId => brandId.value,
  set: (value: BrandId) => {
    setBrand(value);
    const pipRoot = floating.pipWindow?.document.documentElement;
    if (pipRoot) applyBrand(value, pipRoot);
  },
});
</script>

<template>
  <label v-if="BRAND_IDS.length > 1" class="lg-inline-select" :title="t('nav.brand.label')">
    <svg class="lg-inline-select__icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 3h8l4 4v10H4z" />
      <path d="M7 10h6M7 13h4" />
    </svg>
    <span class="lg-inline-select__value" aria-hidden="true">{{ BRANDS[current].name }}</span>
    <select v-model="current" class="lg-inline-select__select" :aria-label="t('nav.brand.label')">
      <option v-for="option in BRAND_IDS" :key="option" :value="option">
        {{ BRANDS[option].name }}
      </option>
    </select>
  </label>
</template>
