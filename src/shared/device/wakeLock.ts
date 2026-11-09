// Keeps the screen on while the captions show in the page (a phone on the table
// during an interview). The browser drops the lock whenever the page is hidden,
// so it is asked for again each time the page comes back.

import { logError } from '@/shared/errors';

export interface ScreenWakeLock {
  hold: () => void;
  release: () => void;
}

export function createScreenWakeLock(): ScreenWakeLock {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  function request(): void {
    if (!wanted || sentinel || !('wakeLock' in navigator)) return;
    if (document.visibilityState !== 'visible') return;
    navigator.wakeLock
      .request('screen')
      .then((lock) => {
        if (!wanted) {
          lock.release().catch((err: unknown) => logError('Releasing the wake lock failed', err));
          return;
        }
        sentinel = lock;
        lock.addEventListener('release', () => (sentinel = null));
      })
      // Low battery or a denied permission: the screen may dim, the session goes on
      .catch((err: unknown) => logError('The screen wake lock was refused', err));
  }

  function onVisibility(): void {
    request();
  }

  function hold(): void {
    if (wanted) return;
    wanted = true;
    document.addEventListener('visibilitychange', onVisibility);
    request();
  }

  function release(): void {
    if (!wanted) return;
    wanted = false;
    document.removeEventListener('visibilitychange', onVisibility);
    sentinel?.release().catch((err: unknown) => logError('Releasing the wake lock failed', err));
    sentinel = null;
  }

  return { hold, release };
}
