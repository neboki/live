// A copy of every preference as a small JSON file, to move them to another browser
// or to undo an experiment. The API key is never part of it. Values are copied as
// stored: each store validates what it reads on load, so a hand-edited or outdated
// file can only fall back to defaults, never break the app.

import { readStorage, writeStorage } from '@/shared/storage/safeStorage';

/** Marks our files, so any other JSON is turned away */
export const BACKUP_KIND = 'neboki-live-settings';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.json';

/**
 * Storage keys of the preferences. Left out on purpose: the API key and whether to
 * remember it (secret), and the chosen microphone (its id only means something on
 * this device).
 */
export const BACKUP_KEYS: readonly string[] = [
  'overlay-prefs',
  'models',
  'tts',
  'provider',
  'azure-endpoint',
  'target-language',
  'spend-limit',
  'meeting',
  'audio-source',
  'locale',
  'theme',
  'brand',
  'brand-custom',
];

/**
 * Preferences kept in the account while signed in (useCloudPrefs). Also left out:
 * the own brand (it has its own sync, with the logo) and the audio source (the tab
 * on a computer, the microphone on a phone).
 */
export const SYNC_KEYS: readonly string[] = BACKUP_KEYS.filter(
  (key) => key !== 'brand-custom' && key !== 'audio-source',
);

/** The synced preferences as stored in this browser */
export function readSyncedPrefs(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of SYNC_KEYS) {
    const value = readStorage(key);
    if (value !== null) values[key] = value;
  }
  return values;
}

/** Replaces the synced preferences with `values` (a missing one goes back to default) */
export function writeSyncedPrefs(values: Readonly<Record<string, unknown>>): void {
  for (const key of SYNC_KEYS) {
    const value = values[key];
    writeStorage(key, typeof value === 'string' ? value : null);
  }
}

/** A backup file is larger than this only if it is not one */
const MAX_BACKUP_BYTES = 256 * 1024;

export interface SettingsBackup {
  kind: typeof BACKUP_KIND;
  version: number;
  savedAt: string;
  values: Record<string, string>;
}

/** Why a file could not be restored; each maps to a message for the user */
export type RestoreError = 'tooLarge' | 'unreadable' | 'notOurs' | 'newer' | 'empty';

export type RestoreResult = { ok: true; count: number } | { ok: false; error: RestoreError };

export function createBackup(now: Date = new Date()): SettingsBackup {
  const values: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const value = readStorage(key);
    if (value !== null) values[key] = value;
  }
  return { kind: BACKUP_KIND, version: BACKUP_VERSION, savedAt: now.toISOString(), values };
}

export function backupFilename(now: Date = new Date()): string {
  return `${BACKUP_KIND}-${now.toISOString().slice(0, 10)}${BACKUP_EXTENSION}`;
}

/** Checks a file's text and, if it is a backup of ours, returns the values to restore */
export function parseBackup(
  text: string,
): { ok: true; values: Record<string, string> } | { ok: false; error: RestoreError } {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'tooLarge' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'unreadable' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'notOurs' };
  const file = data as Record<string, unknown>;
  if (file.kind !== BACKUP_KIND) return { ok: false, error: 'notOurs' };
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    return { ok: false, error: 'newer' };
  }
  const raw = file.values;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'notOurs' };
  }
  const values: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string') values[key] = value;
  }
  if (Object.keys(values).length === 0) return { ok: false, error: 'empty' };
  return { ok: true, values };
}

/**
 * Replaces the stored preferences with the file's: one missing from the file goes
 * back to its default. The stores read storage once, so the page reloads after this.
 */
export function restoreBackup(text: string): RestoreResult {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  for (const key of BACKUP_KEYS) writeStorage(key, parsed.values[key] ?? null);
  return { ok: true, count: Object.keys(parsed.values).length };
}

/** Every preference back to its default; the API key stays */
export function resetPreferences(): void {
  for (const key of BACKUP_KEYS) writeStorage(key, null);
}
