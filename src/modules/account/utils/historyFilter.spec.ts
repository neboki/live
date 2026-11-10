import { describe, expect, it } from 'vitest';
import type { CloudHistoryItem } from './cloudSession';
import {
  EMPTY_FILTER,
  filterHistory,
  historyTotals,
  languagePairs,
  linesText,
  normalize,
  pairKey,
  snippet,
  type HistoryFilter,
} from './historyFilter';

const HOUR = 60 * 60 * 1000;

function item(id: string, overrides: Partial<CloudHistoryItem> = {}): CloudHistoryItem {
  const startedAt = new Date(2026, 10, Number(id), 10).getTime();
  return {
    id,
    startedAt,
    endedAt: startedAt + HOUR,
    pair: { from: 'en', to: 'es' },
    lineCount: 10,
    title: '',
    starred: false,
    summary: [],
    glossary: '',
    usage: [],
    ...overrides,
  };
}

function ids(items: readonly CloudHistoryItem[]): string[] {
  return items.map((entry) => entry.id);
}

function filter(overrides: Partial<HistoryFilter>): HistoryFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe('normalize', () => {
  it('ignores case and accents', () => {
    expect(normalize('Reunión ÁRBOL')).toBe('reunion arbol');
  });
});

describe('filterHistory', () => {
  const items = [
    item('1', { title: 'Reunión semanal', starred: true }),
    item('2', { pair: { from: '', to: 'en' }, summary: ['Budget review'] }),
    item('3', { glossary: 'Kubernetes', endedAt: null, lineCount: 50 }),
  ];

  it('shows everything, newest first, without a filter', () => {
    expect(ids(filterHistory(items, EMPTY_FILTER))).toEqual(['3', '2', '1']);
  });

  it('finds every word of the query in the name, summary or terms', () => {
    expect(ids(filterHistory(items, filter({ query: 'reunion' })))).toEqual(['1']);
    expect(ids(filterHistory(items, filter({ query: 'review budget' })))).toEqual(['2']);
    expect(ids(filterHistory(items, filter({ query: 'kubernetes nope' })))).toEqual([]);
  });

  it('also looks in the sentences already read', () => {
    const texts = new Map([['3', 'We talked about the roadmap']]);
    expect(ids(filterHistory(items, filter({ query: 'roadmap' }), texts))).toEqual(['3']);
  });

  it('keeps one language pair, the starred ones and a range of days', () => {
    expect(ids(filterHistory(items, filter({ pair: 'auto>en' })))).toEqual(['2']);
    expect(ids(filterHistory(items, filter({ starredOnly: true })))).toEqual(['1']);
    expect(
      ids(filterHistory(items, filter({ fromDay: '2026-11-02', toDay: '2026-11-02' }))),
    ).toEqual(['2']);
  });

  it('orders by age, length, sentences or cost', () => {
    expect(ids(filterHistory(items, filter({ sort: 'oldest' })))).toEqual(['1', '2', '3']);
    expect(ids(filterHistory(items, filter({ sort: 'lines' })))).toEqual(['3', '2', '1']);
    // The one that never ended has no length: last
    expect(ids(filterHistory(items, filter({ sort: 'longest' })))).toEqual(['2', '1', '3']);
  });
});

describe('snippet', () => {
  it('cuts the text around the first word found', () => {
    const text = `${'a'.repeat(100)} the roadmap ${'b'.repeat(100)}`;
    const cut = snippet(text, 'roadmap', 10);
    expect(cut).toMatch(/^….*roadmap.*…$/);
    expect(cut?.length).toBeLessThan(40);
  });

  it('is null when no word is there', () => {
    expect(snippet('hello', 'bye')).toBeNull();
  });
});

describe('languagePairs and totals', () => {
  const items = [
    item('1'),
    item('2'),
    item('3', {
      pair: { from: 'fr', to: 'es' },
      usage: [{ model: 'no-such-model', inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }],
    }),
  ];

  it('lists the pairs in use, the most frequent first', () => {
    expect(languagePairs(items).map((option) => [option.key, option.count])).toEqual([
      ['en>es', 2],
      ['fr>es', 1],
    ]);
    expect(pairKey({ from: '', to: 'de' })).toBe('auto>de');
  });

  it('adds up time, sentences and cost, and says when a price is unknown', () => {
    const totals = historyTotals(items);
    expect(totals).toMatchObject({ count: 3, durationMs: 3 * HOUR, lines: 30, unpriced: true });
  });

  it('joins the sentences into one text', () => {
    expect(linesText([{ at: 0, source: 'Hi', translation: 'Hola' }])).toBe('Hi\nHola');
  });
});
