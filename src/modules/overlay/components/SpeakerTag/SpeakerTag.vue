<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOverlayStore } from '../../store/useOverlayStore';

/** Colours in styles/_speaker-colors.scss */
const COLOURS = 6;

/**
 * Who is speaking: a coloured dot and a neutral name ("Voice 1"), never a guess at
 * who they are. One click turns the name into a field to give them a real one.
 */
const props = defineProps<{
  speaker: number;
}>();

const store = useOverlayStore();
const { t } = useI18n();
const editing = ref(false);
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);

const name = computed(
  () => store.speakerNames[props.speaker] ?? t('overlay.speakers.voice', { n: props.speaker + 1 }),
);
const colour = computed(() => props.speaker % COLOURS);

function edit(): void {
  draft.value = store.speakerNames[props.speaker] ?? '';
  editing.value = true;
  void nextTick(() => input.value?.focus());
}

function save(): void {
  if (!editing.value) return;
  editing.value = false;
  store.setSpeakerName(props.speaker, draft.value);
}
</script>

<template>
  <span class="speaker" :class="`speaker--speaker-${colour}`" data-no-drag>
    <i class="speaker__dot" aria-hidden="true"></i>
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      class="speaker__input"
      type="text"
      maxlength="24"
      :aria-label="t('overlay.speakers.rename')"
      @keydown.enter.prevent="save"
      @keydown.esc.prevent="editing = false"
      @blur="save"
    />
    <button
      v-else
      class="speaker__name"
      type="button"
      :title="t('overlay.speakers.rename')"
      @click="edit"
    >
      {{ name }}
    </button>
  </span>
</template>

<style scoped lang="scss">
@use '../../styles/speaker-colors';

.speaker {
  @include speaker-colors.variants;

  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-right: 8px;
  vertical-align: baseline;

  &__dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(var(--speaker));
    box-shadow: 0 0 8px rgb(var(--speaker) / 60%);
  }

  // Small caps in the voice's colour; a dotted underline says it can be renamed
  &__name,
  &__input {
    padding: 0;
    border: 0;
    background: none;
    color: rgb(var(--speaker));
    font: 600 calc(11px * var(--scale)) var(--font-ui);
    letter-spacing: 0.05em;
    text-shadow: none;
    text-transform: uppercase;
  }

  &__name {
    cursor: pointer;

    &:hover {
      text-decoration: underline dotted;
      text-underline-offset: 3px;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--speaker));
      outline-offset: 2px;
      border-radius: 3px;
    }
  }

  &__input {
    width: 14ch;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    background: rgb(255 255 255 / 10%);
    outline: 1px solid rgb(var(--speaker) / 60%);
    text-transform: none;
  }
}
</style>
