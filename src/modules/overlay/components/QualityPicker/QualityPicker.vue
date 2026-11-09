<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onRadioKeydown, radioTabIndex } from '../../composables/radioGroup';
import { useSettingsStore, type QualityTier } from '@/modules/settings';
import { QUALITY_TIERS, TIER_COST_PER_HOUR } from '@/shared/providers/openai/config';

/**
 * Low cost, medium, premium or interpreter: sets the four models of a tier at once. None is
 * selected when the models were changed by hand in the "Models" section.
 */
const settings = useSettingsStore();
const { t, locale } = useI18n();

function costLabel(tier: QualityTier): string {
  const cost = new Intl.NumberFormat(locale.value, {
    style: 'currency',
    currency: 'USD',
  }).format(TIER_COST_PER_HOUR[tier]);
  return t('overlay.quality.perHour', { cost });
}
</script>

<template>
  <div class="lg-segment" role="radiogroup" :aria-label="t('overlay.quality.title')">
    <span class="lg-segment__title quality__title">{{ t('overlay.quality.title') }}</span>
    <div class="lg-segment__options" @keydown="onRadioKeydown">
      <button
        v-for="(tier, index) in QUALITY_TIERS"
        :key="tier"
        class="lg-segment__option"
        type="button"
        role="radio"
        :aria-checked="settings.tier === tier"
        :tabindex="radioTabIndex(settings.tier === tier, index === 0, settings.tier !== null)"
        @click="settings.applyTier(tier)"
      >
        {{ t(`overlay.quality.${tier}`) }}
        <small>{{ costLabel(tier) }}</small>
      </button>
    </div>
    <small v-if="settings.tier === null" class="lg-segment__hint">
      {{ t('overlay.quality.custom') }}
    </small>
    <small v-else-if="settings.tier === 'interpreter'" class="lg-segment__hint">
      {{ t('overlay.quality.interpreterHint') }}
    </small>
  </div>
</template>
