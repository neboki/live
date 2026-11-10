import { defineStore } from 'pinia';
import { ref, watch, type WatchStopHandle } from 'vue';
import type { DocumentReference } from 'firebase/firestore';
import { logError } from '@/shared/errors';
import { onStorageWrite } from '@/shared/storage/safeStorage';
import { getFirebaseDb, loadFirestore } from '../firebase';
import { useAccount } from './useAccount';

/** Changes are sent once they stop for this long */
export const PREFS_SAVE_DELAY_MS = 1500;
export const PREFS_VERSION = 1;

export type CloudPrefsStatus = 'idle' | 'saving' | 'saved' | 'error';

/** What the app hands in: which keys travel, and how to read and apply them */
export interface CloudPrefsOptions {
  keys: readonly string[];
  read: () => Record<string, string>;
  write: (values: Readonly<Record<string, unknown>>) => void;
  /** True while applying now would cut something short (a live session) */
  isBusy: () => boolean;
  /** Called after the account's copy was applied: the stores read storage once */
  reload: () => void;
  /** Becomes false when the busy period ends, to apply a pending copy then */
  watchBusy: (onIdle: () => void) => WatchStopHandle;
}

/** Where the preferences live in the account: users/{uid}/settings/prefs */
function prefsPath(uid: string): [string, string, string, string] {
  return ['users', uid, 'settings', 'prefs'];
}

/** Same values in the same order, so two copies compare by text */
function canonical(values: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
  const out: Record<string, string> = {};
  for (const key of [...keys].sort()) {
    const value = values[key];
    if (typeof value === 'string') out[key] = value;
  }
  return JSON.stringify(out);
}

/**
 * Keeps the preferences (languages, quick controls, theme, models...) in the account,
 * so they follow the person to any device they sign in on. Never the API key. On
 * sign-in the account's copy wins and the page reloads to use it (after the live
 * session, if one is running); without a copy, this browser's goes up. Later
 * changes are saved after a short pause. Signed out, nothing changes.
 */
export const useCloudPrefs = defineStore('cloud-prefs', () => {
  const account = useAccount();
  const status = ref<CloudPrefsStatus>('idle');

  let options: CloudPrefsOptions | null = null;
  /** The preferences as last read from or written to the account, to skip echoes */
  let synced = '';
  /** Account whose copy has been read; until then local changes are not sent */
  let pulledFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stops: Array<() => void> = [];
  let stopPending: WatchStopHandle | null = null;

  async function prefsRef(uid: string): Promise<DocumentReference> {
    const [db, { doc }] = await Promise.all([getFirebaseDb(), loadFirestore()]);
    return doc(db, ...prefsPath(uid));
  }

  async function push(uid: string): Promise<void> {
    if (!options) return;
    const values = options.read();
    const json = canonical(values, options.keys);
    if (json === synced) return;
    status.value = 'saving';
    try {
      const [target, { setDoc, serverTimestamp }] = await Promise.all([
        prefsRef(uid),
        loadFirestore(),
      ]);
      await setDoc(target, { version: PREFS_VERSION, values, updatedAt: serverTimestamp() });
      synced = json;
      status.value = 'saved';
    } catch (err) {
      logError('Saving the preferences to the account failed', err);
      status.value = 'error';
    }
  }

  /** Writes the account's copy into this browser and reloads to use it */
  function apply(values: Readonly<Record<string, unknown>>): void {
    if (!options) return;
    options.write(values);
    options.reload();
  }

  async function pull(uid: string): Promise<void> {
    if (!options) return;
    try {
      const [target, { getDoc }] = await Promise.all([prefsRef(uid), loadFirestore()]);
      const snapshot = await getDoc(target);
      if (account.user?.uid !== uid || !options) return;
      const data = snapshot.exists() ? snapshot.data() : null;
      const remote =
        data && typeof data.values === 'object' && data.values !== null
          ? (data.values as Record<string, unknown>)
          : null;
      if (!remote) {
        pulledFor = uid;
        synced = canonical({}, options.keys);
        await push(uid);
        return;
      }
      const remoteJson = canonical(remote, options.keys);
      if (remoteJson === canonical(options.read(), options.keys)) {
        pulledFor = uid;
        synced = remoteJson;
        status.value = 'saved';
        return;
      }
      // The account's copy differs: use it, but never in the middle of a session
      if (!options.isBusy()) {
        apply(remote);
        return;
      }
      stopPending?.();
      stopPending = options.watchBusy(() => {
        stopPending?.();
        stopPending = null;
        if (account.user?.uid === uid) apply(remote);
      });
    } catch (err) {
      logError('Reading the preferences from the account failed', err);
      status.value = 'error';
    }
  }

  function schedule(key: string): void {
    const uid = account.user?.uid;
    if (!options || !uid || pulledFor !== uid || !options.keys.includes(key)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void push(uid), PREFS_SAVE_DELAY_MS);
  }

  /** Follows the account and the stored preferences; safe to call more than once */
  function start(next: CloudPrefsOptions): void {
    if (stops.length > 0 || !account.enabled) return;
    options = next;
    stops = [
      watch(
        () => account.user?.uid,
        (uid) => {
          clearTimeout(timer);
          stopPending?.();
          stopPending = null;
          pulledFor = null;
          synced = '';
          status.value = 'idle';
          if (uid) void pull(uid);
        },
        { immediate: true },
      ),
      onStorageWrite(schedule),
    ];
  }

  function stop(): void {
    for (const unsubscribe of stops) unsubscribe();
    stops = [];
    stopPending?.();
    stopPending = null;
    clearTimeout(timer);
    options = null;
  }

  /** Deletes the account's copy (before deleting the account). False when it could not. */
  async function remove(): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid) return true;
    clearTimeout(timer);
    try {
      const [target, { deleteDoc }] = await Promise.all([prefsRef(uid), loadFirestore()]);
      await deleteDoc(target);
      pulledFor = null;
      return true;
    } catch (err) {
      logError('Deleting the preferences from the account failed', err);
      return false;
    }
  }

  return { status, start, stop, remove };
});
