// The free plan: a few minutes a month per Google account, paid with Neboki's own OpenAI
// key, inside a monthly budget for everyone together.

/** Free minutes each account gets every calendar month (UTC) */
export const FREE_MONTH_SECONDS = 30 * 60;

/** The app checks in this often while a free session runs; each check-in pays for this long */
export const TICK_SECONDS = 30;

/** A session that stops checking in loses its translations this long after the last one */
export const GRANT_GRACE_SECONDS = 90;

/** Text requests (translation, summary, suggestions) a session may make between check-ins */
export const CALLS_PER_TICK = 90;

/** Most Neboki spends on free minutes in a month, for everyone together */
export const MONTHLY_BUDGET_EUR = 150;

/**
 * What an hour of free use costs, rounded up: Medium quality is about $0.79 an hour
 * (docs/adr/0003-pricing-and-model-tiers.md), plus summaries and suggestions.
 */
export const EUR_PER_HOUR = 1;

/** Free seconds everyone together may use in a month before the plan pauses */
export const GLOBAL_MONTH_SECONDS = Math.floor((MONTHLY_BUDGET_EUR / EUR_PER_HOUR) * 3600);

/** Medium quality: the transcription model the session is pinned to */
export const FREE_TRANSCRIPTION_MODEL = 'gpt-live-transcribe';

/** The calendar month a moment falls in, e.g. "2026-11" (UTC) */
export function monthOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}
