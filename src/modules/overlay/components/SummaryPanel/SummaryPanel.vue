<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  points: string[];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="panel" :aria-label="t('overlay.summary.title')">
    <header class="panel__head">
      {{ t('overlay.summary.title') }}
      <span v-if="points.length" class="panel__count">{{ points.length }}</span>
    </header>
    <div v-if="points.length" class="panel__body" tabindex="0">
      <TransitionGroup tag="ul" name="point" class="panel__points">
        <li v-for="point in points" :key="point" class="point">{{ point }}</li>
      </TransitionGroup>
    </div>
    <span v-else class="panel__empty">{{ t('overlay.summary.empty') }}</span>
  </section>
</template>

<style scoped lang="scss">
@use '../../styles/info-panel';

.panel {
  @include info-panel.card;

  &__head {
    @include info-panel.head;
  }

  &__count {
    @include info-panel.count;
  }

  // Reversed column keeps the scroll pinned to the newest point
  &__body {
    @include info-panel.body;

    display: flex;
    flex-direction: column-reverse;
    outline: none;
  }

  &__points {
    position: relative;
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__empty {
    @include info-panel.empty;
  }
}

.point {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: calc(12.5px * var(--scale));
  line-height: 1.4;
  opacity: 0.88;

  &::before {
    content: '';
    flex: none;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--glass-accent);
    transform: translateY(-2px);
  }
}

// New points slide in; old ones glide up as they leave
.point-move,
.point-enter-active {
  transition:
    opacity 0.4s ease,
    transform 0.5s var(--ease-spring);
}

.point-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.point-leave-active {
  position: absolute;
  opacity: 0;
}
</style>
