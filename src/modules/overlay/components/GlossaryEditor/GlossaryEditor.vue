<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MAX_KEYWORDS } from '@/shared/providers/openai/config';
import { useOverlayStore } from '../../store/useOverlayStore';

/**
 * Names and terms, one per line. They go to the translator and, up to
 * MAX_KEYWORDS, to the transcriber, so the counter shows that limit.
 */
const store = useOverlayStore();
const { t } = useI18n();
const open = ref(false);
const input = ref<HTMLTextAreaElement | null>(null);

const count = computed(
  () =>
    store.glossary
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean).length,
);
const overLimit = computed(() => count.value > MAX_KEYWORDS);

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  input.value?.focus();
}
</script>

<template>
  <div class="glossary lg-disclosure">
    <button
      class="lg-disclosure__toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="lg-glossary"
      @click="toggle"
    >
      <span class="lg-disclosure__text">
        {{ t('overlay.glossary.label') }}
        <small>{{ t('overlay.glossary.hint') }}</small>
      </span>
      <span class="lg-disclosure__chevron" aria-hidden="true">›</span>
    </button>
    <div v-show="open" id="lg-glossary" class="glossary__body">
      <textarea
        ref="input"
        v-model="store.glossary"
        :aria-label="t('overlay.glossary.label')"
        :aria-invalid="overLimit"
        aria-describedby="lg-glossary-limit"
        :placeholder="t('overlay.glossary.placeholder')"
      ></textarea>
      <p
        id="lg-glossary-limit"
        class="glossary__limit"
        :class="{ 'glossary__limit--over': overLimit }"
      >
        {{ count }} / {{ t('overlay.glossary.limit', { max: MAX_KEYWORDS }) }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Toggle row from lg-disclosure; the section it opens
.glossary {
  &__body {
    display: grid;
    gap: 4px;
    padding: 0 8px 6px;

    textarea {
      width: 100%;
      min-height: 54px;
      padding: 6px 8px;
      border: 1px solid var(--glass-line);
      border-radius: var(--radius-sm);
      background: var(--glass-field);
      color: var(--glass-fg);
      font: 400 12.5px var(--font-ui);
      resize: vertical;

      &::placeholder {
        color: var(--glass-muted);
      }

      &[aria-invalid='true'] {
        border-color: #f87171;
      }
    }
  }

  &__limit {
    margin: 0;
    color: var(--glass-muted);
    font-family: var(--font-mono);
    font-size: 10.5px;
    text-align: right;

    &--over {
      color: #f87171;
    }
  }
}
</style>
