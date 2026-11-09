<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useOverlayStore } from '../../store/useOverlayStore';

/**
 * Clears the screen and starts the conversation over (captions, voices, summary,
 * suggestions) without ending the session. The exported record keeps everything.
 */
const store = useOverlayStore();
const { t } = useI18n();
</script>

<template>
  <button class="start-over" type="button" @click="store.clearConversation()">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.8 2.5v2.8h2.8" />
    </svg>
    <span class="start-over__text">
      {{ t('overlay.startOver.label') }}
      <small>{{ t('overlay.startOver.hint') }}</small>
    </span>
  </button>
</template>

<style scoped lang="scss">
// A quick action, so it sits first in the settings, tinted by the bar's theme
.start-over {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-md);
  background: rgb(var(--tint-a) / 14%);
  color: var(--glass-fg);
  font: 500 13px var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgb(var(--tint-a) / 26%);
  }

  &:focus-visible {
    outline: 2px solid rgb(var(--tint-b));
    outline-offset: 1px;
  }

  svg {
    flex: none;
    width: 16px;
    height: 16px;
    fill: none;
    stroke: rgb(var(--tint-b));
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }

  &__text {
    display: grid;
    gap: 1px;

    small {
      color: var(--glass-muted);
      font-size: 11.5px;
    }
  }
}
</style>
