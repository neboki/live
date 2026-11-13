<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { costUsd, formatEur, usdToEur, useSessionRecord } from '@/modules/session';
import { LanguageSelect, useSettingsStore } from '@/modules/settings';
import { useQuickControls } from '../../composables/useQuickControls';
import { NEAR_SPEND_LIMIT } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';
import ListeningBadge from '../ListeningBadge/ListeningBadge.vue';
import QuickStepper from '../QuickStepper/QuickStepper.vue';

/** From this delay on the captions are running behind, and the bar says so */
const SLOW_LATENCY_MS = 8000;

/**
 * Top row of the caption bar. The same six controls wherever the bar is, always in the
 * same order: Pause, Volume, Text size, Settings, Float / Back and Stop. Everything else
 * is in the settings. Beside them, whether it is listening (big) and the languages.
 */
defineProps<{
  /** A real session: the target language can be changed from the language pill */
  live?: boolean;
  popped?: boolean;
  canPopOut?: boolean;
  menuOpen?: boolean;
  /** A live session: offers Stop */
  stoppable?: boolean;
  /** The bar fills the page: there is room to name each button */
  page?: boolean;
  /** The session stopped on an error: the listening light turns red */
  error?: boolean;
}>();

const emit = defineEmits<{ 'toggle-menu': []; 'toggle-pop': []; stop: [] }>();

const store = useOverlayStore();
const settings = useSettingsStore();
const record = useSessionRecord();
const quick = useQuickControls();
const { t, locale } = useI18n();

const latencyLabel = computed(() => {
  if (store.latencyMs === null) return '— s';
  const seconds = new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(store.latencyMs / 1000);
  return `${seconds} s`;
});

const slow = computed(() => (store.latencyMs ?? 0) >= SLOW_LATENCY_MS);

/** The cost is in the settings; the bar only shows it once the spending limit is close */
const nearLimit = computed(() => {
  const limit = settings.spendLimitEur;
  return limit !== null && usdToEur(costUsd(record.usage)) >= limit * NEAR_SPEND_LIMIT;
});
const costLabel = computed(() => formatEur(costUsd(record.usage), locale.value));
</script>

<template>
  <header
    class="bar-header"
    :class="{
      'bar-header--min': store.minimized,
      'bar-header--popped': popped,
      'bar-header--page': page,
    }"
  >
    <ListeningBadge :error="error" />
    <!-- In the floating window the languages are in its title bar; a live session keeps the picker -->
    <span v-if="!popped || live" class="bar-header__pair">
      {{ store.pair.from }}
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 6h7.5M7 3.5 9.5 6 7 8.5" />
      </svg>
      <LanguageSelect v-if="live" compact />
      <template v-else>{{ store.pair.to }}</template>
    </span>
    <!-- Only when the captions are running behind -->
    <span
      v-if="store.latencyMs !== null && slow"
      class="bar-header__latency"
      :title="t('overlay.slow')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M9.5 1 3 9h4.5l-1 6L13 7H8.5z" fill="currentColor" />
      </svg>
      {{ latencyLabel }}
    </span>
    <span
      v-if="live && nearLimit"
      class="bar-header__cost"
      :title="t('overlay.cost.nearLimit')"
      :aria-label="t('overlay.cost.label', { cost: costLabel })"
    >
      ≈ {{ costLabel }}
    </span>

    <div class="bar-header__actions">
      <!-- 1 · Pause -->
      <button
        type="button"
        :title="store.paused ? t('overlay.resume') : t('overlay.pause')"
        :aria-label="store.paused ? t('overlay.resume') : t('overlay.pause')"
        :aria-pressed="store.paused"
        @click="store.paused = !store.paused"
      >
        <svg v-if="store.paused" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.5 3.2v9.6a.6.6 0 0 0 .9.5l7.7-4.8a.6.6 0 0 0 0-1L5.4 2.7a.6.6 0 0 0-.9.5z" />
        </svg>
        <svg v-else viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="4" y="3" width="2.6" height="10" rx="1" />
          <rect x="9.4" y="3" width="2.6" height="10" rx="1" />
        </svg>
        <span v-if="page" class="bar-header__text">
          {{ store.paused ? t('overlay.resume') : t('overlay.pause') }}
        </span>
      </button>

      <template v-if="!store.minimized">
        <!-- 2 · Volume: the speaker turns the voice on or off, − + set how loud -->
        <QuickStepper
          :label="t('overlay.quick.volume')"
          :down-label="t('overlay.quick.quieter')"
          :up-label="t('overlay.quick.louder')"
          :can-down="quick.canQuieter.value"
          :can-up="quick.canLouder.value"
          :value="quick.volumeLabel.value"
          :toggle-label="store.options.voice ? t('overlay.voiceOff') : t('overlay.voiceOn')"
          :pressed="store.options.voice"
          :named="page"
          @toggle="quick.toggleVoice"
          @down="quick.quieter"
          @up="quick.louder"
        >
          <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 6h2l3-2.5v9l-3-2.5h-2z" />
            <template v-if="store.options.voice">
              <path d="M10.2 6a2.8 2.8 0 0 1 0 4" />
              <path d="M12.2 4.3a5.2 5.2 0 0 1 0 7.4" />
            </template>
            <path v-else d="m10.5 6.2 3 3.6m0-3.6-3 3.6" />
          </svg>
        </QuickStepper>

        <!-- 3 · Text size -->
        <QuickStepper
          :label="t('overlay.quick.text')"
          :down-label="t('overlay.look.smaller')"
          :up-label="t('overlay.look.larger')"
          :can-down="quick.canSmaller.value"
          :can-up="quick.canBigger.value"
          :value="quick.scaleLabel.value"
          :named="page"
          @down="quick.smaller"
          @up="quick.bigger"
        >
          <span class="bar-header__glyph">Aa</span>
        </QuickStepper>

        <!-- 4 · Settings -->
        <button
          type="button"
          :title="t('overlay.options.title')"
          :aria-label="t('overlay.options.title')"
          :aria-expanded="menuOpen"
          aria-haspopup="dialog"
          aria-controls="lg-menu"
          @click="emit('toggle-menu')"
        >
          <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
            <circle cx="10" cy="4.5" r="1.5" />
            <circle cx="6" cy="11.5" r="1.5" />
          </svg>
          <span v-if="page" class="bar-header__text">{{ t('overlay.options.title') }}</span>
        </button>
      </template>

      <!-- 5 · Float / back to the page -->
      <button
        v-if="canPopOut || popped"
        type="button"
        :title="popped ? t('overlay.popIn') : t('overlay.popOut')"
        :aria-label="popped ? t('overlay.popIn') : t('overlay.popOut')"
        @click="emit('toggle-pop')"
      >
        <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="2" />
          <rect
            v-if="!popped"
            x="8"
            y="8"
            width="4"
            height="3"
            rx=".6"
            fill="currentColor"
            stroke="none"
          />
          <path v-else d="M6 8h4M8 6v4" />
        </svg>
        <span v-if="page" class="bar-header__text">
          {{ popped ? t('overlay.back') : t('overlay.float') }}
        </span>
      </button>

      <!-- 6 · Stop: red and always last -->
      <button
        v-if="stoppable"
        class="bar-header__stop"
        type="button"
        :title="t('live.stop')"
        :aria-label="t('live.stop')"
        @click="emit('stop')"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.5" />
        </svg>
        <span v-if="page" class="bar-header__text">{{ t('live.stop') }}</span>
      </button>

      <!-- The previews float over the page: they fold down instead -->
      <button
        v-if="!popped && !page"
        type="button"
        :title="store.minimized ? t('overlay.expand') : t('overlay.minimize')"
        :aria-label="store.minimized ? t('overlay.expand') : t('overlay.minimize')"
        @click="store.minimized = !store.minimized"
      >
        <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" />
          <path v-if="store.minimized" d="M8 3.5v9" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped lang="scss">
