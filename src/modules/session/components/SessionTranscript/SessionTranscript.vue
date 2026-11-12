<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import type { SessionLine } from '../../types';
import { copyText } from '../../utils/copyText';
import { highlightParts, type TextPart } from '../../utils/highlight';
import { clock } from '../../utils/toMarkdown';

/** Which text of each sentence is shown: the translation, what was heard, or both */
type Show = 'both' | 'translation' | 'source';

interface Row {
  key: string;
  time: string;
  speaker: number | undefined;
  main: TextPart[];
  /** What was heard, under its translation; empty when only one of them is shown */
  under: TextPart[];
  plain: string;
}

/**
 * What was said, with the time and the original under each translation. The search marks
 * what it finds; the reader chooses which text to see and, with several voices, whose.
 */
const props = defineProps<{
  lines: readonly SessionLine[];
}>();
/** The search, also set from outside (a term of the glossary) */
const query = defineModel<string>('query', { default: '' });

const SHOW_KEY = 'session-show';
const SHOWS: readonly Show[] = ['both', 'translation', 'source'];
const ALL_VOICES = -1;
const COPIED_MS = 1500;

const { t, locale } = useI18n();
const stored = readStorage(SHOW_KEY);
const show = ref<Show>(SHOWS.find((option) => option === stored) ?? 'both');
const voice = ref(ALL_VOICES);
const copiedKey = ref<string | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const translated = computed(() => props.lines.some((line) => line.translation));
const voices = computed(() =>
  [
    ...new Set(props.lines.flatMap((line) => (line.speaker === undefined ? [] : [line.speaker]))),
  ].sort((a, b) => a - b),
);

const rows = computed<Row[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase(locale.value);
  const mode: Show = translated.value ? show.value : 'both';
  const found: Row[] = [];
  props.lines.forEach((line, i) => {
    if (voice.value !== ALL_VOICES && line.speaker !== voice.value) return;
    const main = mode === 'source' ? line.source : line.translation || line.source;
    const under = mode === 'both' && line.translation ? line.source : '';
    const plain = under ? `${main}\n${under}` : main;
    if (needle && !plain.toLocaleLowerCase(locale.value).includes(needle)) return;
    found.push({
      key: `${line.at}-${i}`,
      time: clock(line.at),
      speaker: line.speaker,
      main: highlightParts(main, query.value, locale.value),
      under: under ? highlightParts(under, query.value, locale.value) : [],
      plain,
    });
  });
  return found;
});
const filtered = computed(() => query.value.trim() !== '' || voice.value !== ALL_VOICES);

/** Escape clears the search; empty already, it reaches the view, which closes. */
function onEscape(event: KeyboardEvent): void {
  if (!query.value) return;
  event.stopPropagation();
  query.value = '';
}

async function copy(row: Row): Promise<void> {
  if (!(await copyText(row.plain))) return;
  copiedKey.value = row.key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copiedKey.value = null), COPIED_MS);
}

watch(show, (value) => writeStorage(SHOW_KEY, value));
// Another conversation has other voices
watch(voices, (list) => {
  if (!list.includes(voice.value)) voice.value = ALL_VOICES;
});
onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <section class="transcript">
    <div class="transcript__head">
      <h2 class="lg-label">
        {{ t('session.md.transcript') }}
        <span v-if="filtered" class="transcript__count" aria-live="polite">
          {{ rows.length }} / {{ lines.length }}
        </span>
      </h2>
      <div class="transcript__tools">
        <input
          v-if="lines.length"
          v-model="query"
          class="transcript__search"
          type="search"
          :placeholder="t('session.view.search')"
          :aria-label="t('session.view.search')"
          @keydown.esc="onEscape"
        />
        <select
          v-if="translated"
          v-model="show"
          class="transcript__select"
          :aria-label="t('session.view.show.label')"
        >
          <option v-for="option in SHOWS" :key="option" :value="option">
            {{ t(`session.view.show.${option}`) }}
          </option>
        </select>
        <select
          v-if="voices.length > 1"
          v-model.number="voice"
          class="transcript__select"
          :aria-label="t('session.view.voices')"
        >
          <option :value="ALL_VOICES">{{ t('session.view.voices') }}</option>
          <option v-for="n in voices" :key="n" :value="n">
            {{ t('session.view.speaker', { n: n + 1 }) }}
          </option>
        </select>
        <!-- What the view adds next to the search (its side panel, writing the summary) -->
        <slot name="tools" />
      </div>
    </div>
    <ol v-if="rows.length" class="transcript__lines">
      <li v-for="row in rows" :key="row.key" class="transcript__line">
        <time class="transcript__time">{{ row.time }}</time>
        <div class="transcript__said">
          <span v-if="row.speaker !== undefined" class="transcript__speaker">
            {{ t('session.view.speaker', { n: row.speaker + 1 }) }}
          </span>
          <p class="transcript__translation">
            <template v-for="(part, k) in row.main" :key="k">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <p v-if="row.under.length" class="transcript__source">
            <template v-for="(part, k) in row.under" :key="k">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
        </div>
        <button
          class="transcript__copy"
          :class="{ 'transcript__copy--done': copiedKey === row.key }"
          type="button"
          :title="t(copiedKey === row.key ? 'session.view.copied' : 'session.view.copyLine')"
          :aria-label="t(copiedKey === row.key ? 'session.view.copied' : 'session.view.copyLine')"
          @click="copy(row)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="copiedKey === row.key" d="m3.5 8.5 3 3 6-6.5" />
            <template v-else>
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path
                d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"
              />
            </template>
          </svg>
        </button>
      </li>
    </ol>
    <p v-else class="transcript__empty">
      {{ filtered ? t('session.view.noMatch') : t('session.view.noLines') }}
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

  // How many sentences the search or the voice left, of all of them
  &__count {
    margin-left: 8px;
    color: var(--accent);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  // Takes what the title leaves of the row, so the controls stay on one line when they fit
  &__tools {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
  }

  &__search,
  &__select {
    height: 32px;
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

  &__search {
    flex: 1 1 150px;
    min-width: 0;
    max-width: 240px;
    padding: 0 12px;
  }

  &__select {
    max-width: 100%;
    padding: 0 8px 0 10px;
    cursor: pointer;
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
    grid-template-columns: 64px minmax(0, 1fr) auto;
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

    mark {
      border-radius: 3px;
      background: color-mix(in srgb, var(--accent) 24%, transparent);
      color: inherit;
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

  // Out of the way until the sentence is pointed at or reached with the keyboard; a
  // touch screen has no pointing, so there it stays in sight, faint
  &__copy {
    display: grid;
    place-items: center;
    align-self: start;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--subtle);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.12s ease;

    svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.3;
    }

    &:hover {
      background: var(--panel-2);
      color: var(--fg);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus);
      opacity: 1;
    }

    &--done {
      color: var(--accent);
      opacity: 1;
    }

    @media (hover: none) {
      opacity: 0.6;
    }
  }

  &__line:hover &__copy {
    opacity: 1;
  }

  &__empty {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }
}
</style>
