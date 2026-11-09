import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceTable } from '../types';
import {
  audioSentSeconds,
  costByModel,
  costUsd,
  hasUnpricedUsage,
  perHourUsd,
  resetCostWarnings,
} from './costUsd';

const PRICES: PriceTable = {
  chat: { input: 2, cachedInput: 0.5, output: 8 },
  stt: { input: 0, cachedInput: 0, output: 0, audioPerMinute: 0.006 },
  legacy: { input: 1, cachedInput: 0, output: 2, audioPerMinute: 0.006, minutesUnlessTokens: true },
  tts: { input: 1, cachedInput: 0, output: 0, audioPerMinute: 0.6 },
};

describe('costUsd', () => {
  afterEach(() => {
    resetCostWarnings();
    vi.restoreAllMocks();
  });

  it('prices input, cached input and output tokens per million', () => {
    const cost = costUsd(
      [
        {
          model: 'chat',
          inputTokens: 1_000_000,
          cachedInputTokens: 400_000,
          outputTokens: 250_000,
        },
      ],
      PRICES,
    );
    // 600k * $2 + 400k * $0.5 + 250k * $8 = 1.2 + 0.2 + 2
    expect(cost).toBeCloseTo(3.4, 10);
  });

  it('prices audio seconds per minute', () => {
    const cost = costUsd(
      [{ model: 'stt', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 600 }],
      PRICES,
    );
    expect(cost).toBeCloseTo(0.06, 10);
  });

  it('adds up several models', () => {
    const cost = costUsd(
      [
        { model: 'chat', inputTokens: 500_000, cachedInputTokens: 0, outputTokens: 0 },
        { model: 'stt', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 60 },
      ],
      PRICES,
    );
    expect(cost).toBeCloseTo(1.006, 10);
  });

  it('counts unknown models as zero and warns once per model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unknown = { model: 'mystery', inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 1e6 };

    expect(costUsd([unknown, unknown], PRICES)).toBe(0);
    expect(costUsd([unknown], PRICES)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('charges the minutes of a per-minute model even when the server counted tokens', () => {
    const cost = costUsd(
      [
        {
          model: 'stt',
          inputTokens: 500,
          cachedInputTokens: 0,
          outputTokens: 20,
          audioSeconds: 60,
        },
      ],
      PRICES,
    );
    expect(cost).toBeCloseTo(0.006, 10);
  });

  it('charges tokens instead of minutes where the minutes are only a fallback', () => {
    const withTokens = {
      model: 'legacy',
      inputTokens: 1e6,
      cachedInputTokens: 0,
      outputTokens: 0,
      audioSeconds: 60,
    };
    const noTokens = {
      model: 'legacy',
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      audioSeconds: 60,
    };
    expect(costUsd([withTokens], PRICES)).toBeCloseTo(1, 10);
    expect(costUsd([noTokens], PRICES)).toBeCloseTo(0.006, 10);
  });

  it('adds minutes to tokens for a voice model, where both are billed', () => {
    const cost = costUsd(
      [{ model: 'tts', inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 60 }],
      PRICES,
    );
    expect(cost).toBeCloseTo(1.6, 10);
  });

  it('tells when a model in use has no price', () => {
    const known = { model: 'chat', inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 };
    const unknown = { model: 'mystery', inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 };
    expect(hasUnpricedUsage([known], PRICES)).toBe(false);
    expect(hasUnpricedUsage([known, unknown], PRICES)).toBe(true);
    expect(hasUnpricedUsage([], PRICES)).toBe(false);
  });

  it('breaks the estimate down by model, dearest first, naming unpriced ones', () => {
    const usage = [
      { model: 'stt', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 60 },
      { model: 'chat', inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 },
      { model: 'mystery', inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 },
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(costByModel(usage, PRICES)).toEqual([
      { model: 'chat', usd: 2, priced: true },
      { model: 'stt', usd: 0.006, priced: true },
      { model: 'mystery', usd: 0, priced: false },
    ]);
  });

  it('extrapolates a per-hour rate once a minute has passed', () => {
    expect(perHourUsd(0.5, 30_000)).toBeNull();
    expect(perHourUsd(0.5, 1_800_000)).toBeCloseTo(1, 10);
  });

  it('sums the audio sent for transcription, leaving the voice out', () => {
    const usage = [
      { model: 'stt', inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 90 },
      { model: 'stt2', inputTokens: 5, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 30 },
      { model: 'tts', inputTokens: 5, cachedInputTokens: 0, outputTokens: 0, audioSeconds: 40 },
      { model: 'chat', inputTokens: 5, cachedInputTokens: 0, outputTokens: 0 },
    ];
    expect(audioSentSeconds(usage, 'tts')).toBe(120);
    expect(audioSentSeconds(usage)).toBe(160);
  });

  it('is zero for no usage', () => {
    expect(costUsd([], PRICES)).toBe(0);
  });

  it('knows the default models', () => {
    expect(
      costUsd([{ model: 'gpt-6-luna', inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 }]),
    ).toBeGreaterThan(0);
  });
});
