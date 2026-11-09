<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { costUsd, formatEur, hasUnpricedUsage, useSessionRecord } from '@/modules/session';
import { LanguageSelect } from '@/modules/settings';
import { useOverlayStore } from '../../store/useOverlayStore';

/** From this delay on the captions are running behind, and the bar says so */
const SLOW_LATENCY_MS = 4000;

/** Top row of the caption bar: status, languages, delay and the bar's buttons. */
defineProps<{
  /** A real session: the target language can be changed from the language pill */
  live?: boolean;
  popped?: boolean;
  canPopOut?: boolean;
  menuOpen?: boolean;
  /** A live session's floating window: a Stop button instead of the pop in/out one */
  stoppable?: boolean;
  /**
   * The bar fills the page: only Pause, Float and the settings, with their names. The
   * rest is in the settings, and Stop in the page's header
   */
  page?: boolean;
}>();

const emit = defineEmits<{ 'toggle-menu': []; 'toggle-pop': []; stop: [] }>();

const store = useOverlayStore();
const record = useSessionRecord();
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

/** Running estimate of what this session has cost, in euros */
const costLabel = computed(() =>
  hasUnpricedUsage(record.usage)
    ? t('overlay.cost.unknown')
    : formatEur(costUsd(record.usage), locale.value),
);
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
    <span
      class="bar-header__status"
      :class="{ 'bar-header__status--paused': store.paused }"
      :title="popped ? `${t('overlay.latency')}: ${latencyLabel}` : undefined"
    >
      <i class="bar-header__dot" aria-hidden="true"></i>
      <span class="bar-header__label">
        {{ store.paused ? t('overlay.paused') : t('overlay.listening') }}
      </span>
      <span class="bar-header__eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </span>
    <!-- In the floating window the languages are in its title bar; a live session keeps the picker -->
    <span v-if="!popped || live" class="bar-header__pair">
      {{ store.pair.from }}
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 6h7.5M7 3.5 9.5 6 7 8.5" />
      </svg>
      <LanguageSelect v-if="live" compact />
      <template v-else>{{ store.pair.to }}</template>
    </span>
    <!-- No delay until the first sentence is measured; the floating window only shows it when running behind -->
    <span
      v-if="store.latencyMs !== null && ((!popped && !page) || slow)"
      class="bar-header__latency"
      :class="{ 'bar-header__latency--slow': slow }"
      :title="slow ? t('overlay.slow') : t('overlay.latency')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M9.5 1 3 9h4.5l-1 6L13 7H8.5z" fill="currentColor" />
      </svg>
      {{ latencyLabel }}
    </span>

    <span
      v-if="live"
      class="bar-header__cost"
      :title="t('overlay.cost.hint')"
      :aria-label="t('overlay.cost.label', { cost: costLabel })"
    >
      ≈ {{ costLabel }}
    </span>

    <div class="bar-header__actions">
      <!-- What you hear (original / translated voice) is a quick action: always on the bar -->
      <button
        v-if="store.canHearOriginal && !page"
        type="button"
        :title="store.hearOriginal ? t('overlay.originalOff') : t('overlay.originalOn')"
        :aria-label="t('overlay.original')"
        :aria-pressed="store.hearOriginal"
        @click="store.hearOriginal = !store.hearOriginal"
      >
        <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 8h1.5M5 5v6M8 3v10M11 5.5v5M14 8h-.5" />
          <path v-if="!store.hearOriginal" d="m2.5 2.5 11 11" />
        </svg>
      </button>
      <!-- The picture in step with the captions: a quick action whenever the share allows it -->
      <button
        v-if="store.canSyncVideo && !page"
        type="button"
        :title="store.syncVideo ? t('overlay.sync.off') : t('overlay.sync.on')"
        :aria-label="t('overlay.sync.label')"
        :aria-pressed="store.syncVideo"
        @click="store.syncVideo = !store.syncVideo"
      >
        <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="3" width="13" height="9" rx="1.5" />
          <path d="M5 14.5h6" />
          <path v-if="store.syncVideo" d="M6.8 5.6v3.8L9.8 7.5z" fill="currentColor" />
          <path v-else d="m2.5 2.5 11 11" />
        </svg>
      </button>
      <button
        v-if="!page"
        class="bar-header__voice"
        type="button"
        :title="store.options.voice ? t('overlay.voiceOff') : t('overlay.voiceOn')"
        :aria-label="t('overlay.options.voice.label')"
        :aria-pressed="store.options.voice"
        @click="store.toggleOption('voice')"
      >
        <svg class="bar-header__stroke" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 6h2l3-2.5v9l-3-2.5h-2z" />
          <template v-if="store.options.voice">
            <path d="M10.2 6a2.8 2.8 0 0 1 0 4" />
            <path d="M12.2 4.3a5.2 5.2 0 0 1 0 7.4" />
          </template>
          <path v-else d="m10.5 6.2 3 3.6m0-3.6-3 3.6" />
        </svg>
      </button>
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
      <button
        v-if="!store.minimized"
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
      <button
        v-if="stoppable && !page"
        class="bar-header__stop"
        type="button"
        :title="t('live.stop')"
        :aria-label="t('live.stop')"
        @click="emit('stop')"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.5" />
        </svg>
      </button>
      <!-- Float / back to the page: beside Stop in a live session, so both are always at hand -->
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
        <span v-if="page" class="bar-header__text">{{ t('overlay.float') }}</span>
      </button>
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

  &__status {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    padding: 4px 10px 4px 8px;
    border-radius: var(--radius-pill);
    background: rgb(var(--tint-a) / 14%);
    color: rgb(255 255 255 / 88%);
    text-transform: uppercase;
    white-space: nowrap;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(var(--tint-a));
    box-shadow: 0 0 8px rgb(var(--tint-a));
    animation: pulse 1.6s infinite;
  }

  // Four bars that follow the voice level
  &__eq {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    height: 10px;

    i {
      width: 2px;
      height: 100%;
      border-radius: 1px;
      background: linear-gradient(to top, rgb(var(--tint-a)), rgb(var(--tint-b)));
      transform: scaleY(calc(0.2 + var(--level) * var(--k)));
      transition: transform 0.12s linear;

      &:nth-child(1) {
        --k: 0.6;
      }

      &:nth-child(2) {
        --k: 1;
      }

      &:nth-child(3) {
        --k: 0.75;
      }

      &:nth-child(4) {
        --k: 0.45;
      }
    }
  }

  &__status--paused {
    background: rgb(255 255 255 / 6%);
    color: var(--glass-muted);
  }

  &__status--paused &__dot {
    background: #8b8f98;
    box-shadow: none;
    animation: none;
  }

  &__status--paused &__eq {
    display: none;
  }

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

  &__latency,
  &__cost {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    font-family: var(--font-mono);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    white-space: nowrap;

    svg {
      width: 10px;
      height: 10px;
      color: rgb(var(--tint-b));
    }
  }

  &__cost {
    color: var(--glass-muted);
  }

  // Running behind: amber, so a glance tells the captions are late
  &__latency--slow,
  &__latency--slow svg {
    color: #ffc266;
  }

  &--min &__pair,
  &--min &__latency,
  &--min &__cost {
    display: none;
  }

  // Floating window: the title bar already says it all, so the status is just the light
  &--popped &__label {
    display: none;
  }

  &--popped &__status {
    padding: 6px 8px;
  }

  &__actions {
    display: flex;
    gap: 4px;
    margin-left: auto;

    button {
      @include buttons.round;
    }

    // At rest the buttons step back so the captions lead; reaching for them brings them all up.
    // Stop always stays clear.
    button:not([aria-pressed='true'], [aria-expanded='true'], .bar-header__stop) {
      opacity: 0.6;
      transition:
        opacity 0.25s ease,
        background 0.2s,
        box-shadow 0.25s,
        color 0.15s,
        transform 0.35s var(--ease-spring);
    }

    &:hover button,
    &:focus-within button {
      opacity: 1;
    }

    // Touch has no hover to bring them up: keep them at full strength
    @media (hover: none) {
      button:not([aria-pressed='true'], [aria-expanded='true'], .bar-header__stop) {
        opacity: 1;
      }
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }

  // In the page there is room to name the buttons: pills with an icon and a word,
  // fully clear at rest. A phone keeps the icons alone, side by side.
  &--page &__actions {
    gap: 6px;

    button {
      display: inline-flex;
      gap: 7px;
      width: auto;
      padding: 0 13px 0 11px;
      border-radius: var(--radius-pill);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    button:not([aria-pressed='true'], [aria-expanded='true'], .bar-header__stop) {
      opacity: 1;
      color: rgb(255 255 255 / 85%);
    }

    @media (width < 600px) {
      button {
        justify-content: center;
        width: auto;
        padding: 0;
        aspect-ratio: 1;
      }
    }
  }

  &--page &__text {
    @media (width < 600px) {
      display: none;
    }
  }

  // Ends the live session from the floating window: red, so it is never pressed by mistake
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

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(var(--tint-a) / 55%);
  }

  70% {
    box-shadow: 0 0 0 6px rgb(var(--tint-a) / 0%);
  }

  100% {
    box-shadow: 0 0 0 0 rgb(var(--tint-a) / 0%);
  }
}
</style>
