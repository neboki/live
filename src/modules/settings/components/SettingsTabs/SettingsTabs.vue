<script setup lang="ts" generic="T extends string">
import { nextTick, ref } from 'vue';

interface SettingsTab<Id extends string = string> {
  id: Id;
  icon: string;
  label: string;
}

/**
 * The settings page's sections: a column beside the content on a computer, a row that
 * scrolls sideways on a phone. One tab stop; the arrow keys, Home and End move between
 * tabs (the WAI-ARIA tabs pattern, selection follows focus).
 */
const props = defineProps<{
  tabs: readonly SettingsTab<T>[];
  /** Accessible name of the list */
  label: string;
  /** Prefix of the ids, shared with the panels they control */
  idPrefix: string;
}>();
const active = defineModel<T>({ required: true });
const buttons = ref<HTMLButtonElement[]>([]);

const STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

function onKey(event: KeyboardEvent, index: number): void {
  const count = props.tabs.length;
  let next: number | null = null;
  if (event.key in STEP) next = (index + (STEP[event.key] ?? 0) + count) % count;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = count - 1;
  if (next === null) return;
  const target = next;
  event.preventDefault();
  const tab = props.tabs[target];
  if (!tab) return;
  active.value = tab.id;
  void nextTick(() => buttons.value[target]?.focus());
}
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <button
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      :key="tab.id"
      ref="buttons"
      class="tabs__tab"
      type="button"
      role="tab"
      :aria-selected="active === tab.id"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="active === tab.id ? 0 : -1"
      @click="active = tab.id"
      @keydown="onKey($event, index)"
    >
      <span class="tabs__icon" aria-hidden="true">{{ tab.icon }}</span>
      <span class="tabs__label">{{ tab.label }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.tabs {
  display: flex;
  flex-direction: column;
  gap: 2px;

  // A phone: one row that scrolls sideways, edge to edge
  @media (width <= 860px) {
    flex-direction: row;
    gap: 6px;
    padding-bottom: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  &__tab {
    display: flex;
    flex: none;
    gap: 10px;
    align-items: center;
    min-height: 40px;
    padding: 8px 14px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--muted);
    font: 500 14px var(--font-ui);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;

    &:hover {
      background: var(--panel);
      color: var(--fg);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &[aria-selected='true'] {
      border-color: var(--line);
      background: var(--panel);
      color: var(--fg);
      font-weight: 600;
      box-shadow: var(--shadow-xs);
    }

    @media (width <= 860px) {
      min-height: 44px;
      border-color: var(--line);
      border-radius: var(--radius-pill);
    }
  }

  &__icon {
    width: 1.3em;
    text-align: center;
  }
}
</style>
