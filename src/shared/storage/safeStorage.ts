// localStorage can throw (private mode, blocked site data), so every access is guarded.

export const STORAGE_PREFIX = 'neboki-live:';

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key);
  } catch (err) {
    console.warn(`[Neboki Live] Could not read "${key}" from storage`, err);
    return null;
  }
}

/** Stores a value, or removes it when `value` is null. Never throws. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_PREFIX + key);
    else window.localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch (err) {
    // Storage unavailable: the value simply isn't remembered
    console.warn(`[Neboki Live] Could not write "${key}" to storage`, err);
  }
}
