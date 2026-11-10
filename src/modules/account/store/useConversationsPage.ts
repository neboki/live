import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { EMPTY_FILTER, filterHistory, type HistoryFilter } from '../utils/historyFilter';
import { useCloudHistory } from './useCloudHistory';

/**
 * What the conversations page is showing: its filter, whether the search also looks
 * inside what was said, and the conversations ticked. Kept here, not in the page, so
 * opening a conversation and coming back finds everything as it was.
 */
export const useConversationsPage = defineStore('conversations-page', () => {
  const history = useCloudHistory();
  const filter = reactive<HistoryFilter>({ ...EMPTY_FILTER });
  /** Also look for the words in the sentences (reads each conversation once) */
  const inContent = ref(false);
  const selected = ref<string[]>([]);

  const shown = computed(() =>
    filterHistory(history.items, filter, inContent.value ? history.texts : undefined),
  );
  const filtering = computed(
    () =>
      filter.query.trim() !== '' ||
      filter.pair !== '' ||
      filter.starredOnly ||
      filter.fromDay !== '' ||
      filter.toDay !== '',
  );
  const allShownSelected = computed(
    () => shown.value.length > 0 && shown.value.every((item) => selected.value.includes(item.id)),
  );

  function isSelected(id: string): boolean {
    return selected.value.includes(id);
  }

  function toggle(id: string): void {
    selected.value = isSelected(id)
      ? selected.value.filter((other) => other !== id)
      : [...selected.value, id];
  }

  /** Ticks every conversation shown, or unticks them when all already are */
  function toggleAllShown(): void {
    const ids = shown.value.map((item) => item.id);
    selected.value = allShownSelected.value
      ? selected.value.filter((id) => !ids.includes(id))
      : [...new Set([...selected.value, ...ids])];
  }

  function clearSelection(): void {
    selected.value = [];
  }

  function clearFilter(): void {
    Object.assign(filter, { ...EMPTY_FILTER, sort: filter.sort });
  }

  // Searching inside reads what is listed now, and what "load more" brings later
  watch(
    () => [inContent.value, history.items.length] as const,
    ([on]) => {
      if (on) void history.indexContent();
    },
  );
  // A deleted conversation, or another account, leaves nothing ticked behind
  watch(
    () => history.items,
    (items) => {
      const known = new Set(items.map((item) => item.id));
      if (selected.value.some((id) => !known.has(id))) {
        selected.value = selected.value.filter((id) => known.has(id));
      }
    },
  );

  return {
    filter,
    inContent,
    selected,
    shown,
    filtering,
    allShownSelected,
    isSelected,
    toggle,
    toggleAllShown,
    clearSelection,
    clearFilter,
  };
});
