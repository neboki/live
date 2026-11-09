<script setup lang="ts">
import { useI18n } from 'vue-i18n';

/** Floating pill over the captions that scrolls back to the sentence being said. */
defineProps<{ visible?: boolean }>();

const emit = defineEmits<{ jump: [] }>();

const { t } = useI18n();
</script>

<template>
  <Transition name="latest">
    <button v-if="visible" class="latest" type="button" @click="emit('jump')">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>
      {{ t('overlay.latest') }}
    </button>
  </Transition>
</template>

<style scoped lang="scss">
// Shown once the user scrolled up: one tap back to what is being said now
.latest {
  position: absolute;
  right: 14px;
  bottom: 8px;
  z-index: 1;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 12px 6px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: linear-gradient(120deg, rgb(var(--tint-a)), rgb(var(--tint-b)));
  box-shadow:
    0 6px 18px rgb(var(--tint-a) / 45%),
    inset 0 1px 0 rgb(255 255 255 / 30%);
  color: #fff;
  font: 600 12px var(--font-ui);
  text-shadow: none;
  cursor: pointer;
  transition: transform 0.3s var(--ease-spring);

  &:hover {
    transform: translateY(-1px) scale(1.04);
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
}

.latest-enter-active,
.latest-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s var(--ease-out);
}

.latest-enter-from,
.latest-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
