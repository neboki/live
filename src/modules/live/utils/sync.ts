// Which captions a shared tab shown some seconds behind real time has reached, so each
// lands on its sentence. The delay itself is fixed, chosen by the user (see the overlay's
// SYNC_DELAY_CHOICES): a caption slower than it shows as soon as it arrives, and when
// that keeps happening a longer delay is suggested.

import type { SessionLine } from '@/modules/session';

/**
 * The lines a picture `lagMs` behind real time has reached: a line shows once the
 * picture gets to where its sentence began (or, when that is unknown, ended).
 */
export function linesReached(
  lines: readonly SessionLine[],
  lagMs: number,
  now: number = Date.now(),
): SessionLine[] {
  const shownUpTo = now - lagMs;
  return lines.filter((line) => (line.from ?? line.at) <= shownUpTo);
}

/** Recent lines looked at to tell whether the delay is too short */
export const LATE_WINDOW = 6;
/** Lines of the window that must have come late before a longer delay is suggested */
export const LATE_LINES = 2;
/** A line later than this behind its sentence's start counts as late, in milliseconds */
const LATE_MARGIN_MS = 500;

/**
 * Seconds of delay that would have let the recent captions land on time, from those
 * offered, when the current one keeps them late; null while it is enough. A caption
 * only exists once its whole sentence was heard and translated, so a long sentence
 * needs a delay at least as long as itself.
 */
export function suggestedDelay(
  lines: readonly SessionLine[],
  delaySeconds: number,
  choices: readonly number[],
): number | null {
  const waits = lines
    .slice(-LATE_WINDOW)
    .filter((line) => line.from !== undefined)
    .map((line) => line.at - (line.from ?? line.at));
  const late = waits.filter((wait) => wait > delaySeconds * 1000 + LATE_MARGIN_MS);
  if (late.length < LATE_LINES) return null;
  // Enough for all but the slowest late line: one outlier should not double the delay
  const sorted = [...late].sort((a, b) => a - b);
  const needed = (sorted[sorted.length - 2] ?? 0) + LATE_MARGIN_MS;
  const next = choices.find((seconds) => seconds > delaySeconds && seconds * 1000 >= needed);
  const longest = choices[choices.length - 1];
  if (next !== undefined) return next;
  return longest !== undefined && longest > delaySeconds ? longest : null;
}
