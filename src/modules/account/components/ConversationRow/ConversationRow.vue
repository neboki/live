<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { costUsd, elapsed, formatEur, hasUnpricedUsage } from '@/modules/session';
import { useTwoStep } from '../../composables/useTwoStep';
import { TITLE_MAX, type CloudHistoryItem } from '../../utils/cloudSession';
import { itemDuration, snippet } from '../../utils/historyFilter';

/**
 * One conversation of the account on the conversations page: tick, star, name (renamed
 * in place), its figures and summary, where the search found it, and its actions.
 */
const props = defineProps<{
  item: CloudHistoryItem;
  selected: boolean;
  /** The words searched, to show where they were found in what was said */
  query: string;
  /** What was said, when already read */
  text?: string;
  opening: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  open: [];
  star: [];
  rename: [title: string];
  download: [];
  remove: [];
}>();

const { t, locale } = useI18n();
const editing = ref(false);
const draft = ref('');
const field = ref<HTMLInputElement | null>(null);
const remove = useTwoStep(() => emit('remove'));

const dateLabel = computed(() =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
    props.item.startedAt,
  ),
);
const name = computed(() => props.item.title || dateLabel.value);
const duration = computed(() => {
  const ms = itemDuration(props.item);
  return ms > 0 ? elapsed(ms) : null;
});
const cost = computed(() =>
  hasUnpricedUsage(props.item.usage) ? null : formatEur(costUsd(props.item.usage), locale.value),
);
const preview = computed(() => props.item.summary[0] ?? '');
/** Where the words were found in what was said, when they were not in the name or summary */
const found = computed(() =>
  props.query.trim() && props.text ? snippet(props.text, props.query) : null,
);

async function startRename(): Promise<void> {
  draft.value = props.item.title;
  editing.value = true;
  await nextTick();
  field.value?.focus();
  field.value?.select();
}

function saveRename(): void {
  if (!editing.value) return;
  editing.value = false;
  if (draft.value.trim() !== props.item.title) emit('rename', draft.value);
}

function cancelRename(): void {
  editing.value = false;
}
</script>

<template>
  <li class="row" :class="{ 'row--selected': selected }">
    <input
      class="row__check"
      type="checkbox"
      :checked="selected"
      :aria-label="t('conversations.select', { name })"
      @change="emit('toggle')"
    />
    <button
      class="row__star"
      :class="{ 'row__star--on': item.starred }"
      type="button"
      :aria-pressed="item.starred"
      :aria-label="t(item.starred ? 'conversations.unstar' : 'conversations.star')"
      :title="t(item.starred ? 'conversations.unstar' : 'conversations.star')"
      @click="emit('star')"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="m10 2.8 2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5L2.8 8l5-.6z" />
      </svg>
    </button>

    <div class="row__body">
      <form v-if="editing" class="row__rename" @submit.prevent="saveRename">
        <input
          ref="field"
          v-model="draft"
          class="row__field"
          type="text"
          :maxlength="TITLE_MAX"
          :placeholder="dateLabel"
          :aria-label="t('conversations.nameLabel')"
          @keydown.esc.stop.prevent="cancelRename"
          @blur="saveRename"
        />
      </form>
      <button v-else class="row__name" type="button" :disabled="opening" @click="emit('open')">
        {{ opening ? t('nav.opening') : name }}
      </button>

      <p class="row__meta">
        <span v-if="item.title">{{ dateLabel }}</span>
        <span class="row__mono">{{ item.pair.from || 'AUTO' }} → {{ item.pair.to || '—' }}</span>
        <span v-if="duration" class="row__mono">{{ duration }}</span>
        <span v-else>{{ t('conversations.unfinished') }}</span>
        <span>{{ t('conversations.lines', item.lineCount) }}</span>
        <span v-if="cost" class="row__mono">≈ {{ cost }}</span>
      </p>
      <p v-if="found" class="row__found">
        <span class="lg-label">{{ t('conversations.foundIn') }}</span> {{ found }}
      </p>
      <p v-else-if="preview" class="row__preview">{{ preview }}</p>
    </div>

    <div class="row__actions">
      <button class="lg-btn lg-btn--quiet" type="button" @click="startRename">
        {{ t('conversations.rename') }}
      </button>
      <button class="lg-btn lg-btn--quiet" type="button" :disabled="busy" @click="emit('download')">
        {{ t('conversations.download') }}
      </button>
      <button
        class="lg-btn lg-btn--quiet row__delete"
        :class="{ 'row__delete--armed': remove.armed.value }"
        type="button"
        :disabled="busy"
        @click="remove.press"
      >
        {{ remove.armed.value ? t('account.history.deleteConfirm') : t('conversations.delete') }}
      </button>
      <button class="lg-btn" type="button" :disabled="opening" @click="emit('open')">
        {{ t('conversations.open') }}
      </button>
    </div>
  </li>
</template>

<style scoped lang="scss">
.row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 4px 12px;
  align-items: start;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line-soft);
  transition: background 0.12s ease;

  &:hover {
    background: var(--hover);
  }

  &--selected,
  &--selected:hover {
    background: var(--accent-soft);
  }

  @media (width >= 1100px) {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
  }

  &__check {
    width: 16px;
    height: 16px;
    margin: 3px 0 0;
    accent-color: var(--accent);
    cursor: pointer;

    @media (width >= 1100px) {
      margin: 0;
    }
  }

  &__star {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--subtle);
    cursor: pointer;

    &:hover {
      color: var(--fg);
    }

    svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentcolor;
      stroke-linejoin: round;
      stroke-width: 1.4;
    }

    &--on {
      color: var(--accent);

      svg {
        fill: currentcolor;
      }
    }
  }

  &__body {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  &__name {
    justify-self: start;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font: 600 14.5px var(--font-ui);
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: var(--accent);
    }
  }

  &__rename {
    margin: 0;
  }

  &__field {
    width: min(100%, 480px);
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--fg);
    font: 600 14px var(--font-ui);
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  &__preview,
  &__found {
    margin: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__found {
    white-space: normal;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    grid-column: 3;
    gap: 4px;
    margin-top: 6px;

    @media (width >= 1100px) {
      grid-column: auto;
      justify-content: flex-end;
      margin-top: 0;
    }
  }

  &__delete--armed,
  &__delete--armed:hover:not(:disabled) {
    background: none;
    color: var(--danger);
    box-shadow: inset 0 0 0 1px var(--danger);
  }
}
</style>
