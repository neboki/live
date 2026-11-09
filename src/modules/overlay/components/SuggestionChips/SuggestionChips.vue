<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Suggestion } from '../../types';

const props = defineProps<{
  suggestions: Suggestion[];
  /** About a talk they are questions to ask, not replies */
  questions?: boolean;
}>();

const { t } = useI18n();
const base = computed(() => (props.questions ? 'overlay.questions' : 'overlay.suggestions'));
</script>

<template>
  <section class="panel" :aria-label="t(`${base}.title`)">
    <header class="panel__head">
      {{ t(`${base}.title`) }}
      <span v-if="suggestions.length" class="panel__count">{{ suggestions.length }}</span>
    </header>
    <div v-if="suggestions.length" class="panel__body" tabindex="0">
      <TransitionGroup tag="div" name="chip" class="panel__chips">
        <div
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.mine"
          class="chip"
          :style="{ '--i': index }"
        >
          {{ suggestion.mine }}
          <small class="chip__theirs">{{ suggestion.theirs }}</small>
        </div>
      </TransitionGroup>
    </div>
    <span v-else class="panel__empty">{{ t(`${base}.empty`) }}</span>
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

  &__body {
    @include info-panel.body;

    outline: none;
  }

  &__chips {
    display: grid;
    gap: 5px;
  }

  &__empty {
    @include info-panel.empty;
  }
}

.chip {
  padding: 5px 9px;
  border-radius: var(--radius);
  background: var(--glass-hover);
  font-size: calc(12.5px * var(--scale));
  line-height: 1.35;

  &__theirs {
    display: block;
    margin-top: 1px;
    color: var(--glass-muted);
    font-family: var(--font-cjk), var(--font-ui);
    font-size: calc(11.5px * var(--scale));
  }
}

// Chips pop in one after another
.chip-enter-active {
  transition:
    opacity 0.3s ease,
    transform 0.5s var(--ease-spring);
  transition-delay: calc(var(--i) * 70ms);
}

.chip-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.94);
}

.chip-leave-active {
  display: none;
}
</style>
