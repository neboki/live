// Which captions a shared tab shown some seconds behind real time has reached, so each
// lands on its sentence, and how far behind it should be. The picture never stops for a
// caption: the delay has to be long enough from the first frame. A caption starts to
// exist when its sentence was heard to the end (4 s at most, see the audio module's
// energyVad), transcribed and the first translated words came back, so "auto" starts at
// a delay that covers that, known beforehand; it is not measured while the picture
// waits. Only when captions keep landing late (a slow network) is it raised, never
// lowered, and the picture gets there by playing slightly slower, without stopping. A
// delay chosen by the user (see the overlay's SYNC_DELAY_CHOICES) stays as chosen: a
// caption slower than it shows as soon as it arrives and a longer one is suggested.

import type { SessionLine } from '@/modules/session';

/**
 * Seconds the picture plays behind on "auto". A caption needs about 8 s when all goes
 * well: the longest sentence (4 s) and the pause that ends it, its transcript (about
 * 1 s), the first translated words (under 1 s, 2.5 s when the request had to be doubled).
 * The rest is room for a slow network and for sentences that wait their turn: on a
 * video nobody answers to, being further behind costs nothing, a late caption does
 */
export const AUTO_SECONDS = 15;
/** Room left on top of a late caption's measured wait when the delay is raised */
const AUTO_HEADROOM_MS = 1500;
/** Most an automatic delay is raised to, in seconds */
export const AUTO_MAX_SECONDS = 30;

/** The delay that covers a caption which took `waitMs` to arrive, with room, in bounds */
function delayCovering(waitMs: number): number {
  const seconds = Math.ceil(((waitMs + AUTO_HEADROOM_MS) / 1000) * 2) / 2;
  return Math.min(AUTO_MAX_SECONDS, Math.max(AUTO_SECONDS, seconds));
}

/**
 * A longer automatic delay, once captions keep landing after their sentence began on
 * the picture: enough for the slowest of the recent late ones. `waits` is how long each
 * caption took to start showing after its sentence began, in milliseconds. Null while the current
 * delay is enough, or while only one caption was late (a single long sentence is let
 * show late rather than moving the whole picture for it).
 */
export function raisedDelay(waits: readonly number[], delaySeconds: number): number | null {
  const late = waits
    .slice(-LATE_WINDOW)
    .filter((wait) => wait > delaySeconds * 1000 + LATE_MARGIN_MS);
  if (late.length < LATE_LINES) return null;
  const next = delayCovering(Math.max(...late));
  return next > delaySeconds ? next : null;
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