@use '../../styles/glass-buttons' as buttons;

// Quiet by default, colourful on contact: the tints come from the bar's theme
.bar-header {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
  min-width: 0;
  min-height: 32px;
  color: var(--glass-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  transition: opacity 0.4s ease;

  // A gradient border drawn by two backgrounds
  &__pair {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    padding: 3px 10px;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background:
      linear-gradient(rgb(var(--glass-rgb)), rgb(var(--glass-rgb))) padding-box,
      linear-gradient(90deg, rgb(var(--tint-a)), rgb(var(--tint-b))) border-box;
    color: var(--glass-fg);
    font-family: var(--font-mono);
    font-weight: 500;
    letter-spacing: 0.02em;
    white-space: nowrap;

    svg {
      width: 10px;
      height: 10px;
      fill: none;
      stroke: rgb(var(--tint-b));
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.6;
    }
  }

  // Running behind, or close to the spending limit: amber, so a glance tells
  &__latency,
  &__cost {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    color: #ffc266;
    font-family: var(--font-mono);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    white-space: nowrap;

    svg {
      width: 10px;
      height: 10px;
    }
  }

  &--min &__pair,
  &--min &__latency,
  &--min &__cost {
    display: none;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    margin-left: auto;

    > button {
      @include buttons.round;
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }

  &__glyph {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
  }

  // In the page there is room to name the buttons: pills with an icon and a word.
  // A narrow screen keeps the icons alone, side by side.
  &--page &__actions {
    gap: 6px;

    > button {
      display: inline-flex;
      gap: 7px;
      width: auto;
      padding: 0 13px 0 11px;
      border-radius: var(--radius-pill);
      color: rgb(255 255 255 / 85%);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    @media (width < 600px) {
      > button {
        justify-content: center;
        width: auto;
        padding: 0;
        aspect-ratio: 1;
      }
    }
  }

  // A narrow floating window keeps every control on one line: the numbers go to the tooltip
  &--popped :deep(.stepper__value) {
    @media (width < 520px) {
      display: none;
    }
  }

  &--page &__text,
  &--page :deep(.stepper__label) {
    @media (width < 600px) {
      display: none;
    }
  }

  // Stop: red, so it is never pressed by mistake
  &__actions &__stop {
    background: rgb(255 90 95 / 14%);
    box-shadow: inset 0 0 0 1px rgb(255 90 95 / 35%);
    color: #ff8a8d;

    &:hover {
      background: rgb(255 90 95 / 85%);
      box-shadow: 0 0 16px rgb(255 90 95 / 60%);
      color: #fff;
    }
  }

  &__stroke {
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }
}
</style>
