// OpenAI prices used for the in-app cost estimate. They are an estimate only: the bill
// from OpenAI is the source of truth.

import type { PriceTable } from './types';

/**
 * USD per 1M tokens (input, cached input, output) and USD per minute of audio.
 *
 * As of 2026-10-20, Standard tier, from https://developers.openai.com/api/docs/pricing and
 * each model's page under https://developers.openai.com/api/docs/models/. The app never
 * asks for Fast mode, so Standard is what it pays. A `0` where OpenAI publishes no price
 * means "not billed that way". Matches docs/adr/0003-pricing-and-model-tiers.md (model IDs
 * and the per-hour cost of each tier); review both together whenever OpenAI changes prices.
 */
export const PRICES: PriceTable = {
  // Speech-to-text (Realtime transcription). Billed by audio tokens when the API reports
  // them, otherwise by the minutes of audio sent.
  // Deprecated: shuts down 2027-02-26 (replacements: gpt-live-transcribe, gpt-transcribe).
  // No cached-input price is published.
  'gpt-4o-mini-transcribe': {
    input: 1.25,
    cachedInput: 0,
    output: 5,
    audioPerMinute: 0.003,
    minutesUnlessTokens: true,
  },
  // Billed per minute of audio only; OpenAI publishes no token prices for them
  'gpt-transcribe': { input: 0, cachedInput: 0, output: 0, audioPerMinute: 0.0045 },
  'gpt-live-transcribe': { input: 0, cachedInput: 0, output: 0, audioPerMinute: 0.017 },
  // The interpreter: speech in, translated speech and text out, billed per minute of audio sent
  'gpt-realtime-translate': { input: 0, cachedInput: 0, output: 0, audioPerMinute: 0.034 },
  // Translation, summary and suggestions
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'gpt-6-astra': { input: 10, cachedInput: 1, output: 50 },
  // Optional voice output. Token prices confirmed; no cached-input price is published.
  // Deprecated: its snapshots shut down 2027-01-06 (replacement: gpt-realtime-2.1-mini).
  // audioPerMinute is unconfirmed: OpenAI publishes no per-minute figure for this model.
  'gpt-4o-mini-tts': { input: 0.6, cachedInput: 0, output: 12, audioPerMinute: 0.015 },
};

/**
 * Euros per US dollar, used to show the estimate in euros. A fixed rate on purpose: the app
 * makes no calls besides OpenAI's, and a cost estimate does not need the day's rate.
 * Review it together with PRICES.
 */
export const USD_TO_EUR = 0.86;
