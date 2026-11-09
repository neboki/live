import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionRecord } from './useSessionRecord';

const PAIR = { from: 'EN', to: 'ES' };

describe('useSessionRecord', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.useRealTimers());

  it('begin clears the previous session', () => {
    const record = useSessionRecord();
    record.begin({ pair: PAIR, startedAt: 1_000, glossary: 'Acme' });
    record.addLine({ at: 2_000, source: 'Hi', translation: 'Hola' });
    record.setSummary(['point']);
    record.addUsage({ model: 'm', inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 });
    record.end();

    record.begin({ pair: { from: '', to: 'FR' }, startedAt: 5_000 });

    expect(record.startedAt).toBe(5_000);
    expect(record.endedAt).toBeNull();
    expect(record.pair).toEqual({ from: '', to: 'FR' });
    expect(record.lines).toEqual([]);
    expect(record.summary).toEqual([]);
    expect(record.glossary).toBe('');
    expect(record.usage).toEqual([]);
  });

  it('keeps every line, uncapped', () => {
    const record = useSessionRecord();
    record.begin({ pair: PAIR, startedAt: 0 });
    for (let i = 0; i < 120; i++) record.addLine({ at: i, source: `s${i}`, translation: `t${i}` });

    expect(record.lines).toHaveLength(120);
    expect(record.lines[0]).toEqual({ at: 0, source: 's0', translation: 't0' });
  });

  it('replaces the summary and the glossary', () => {
    const record = useSessionRecord();
    record.setSummary(['a', 'b']);
    record.setSummary(['c']);
    record.setGlossary('one\ntwo');

    expect(record.summary).toEqual(['c']);
    expect(record.glossary).toBe('one\ntwo');
  });

  it('addUsage merges by model', () => {
    const record = useSessionRecord();
    record.addUsage({ model: 'a', inputTokens: 10, cachedInputTokens: 2, outputTokens: 5 });
    record.addUsage({
      model: 'b',
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      audioSeconds: 3,
    });
    record.addUsage({ model: 'a', inputTokens: 1, cachedInputTokens: 1, outputTokens: 1 });
    record.addUsage({
      model: 'b',
      inputTokens: 4,
      cachedInputTokens: 0,
      outputTokens: 2,
      audioSeconds: 1.5,
    });

    expect(record.usage).toEqual([
      { model: 'a', inputTokens: 11, cachedInputTokens: 3, outputTokens: 6 },
      { model: 'b', inputTokens: 4, cachedInputTokens: 0, outputTokens: 2, audioSeconds: 4.5 },
    ]);
  });

  it('measures the duration until now while running and until end() after', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const record = useSessionRecord();
    expect(record.durationMs).toBe(0);

    record.begin({ pair: PAIR, startedAt: 10_000 });
    vi.setSystemTime(25_000);
    record.end();
    vi.setSystemTime(99_000);
    record.end();

    expect(record.endedAt).toBe(25_000);
    expect(record.durationMs).toBe(15_000);
  });
});
