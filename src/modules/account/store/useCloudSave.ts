import { defineStore } from 'pinia';
import { computed, ref, watch, type WatchStopHandle } from 'vue';
import { useSessionRecord } from '@/modules/session';
import { logError } from '@/shared/errors';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { getFirebaseDb } from '../firebase';
import {
  chunkLines,
  chunksToWrite,
  cloudSessionId,
  toCloudSessionDoc,
} from '../utils/cloudSession';
import { useAccount } from './useAccount';

/** Remembers, on this device, that the user chose to keep conversations in the account */
const SAVE_KEY = 'cloud-save';
/** While live, what was said is saved this often, so a closed tab loses little */
export const FLUSH_MS = 30_000;

export type CloudSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** What has been stored of the conversation being saved */
interface Tracked {
  uid: string;
  id: string;
  startedAt: number;
  savedLines: number;
  /** The conversation document last written, to skip writes that change nothing */
  savedDoc: string;
}

/**
 * Keeps conversations in the signed-in account (Firestore), only once the user turns it
 * on. While live it saves every FLUSH_MS, when the page is hidden and when it ends; each
 * time only the new sentences are sent. Without an account nothing leaves the device.
 */
export const useCloudSave = defineStore('cloud-save', () => {
  const account = useAccount();
  const record = useSessionRecord();
  const enabled = ref(readStorage(SAVE_KEY) === 'true');
  const status = ref<CloudSaveStatus>('idle');
  const lastSavedAt = ref<number | null>(null);
  const active = computed(() => account.enabled && enabled.value && account.user !== null);

  let tracked: Tracked | null = null;
  let saving = false;
  let again = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopWatches: WatchStopHandle[] = [];

  function setEnabled(on: boolean): void {
    enabled.value = on;
    writeStorage(SAVE_KEY, on ? 'true' : null);
    if (on) void flush();
    else status.value = 'idle';
  }

  /** The conversation to save now, starting over when it or the account changed */
  function current(): Tracked | null {
    const uid = account.user?.uid;
    const startedAt = record.startedAt;
    if (!uid || startedAt === null) return null;
    if (tracked?.uid !== uid || tracked.startedAt !== startedAt) {
      tracked = { uid, id: cloudSessionId(startedAt), startedAt, savedLines: 0, savedDoc: '' };
    }
    return tracked;
  }

  /** Sends what changed since the last save. Never throws; `status` says how it went. */
  async function flush(): Promise<void> {
    if (!active.value) return;
    if (saving) {
      again = true;
      return;
    }
    const target = current();
    // A conversation where nothing was said yet is not worth keeping
    if (!target || record.lines.length === 0) return;
    const total = record.lines.length;
    const sessionDoc = toCloudSessionDoc(record, target.startedAt);
    const docKey = JSON.stringify(sessionDoc);
    if (total === target.savedLines && docKey === target.savedDoc) return;

    saving = true;
    status.value = 'saving';
    try {
      const [db, { doc, serverTimestamp, writeBatch }] = await Promise.all([
        getFirebaseDb(),
        import('firebase/firestore'),
      ]);
      const session = doc(db, 'users', target.uid, 'sessions', target.id);
      const batch = writeBatch(db);
      batch.set(session, { ...sessionDoc, updatedAt: serverTimestamp() });
      for (const index of chunksToWrite(target.savedLines, total)) {
        batch.set(doc(session, 'chunks', String(index)), {
          lines: chunkLines(record.lines, index),
        });
      }
      await batch.commit();
      target.savedLines = total;
      target.savedDoc = docKey;
      status.value = 'saved';
      lastSavedAt.value = Date.now();
    } catch (err) {
      logError('Saving the conversation to the account failed', err);
      status.value = 'error';
    } finally {
      saving = false;
      if (again) {
        again = false;
        void flush();
      }
    }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') void flush();
  }

  /** Starts saving in the background; safe to call more than once */
  function start(): void {
    if (timer !== undefined || !account.enabled) return;
    timer = setInterval(() => {
      if (record.startedAt !== null && record.endedAt === null) void flush();
    }, FLUSH_MS);
    stopWatches = [
      // The end of a conversation, and the summary that may follow it, are saved at once
      watch(
        () => [record.endedAt, record.summary.length] as const,
        ([endedAt]) => {
          if (endedAt !== null) void flush();
        },
      ),
      // Signing in during or after a conversation saves it, when saving is on
      watch(
        () => account.user?.uid,
        () => void flush(),
      ),
    ];
    document.addEventListener('visibilitychange', onVisibility);
  }

  function stop(): void {
    clearInterval(timer);
    timer = undefined;
    stopWatches.forEach((stopWatch) => stopWatch());
    stopWatches = [];
    document.removeEventListener('visibilitychange', onVisibility);
  }

  return { enabled, active, status, lastSavedAt, setEnabled, flush, start, stop };
});
