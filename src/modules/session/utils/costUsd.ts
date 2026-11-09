import { PRICES } from '../pricing';
import type { PriceTable, Usage } from '../types';

const PER_MILLION = 1_000_000;
const warnedModels = new Set<string>();

function warnUnknown(model: string): void {
  if (warnedModels.has(model)) return;
  warnedModels.add(model);
  console.warn(`[Neboki Live] No price for model "${model}"; it counts as $0 in the estimate`);
}

/**
 * Estimated USD cost of the given usage. Unknown models count as 0: check with
 * `hasUnpricedUsage` before trusting the figure.
 */
export function costUsd(usage: readonly Usage[], prices: PriceTable = PRICES): number {
  return usage.reduce((total, entry) => {
    const price = prices[entry.model];
    if (!price) {
      warnUnknown(entry.model);
      return total;
    }
    const cached = Math.min(entry.cachedInputTokens, entry.inputTokens);
    const tokens =
      (entry.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      entry.outputTokens * price.output;
    const hasTokens = entry.inputTokens > 0 || entry.outputTokens > 0;
    const minutesApply = !(price.minutesUnlessTokens && hasTokens);
    const audio = minutesApply ? ((entry.audioSeconds ?? 0) / 60) * (price.audioPerMinute ?? 0) : 0;
    return total + tokens / PER_MILLION + audio;
  }, 0);
}

/** What one model cost, for the breakdown */
export interface ModelCost {
  model: string;
  usd: number;
  /** False when the price table does not know the model: its usd is 0, not nothing */
  priced: boolean;
}

/** The estimate per model, dearest first. */
export function costByModel(usage: readonly Usage[], prices: PriceTable = PRICES): ModelCost[] {
  return usage
    .map((entry) => ({
      model: entry.model,
      usd: costUsd([entry], prices),
      priced: Boolean(prices[entry.model]),
    }))
    .sort((a, b) => b.usd - a.usd);
}

/** Least session time before a per-hour figure means anything */
const MIN_RATE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** What an hour would cost at this session's pace, or null when it is too early to say. */
export function perHourUsd(usd: number, durationMs: number): number | null {
  return durationMs < MIN_RATE_MS ? null : (usd * HOUR_MS) / durationMs;
}

/** Seconds of audio sent for transcription (what is billed), leaving the voice output out. */
export function audioSentSeconds(usage: readonly Usage[], voiceModel?: string): number {
  return usage
    .filter((entry) => entry.model !== voiceModel)
    .reduce((total, entry) => total + (entry.audioSeconds ?? 0), 0);
}

/** True when some of the usage comes from a model the price table does not know. */
export function hasUnpricedUsage(usage: readonly Usage[], prices: PriceTable = PRICES): boolean {
  return usage.some((entry) => !prices[entry.model]);
}

/** Test hook: forget which unknown models were already warned about. */
export function resetCostWarnings(): void {
  warnedModels.clear();
}
