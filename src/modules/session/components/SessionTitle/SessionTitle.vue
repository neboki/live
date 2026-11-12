<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TITLE_MAX } from '../../utils/sessionFile';

/**
 * The name of the conversation as the title of its page, typed right there: leaving the
 * field or pressing Enter keeps it. Next to it, a button has the AI write another one.
 */
const props = defineProps<{
  title: string;
  /** Shown while it has no name: where the conversation came from */
  fallback: string;
  /** The AI can name it (the person has a key and something was said) */
  canGenerate: boolean;
  generating: boolean;
}>();
const emit = defineEmits<{ rename: [title: string]; generate: [] }>();

const { t } = useI18n();
const draft = ref(props.title);

function save(): void {
  if (draft.value.trim() === props.title) draft.value = props.title;
  else emit('rename', draft.value);
}

function leave(event: Event): void {
  (event.target as HTMLInputElement).blur();
}

/** Escape undoes what was typed and stays on the page, instead of closing it */
function cancel(event: Event): void {
  draft.value = props.title;
  leave(event);
}

// A name written by the AI, or the old one back when keeping the new one failed
watch(
  () => props.title,
  (title) => (draft.value = title),
);
</script>

<template>
  <h1 class="lg-head__title title">
    <input
      v-model="draft"
      class="title__field"
      type="text"
      :maxlength="TITLE_MAX"
      :placeholder="generating ? t('session.view.naming') : fallback"
      :aria-label="t('session.view.rename')"
      :title="t('session.view.rename')"
      @blur="save"
      @keydown.enter="leave"
      @keydown.esc.stop="cancel"
    />
    <button
      v-if="canGenerate"
      class="title__generate"
      :class="{ 'title__generate--busy': generating }"
      type="button"
      :disabled="generating"
      :title="t('session.view.generateName')"
      :aria-label="t('session.view.generateName')"
      @click="emit('generate')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8" />
      </svg>
    </button>
  </h1>
</template>

<style scoped lang="scss">
.title {
  flex: 1 1 240px;
  gap: 4px;
  min-width: 0;

  // Reads as the page title; it only looks like a field once pointed at or typed in
  &__field {
    flex: 1;
    min-width: 0;
    margin-left: -8px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-overflow: ellipsis;

    // As wide as its name, so the button that writes another one sits right after it
    @supports (field-sizing: content) {
      flex: 0 1 auto;
      min-width: 12ch;
      max-width: 100%;
      field-sizing: content;
    }

    &::placeholder {
      color: var(--subtle);
      opacity: 1;
    }

    &:hover {
      border-color: var(--line-strong);
    }

    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__generate {
    display: grid;
    flex: none;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--subtle);
    cursor: pointer;

    svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.4;
    }

    &:hover:not(:disabled) {
      background: var(--panel-2);
      color: var(--accent);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus);
    }

    &--busy svg {
      animation: title-turn 0.9s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      &--busy svg {
        animation: none;
        opacity: 0.5;
      }
    }
  }
}

@keyframes title-turn {
  to {
    transform: rotate(360deg);
  }
}
</style>
