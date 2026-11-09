// Which captions a shared tab shown some seconds behind real time has reached, so each
// lands on its sentence. The delay itself is fixed, chosen by the user (see the overlay's
// SYNC_DELAY_CHOICES): a caption slower than it shows as soon as it arrives.

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
