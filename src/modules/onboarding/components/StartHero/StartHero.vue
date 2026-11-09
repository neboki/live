<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_TIER, TIER_COST_PER_HOUR } from '@/shared/providers/openai/config';

/**
 * What the app is for, in one look: the promise, what else it does and why it can
 * be trusted. Sits at the top of the start screen, above what to listen to.
 */
const { t, locale } = useI18n();

const cost = computed(() =>
  new Intl.NumberFormat(locale.value, { style: 'currency', currency: 'USD' }).format(
    TIER_COST_PER_HOUR[DEFAULT_TIER],
  ),
);
</script>

<template>
  <section class="hero" aria-labelledby="hero-title">
    <h2 id="hero-title" class="hero__title">{{ t('start.hero.title') }}</h2>
    <p class="hero__lead">{{ t('start.hero.lead') }}</p>
    <p class="hero__extras">{{ t('start.hero.extras') }}</p>
    <p class="hero__trust">{{ t('start.hero.trust', { cost }) }}</p>
  </section>
</template>

<style scoped lang="scss">
.hero {
  display: grid;
  gap: 12px;
  max-width: 880px;

  &__title {
    margin: 0;
    color: var(--fg);
    font-size: clamp(24px, 4vw, 34px);
    font-weight: 650;
    letter-spacing: -0.02em;
    line-height: 1.15;
    text-wrap: balance;
  }

  &__lead {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.5;
    text-wrap: pretty;
  }

  &__extras,
  &__trust {
    margin: 0;
    font-size: 13px;
  }

  &__extras {
    color: var(--muted);
  }

  &__trust {
    color: var(--subtle);
  }
}
</style>
