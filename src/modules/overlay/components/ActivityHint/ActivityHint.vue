<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { CaptionActivity } from '../../types';

/**
 * "Listening…" / "Translating…" under the captions, so a sentence on its way never
 * looks like a stalled bar. Its line is always reserved: showing it moves nothing.
 * Hidden from screen readers, which hear the captions themselves as they arrive.
 */
withDefaults(defineProps<{ activity?: CaptionActivity | null }>(), { activity: null });

const { t } = useI18n();
</script>

<template>
  <p class="activity" :class="{ 'activity--on': activity }" aria-hidden="true">
    <span class="activity__dots"><i></i><i></i><i></i></span>
    <span class="activity__text">{{ activity ? t(`overlay.activity.${activity}`) : '' }}</span>
  </p>
</template>

<style scoped lang="scss">
.activity {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  min-height: 1.3em;
  margin: 0;
  padding-left: 14px;
  color: var(--glass-muted);
  font-size: calc(12px * var(--scale));
  opacity: 0;
  transition: opacity 0.25s ease;

  &--on {
    opacity: 1;
  }

  // Three dots in the theme's tints, bouncing one after another
  &__dots {
    display: inline-flex;
    gap: 3px;

    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgb(var(--tint-a)), rgb(var(--tint-b)));
      animation: hop 1s ease-in-out infinite;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }
}

@keyframes hop {
  0%,
  60%,
  100% {
    opacity: 0.4;
    transform: none;
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
</style>
