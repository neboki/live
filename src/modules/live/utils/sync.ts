// Which captions a shared tab shown some seconds behind real time has reached, so each
// lands on its sentence, and how far behind it should be. The delay is either chosen by
// the user (see the overlay's SYNC_DELAY_CHOICES), and then a caption slower than it shows
// as soon as it arrives and a longer delay is suggested when that keeps happening; or
// "auto": the first captions of the session are timed and the delay is set from them,
// once, like a live broadcast that settles its delay and keeps it.

import type { SessionLine } from '@/modules/session';

/** Captions timed before an automatic delay is settled */
export const CALIBRATION_LINES = 3;
/**
 * Seconds the picture is held at first while the delay is automatic: the longest the
 * user waits for it. The delay is usually settled sooner, as soon as a few captions
 * were timed, and the picture then starts or glides to it
 */
export const CALIBRATION_SECONDS = 20;
/** Room left on top of the captions' measured wait: for the voice to start, and jitter */
const AUTO_HEADROOM_MS = 1500;
/** Bounds of an automatic delay, in seconds */
export const AUTO_MIN_SECONDS = 3;
export const AUTO_MAX_SECONDS = 30;
/** Most recent waits an automatic delay is drawn from */
const AUTO_WINDOW = 8;

/**
 * The delay, in seconds, that lets the captions land on their sentence, from how long
 * each recent one took to arrive after its sentence began (milliseconds); null until
 * enough were timed. Enough for all but the slowest: one outlier should not double it.
 * Rounded up to the half second.
 */
export function autoDelay(waits: readonly number[]): number | null {
  const recent = waits.slice(-AUTO_WINDOW);
  if (recent.length < CALIBRATION_LINES) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  const slow = sorted[sorted.length - 2] ?? 0;
  const seconds = Math.ceil(((slow + AUTO_HEADROOM_MS) / 1000) * 2) / 2;
  return Math.min(AUTO_MAX_SECONDS, Math.max(AUTO_MIN_SECONDS, seconds));
}

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
