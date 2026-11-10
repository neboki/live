<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOverlayStore } from '../../store/useOverlayStore';

type BadgeState = 'listening' | 'paused' | 'error';

/**
 * Whether the app is listening, big enough to tell at a glance: a light that beats and
 * swells with the sound while listening, grey and still when paused, red with a warning
 * sign when the session stopped on an error. The word and the shape say it too, so the
 * colour is never the only clue.
 */
const props = defineProps<{
  /** The session ended on an error: the bar shows it below */
  error?: boolean;
  /** On the page itself (light or dark), not on the bar's dark glass */
  onPage?: boolean;
}>();

const store = useOverlayStore();
const { t } = useI18n();

const state = computed<BadgeState>(() => {
  if (props.error) return 'error';
  return store.paused ? 'paused' : 'listening';
});

const LABELS: Readonly<Record<BadgeState, string>> = {
  listening: 'overlay.listening',
  paused: 'overlay.paused',
  error: 'overlay.stopped',
};
</script>

<template>
  <span
    class="badge"
    :class="[`badge--${state}`, { 'badge--page': onPage }]"
    :title="t(`overlay.badge.${state}`)"
  >
    <span class="badge__light" aria-hidden="true">
      <template v-if="state === 'paused'">⏸</template>
      <template v-else-if="state === 'error'">!</template>
    </span>
    <span class="badge__label">{{ t(LABELS[state]) }}</span>
  </span>
</template>

<style scoped lang="scss">
// The bar's level (--level, 0 to 1) comes from the bar itself
.badge {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  padding: 5px 13px 5px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;

  &__light {
    position: relative;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;

    // The ring that swells with the sound
    &::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      opacity: 0;
    }
  }

  &--listening {
    background: rgb(46 204 113 / 16%);
    box-shadow: inset 0 0 0 1px rgb(46 204 113 / 45%);
    color: #7ef0aa;

    .badge__light {
      background: #2ecc71;
      animation: beat 1.4s ease-in-out infinite;

      &::after {
        border: 2px solid rgb(46 204 113 / 70%);
        opacity: calc(0.25 + var(--level, 0) * 0.75);
        transform: scale(calc(1 + var(--level, 0) * 0.25));
        transition:
          transform 0.12s linear,
          opacity 0.12s linear;
      }
    }
  }

  &--paused {
    background: rgb(255 255 255 / 8%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%);
    color: var(--glass-muted);

    .badge__light {
      background: #8b8f98;
      font-size: 8px;
    }
  }

  &--error {
    background: rgb(255 90 95 / 16%);
    box-shadow: inset 0 0 0 1px rgb(255 90 95 / 50%);
    color: #ff9b9e;

    .badge__light {
      background: #ff5a5f;
      animation: blink 1.6s ease-in-out infinite;
    }
  }

  // On the page the word takes the page's own text colour, readable in light and dark
  &--page {
    font-size: 13px;
  }

  &--page.badge--listening,
  &--page.badge--error {
    color: var(--fg);
  }

  &--page.badge--paused {
    background: var(--panel);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    &__light,
    &__light::after {
      animation: none !important;
      transition: none !important;
    }
  }
}

@keyframes beat {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(46 204 113 / 60%);
  }

  50% {
    box-shadow: 0 0 0 6px rgb(46 204 113 / 0%);
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}
</style>
