import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { parseSnapshot, useSessionViewer } from '@/modules/session';
import { logError } from '@/shared/errors';
import { getFirebaseDb } from '../firebase';
import { fromCloudSession, toHistoryItem, type CloudHistoryItem } from '../utils/cloudSession';
import { useAccount } from './useAccount';
import { useCloudSave } from './useCloudSave';

/** The history shows the latest conversations; older ones stay in the account */
export const HISTORY_LIMIT = 30;
/** Firestore takes at most 500 writes per batch; deleting stays below that */
const DELETES_PER_BATCH = 400;

type Firestore = typeof import('firebase/firestore');

async function firestore(): Promise<[Awaited<ReturnType<typeof getFirebaseDb>>, Firestore]> {
  return Promise.all([getFirebaseDb(), import('firebase/firestore')]);
}

/**
 * The conversations kept in the signed-in account: the latest ones for the sidebar,
 * opening one in the session page, and deleting one or all of them.
 */
export const useCloudHistory = defineStore('cloud-history', () => {
  const account = useAccount();
  const cloudSave = useCloudSave();
  const viewer = useSessionViewer();
  const items = ref<CloudHistoryItem[]>([]);
  const loading = ref(false);
  /** Id of the conversation being opened, for its "opening…" state */
  const openingId = ref<string | null>(null);
  const deleting = ref(false);
  /** i18n key of why the last history action failed */
  const errorKey = ref<string | null>(null);
  let started = false;

  /** Reads the latest conversations of the account. Never throws. */
  async function load(): Promise<void> {
    const uid = account.user?.uid;
    if (!uid) {
      items.value = [];
      return;
    }
    loading.value = true;
    try {
      const [db, { collection, getDocs, limit, orderBy, query }] = await firestore();
      const snap = await getDocs(
        query(
          collection(db, 'users', uid, 'sessions'),
          orderBy('startedAt', 'desc'),
          limit(HISTORY_LIMIT),
        ),
      );
      // The account may have changed while reading
      if (account.user?.uid !== uid) return;
      items.value = snap.docs
        .map((item) => toHistoryItem(item.id, item.data()))
        .filter((item): item is CloudHistoryItem => item !== null);
      errorKey.value = null;
    } catch (err) {
      logError('Reading the saved conversations failed', err);
      errorKey.value = 'account.history.loadFailed';
    } finally {
      loading.value = false;
    }
  }

  /** Opens a saved conversation in the session page. False when it could not. */
  async function open(id: string): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid || openingId.value) return false;
    openingId.value = id;
    errorKey.value = null;
    try {
      const [db, { collection, doc, getDoc, getDocs }] = await firestore();
      const session = doc(db, 'users', uid, 'sessions', id);
      const [data, chunks] = await Promise.all([
        getDoc(session),
        getDocs(collection(session, 'chunks')),
      ]);
      if (!data.exists()) {
        items.value = items.value.filter((item) => item.id !== id);
        errorKey.value = 'account.history.gone';
        return false;
      }
      const ordered = [...chunks.docs]
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((chunk) => chunk.data());
      viewer.showSaved(parseSnapshot(fromCloudSession(data.data(), ordered)), id);
      return true;
    } catch (err) {
      logError('Opening a saved conversation failed', err);
      errorKey.value = 'account.history.openFailed';
      return false;
    } finally {
      openingId.value = null;
    }
  }

  /** Deletes the given conversations and their sentences, in as few batches as it can */
  async function deleteSessions(uid: string, ids: readonly string[]): Promise<void> {
    const [db, { collection, doc, getDocs, writeBatch }] = await firestore();
    let batch = writeBatch(db);
    let pending = 0;
    async function add(ref: Parameters<typeof batch.delete>[0]): Promise<void> {
      batch.delete(ref);
      pending += 1;
      if (pending >= DELETES_PER_BATCH) {
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
      }
    }
    for (const id of ids) {
      const session = doc(db, 'users', uid, 'sessions', id);
      const chunks = await getDocs(collection(session, 'chunks'));
      for (const chunk of chunks.docs) await add(chunk.ref);
      await add(session);
    }
    if (pending > 0) await batch.commit();
  }

  /** Deletes one conversation from the account. False when it could not. */
  async function remove(id: string): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid || deleting.value) return false;
    deleting.value = true;
    errorKey.value = null;
    try {
      await deleteSessions(uid, [id]);
      items.value = items.value.filter((item) => item.id !== id);
      if (viewer.cloudId === id) viewer.close();
      return true;
    } catch (err) {
      logError('Deleting a saved conversation failed', err);
      errorKey.value = 'account.history.deleteFailed';
      return false;
    } finally {
      deleting.value = false;
    }
  }

  /**
   * Deletes every conversation of the account, not only the listed ones, and turns saving
   * off so the one in progress is not written again. False when it could not.
   */
  async function removeAll(): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid || deleting.value) return false;
    deleting.value = true;
    errorKey.value = null;
    cloudSave.setEnabled(false);
    try {
      const [db, { collection, getDocs }] = await firestore();
      const all = await getDocs(collection(db, 'users', uid, 'sessions'));
      await deleteSessions(
        uid,
        all.docs.map((item) => item.id),
      );
      items.value = [];
      if (viewer.source === 'cloud') viewer.close();
      return true;
    } catch (err) {
      logError('Deleting all saved conversations failed', err);
      errorKey.value = 'account.history.deleteFailed';
      return false;
    } finally {
      deleting.value = false;
    }
  }

  /** Follows the account and the saves; safe to call more than once */
  function start(): void {
    if (started || !account.enabled) return;
    started = true;
    watch(
      () => account.user?.uid,
      () => {
        items.value = [];
        if (viewer.source === 'cloud') viewer.close();
        void load();
      },
      { immediate: true },
    );
    // A conversation saved for the first time joins the list
    watch(
      () => cloudSave.lastSavedId,
      (id) => {
        if (id && !items.value.some((item) => item.id === id)) void load();
      },
    );
  }

  return { items, loading, openingId, deleting, errorKey, load, open, remove, removeAll, start };
});
