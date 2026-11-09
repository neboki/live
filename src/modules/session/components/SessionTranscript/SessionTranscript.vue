<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SessionLine } from '../../types';
import { clock } from '../../utils/toMarkdown';

/** What was said, with the time and the original under each translation; searchable. */
const props = defineProps<{
  lines: readonly SessionLine[];
}>();

const { t, locale } = useI18n();
const query = ref('');

/** Escape clears the search; empty already, it reaches the view, which closes. */
function onEscape(event: KeyboardEvent): void {
  if (!query.value) return;
  event.stopPropagation();
  query.value = '';
}

const shown = computed<readonly SessionLine[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase(locale.value);
  if (!needle) return props.lines;
  return props.lines.filter((line) =>
    `${line.source}\n${line.translation}`.toLocaleLowerCase(locale.value).includes(needle),
  );
});
</script>

<template>
  <section class="transcript">
    <div class="transcript__head">
      <h2 class="lg-label">{{ t('session.md.transcript') }}</h2>
      <input
        v-if="lines.length"
        v-model="query"
        class="transcript__search"
        type="search"
        :placeholder="t('session.view.search')"
        :aria-label="t('session.view.search')"
        @keydown.esc="onEscape"
      />
    </div>
    <ol v-if="shown.length" class="transcript__lines">
      <li v-for="(line, i) in shown" :key="`${line.at}-${i}`" class="transcript__line">
        <time class="transcript__time">{{ clock(line.at) }}</time>
        <div class="transcript__said">
          <span v-if="line.speaker !== undefined" class="transcript__speaker">
            {{ t('session.view.speaker', { n: line.speaker + 1 }) }}
          </span>
          <p class="transcript__translation">{{ line.translation || line.source }}</p>
          <p v-if="line.translation" class="transcript__source">{{ line.source }}</p>
        </div>
      </li>
    </ol>
    <p v-else class="transcript__empty">
      {{ query ? t('session.view.noMatch') : t('session.view.noLines') }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.transcript {
  // Given a height by the view, the lines scroll inside the card; otherwise it just grows
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-xs);

  h2 {
    margin: 0;
  }

  &__head {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  &__search {
    width: min(260px, 100%);
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--panel-2);
    color: var(--fg);
    font: 13px var(--font-ui);

    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__lines {
    display: grid;
    align-content: start;
    min-height: 0;
    margin: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0;
    list-style: none;
  }

  &__line {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--line-soft);

    &:first-child {
      border-top: 0;
    }
  }

  &__time {
    padding-top: 2px;
    color: var(--subtle);
    font: 12px var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  &__said {
    display: grid;
    gap: 2px;

    p {
      margin: 0;
    }
  }

  &__speaker {
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
  }

  &__translation {
    font-size: 14.5px;
    line-height: 1.5;
  }

  &__source {
    color: var(--subtle);
    font-size: 12.5px;
    line-height: 1.45;
  }

  &__empty {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }
}
</style>
