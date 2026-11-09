// A phone that leaves the app (screen locked, another app opened) often stops handing
// over the microphone: the browser suspends the audio or mutes the track, and nothing
// says so. While the page is hidden this measures how much real sound still arrived
// (a muted track yields exact zeros), so on return the session knows whether it missed
// what was said. Android often keeps listening in the background: then it says nothing.

import { TARGET_SAMPLE_RATE } from '@/shared/audio/pcm';

/** Shorter absences (a glance at a notification) are not worth a word */
const MIN_AWAY_MS = 3000;

export interface AwayWatch {
  /** Watches from now on; call when the session is running */
  start: () => void;
  stop: () => void;
  /** Every chunk captured, hidden or not */
  chunk: (pcm: Int16Array) => void;
}

export interface AwayWatchOptions {
  /** Back after an absence: `heard` is the share of it with real sound, 0..1 */
  onBack: (heard: number, awayMs: number) => void;
  now?: () => number;
}

function hasSound(pcm: Int16Array): boolean {
  return pcm.some((sample) => sample !== 0);
}

export function createAwayWatch({ onBack, now = Date.now }: AwayWatchOptions): AwayWatch {
  let hiddenAt: number | null = null;
  let heardMs = 0;
  let watching = false;

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      hiddenAt = now();
      heardMs = 0;
      return;
    }
    if (hiddenAt === null) return;
    const awayMs = now() - hiddenAt;
    hiddenAt = null;
    if (awayMs >= MIN_AWAY_MS) onBack(Math.min(1, heardMs / awayMs), awayMs);
  }

  function start(): void {
    if (watching) return;
    watching = true;
    hiddenAt = null;
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stop(): void {
    if (!watching) return;
    watching = false;
    hiddenAt = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function chunk(pcm: Int16Array): void {
    if (hiddenAt === null || !hasSound(pcm)) return;
    heardMs += (pcm.length / TARGET_SAMPLE_RATE) * 1000;
  }

  return { start, stop, chunk };
}
