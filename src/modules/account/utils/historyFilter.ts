// Finding conversations in the account: words in their name, summary, terms, languages
// or (once read) their sentences; a language pair; starred ones; a range of days; and an
// order. Pure functions, so the page and the tests share them.

import { costUsd, hasUnpricedUsage, type SessionLine, type SessionPair } from '@/modules/session';
import type { CloudHistoryItem } from './cloudSession';

export type HistorySort = 'newest' | 'oldest' | 'longest' | 'lines' | 'cost';

export const HISTORY_SORTS: readonly HistorySort[] = [
  'newest',
  'oldest',
  'longest',
  'lines',
  'cost',
];

export interface HistoryFilter {
  /** Words that must all appear, in any order, case and accents ignored */
  query: string;
  /** A pairKey, or '' for every pair */
  pair: string;
  starredOnly: boolean;
  /** First and last day to show, as YYYY-MM-DD in local time; '' for no limit */
  fromDay: string;
  toDay: string;
  sort: HistorySort;
}

export const EMPTY_FILTER: Readonly<HistoryFilter> = {
  query: '',
  pair: '',
  starredOnly: false,
  fromDay: '',
  toDay: '',
  sort: 'newest',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SNIPPET_RADIUS = 60;

/** Lower case without accents, so "Reunión" is found as "reunion" */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** One key per language pair; an automatic source shows as "auto" */
export function pairKey(pair: SessionPair): string {
  return `${pair.from || 'auto'}>${pair.to}`;
}

/** How long a conversation lasted; 0 when it never ended (a closed tab) */
export function itemDuration(item: CloudHistoryItem): number {
  return item.endedAt === null ? 0 : Math.max(0, item.endedAt - item.startedAt);
}

/** The sentences of a conversation as one searchable text, one sentence per line */
export function linesText(lines: readonly SessionLine[]): string {
  return lines.map((line) => `${line.source}\n${line.translation}`).join('\n');
}

/** Midnight at the start of a YYYY-MM-DD day in local time; null when it is not one */
function dayStart(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

function words(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** What the words are looked for in, without the sentences */
function describedBy(item: CloudHistoryItem): string {
  return normalize(
    [item.title, item.pair.from, item.pair.to, item.glossary, ...item.summary].join('\n'),
  );
}

function cost(item: CloudHistoryItem): number {
  return costUsd(item.usage);
}

const SORTERS: Readonly<Record<HistorySort, (a: CloudHistoryItem, b: CloudHistoryItem) => number>> =
  {
    newest: (a, b) => b.startedAt - a.startedAt,
    oldest: (a, b) => a.startedAt - b.startedAt,
    longest: (a, b) => itemDuration(b) - itemDuration(a) || b.startedAt - a.startedAt,
    lines: (a, b) => b.lineCount - a.lineCount || b.startedAt - a.startedAt,
    cost: (a, b) => cost(b) - cost(a) || b.startedAt - a.startedAt,
  };

/**
 * The conversations that pass the filter, in its order. `texts` holds the sentences of
 * those already read (linesText, by id), so the words are also looked for in them.
 */
export function filterHistory(
  items: readonly CloudHistoryItem[],
  filter: HistoryFilter,
  texts: ReadonlyMap<string, string> = new Map(),
): CloudHistoryItem[] {
  const wanted = words(filter.query);
  const from = dayStart(filter.fromDay);
  const toStart = dayStart(filter.toDay);
  const to = toStart === null ? null : toStart + DAY_MS;
  return items
    .filter((item) => {
      if (filter.starredOnly && !item.starred) return false;
      if (filter.pair && pairKey(item.pair) !== filter.pair) return false;
      if (from !== null && item.startedAt < from) return false;
      if (to !== null && item.startedAt >= to) return false;
      if (wanted.length === 0) return true;
      const haystack = `${describedBy(item)}\n${normalize(texts.get(item.id) ?? '')}`;
      return wanted.every((word) => haystack.includes(word));
    })
    .sort(SORTERS[filter.sort]);
}

/**
 * A short excerpt of `text` around the first word of the query found in it, with
 * ellipses where it was cut. Null when none is there.
 */
export function snippet(text: string, query: string, radius = SNIPPET_RADIUS): string | null {
  const normalized = normalize(text);
  // Removing accents keeps the length of most text, but not all: then the excerpt is skipped
  if (normalized.length !== text.length) return null;
  let at = -1;
  let length = 0;
  for (const word of words(query)) {
    const found = normalized.indexOf(word);
    if (found !== -1 && (at === -1 || found < at)) {
      at = found;
      length = word.length;
    }
  }
  if (at === -1) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + length + radius);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`;
}

export interface PairOption {
  key: string;
  pair: SessionPair;
  count: number;
}

/** The language pairs in use, the most frequent first */
export function languagePairs(items: readonly CloudHistoryItem[]): PairOption[] {
  const byKey = new Map<string, PairOption>();
  for (const item of items) {
    const key = pairKey(item.pair);
    const option = byKey.get(key);
    if (option) option.count += 1;
    else byKey.set(key, { key, pair: { ...item.pair }, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export interface HistoryTotals {
  count: number;
  durationMs: number;
  lines: number;
  usd: number;
  /** A model without a known price was used: the cost is a floor, not a figure */
  unpriced: boolean;
}

/** What the given conversations add up to */
export function historyTotals(items: readonly CloudHistoryItem[]): HistoryTotals {
  return items.reduce<HistoryTotals>(
    (totals, item) => ({
      count: totals.count + 1,
      durationMs: totals.durationMs + itemDuration(item),
      lines: totals.lines + item.lineCount,
      usd: totals.usd + cost(item),
      unpriced: totals.unpriced || hasUnpricedUsage(item.usage),
    }),
    { count: 0, durationMs: 0, lines: 0, usd: 0, unpriced: false },
  );
}
