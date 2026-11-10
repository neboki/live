import { defineStore } from 'pinia';
import { reactive, ref, watch } from 'vue';
import { parseSnapshot, useSessionViewer, type SessionSnapshot } from '@/modules/session';
import { logError } from '@/shared/errors';
import { getFirebaseDb } from '../firebase';
import {
  cleanTitle,
  fromCloudSession,
  toHistoryItem,
  type CloudHistoryItem,
} from '../utils/cloudSession';
import { linesText } from '../utils/historyFilter';
import { useAccount } from './useAccount';
import { useCloudSave } from './useCloudSave';

/** Conversations read at a time; the conversations page reads more on demand */
export const HISTORY_LIMIT = 30;
/** Firestore takes at most 500 writes per batch; deleting stays below that */
const DELETES_PER_BATCH = 400;
/** Conversations read at once when searching inside them */
const READ_PARALLEL = 4;

type Firestore = typeof import('firebase/firestore');
type Cursor = import('firebase/firestore').QueryDocumentSnapshot;

/** The Firestore library, loaded once on first use (it stays out of the first download) */
let library: Promise<Firestore> | null = null;

async function firestore(): Promise<[Awaited<ReturnType<typeof getFirebaseDb>>, Firestore]> {
  library ??= import('firebase/firestore');
  return Promise.all([getFirebaseDb(), library]);
}

/**
 * The conversations kept in the signed-in account: the latest ones (more on demand),
 * opening one in the session page, searching inside them, naming and starring them, and
 * deleting some or all of them.
 */
export const useCloudHistory = defineStore('cloud-history', () => {
  const account = useAccount();
  const cloudSave = useCloudSave();
  const viewer = useSessionViewer();
  const items = ref<CloudHistoryItem[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  /** There are older conversations than the ones read */
  const hasMore = ref(false);
  /** Id of the conversation being opened, for its "opening…" state */
  const openingId = ref<string | null>(null);
  const deleting = ref(false);
  /** Reading the sentences of the listed conversations, to search inside them */
  const indexing = ref(false);
  /** The sentences of the conversations read so far, as one text each (by id) */
  const texts = reactive(new Map<string, string>());
  /** i18n key of why the last history action failed */
  const errorKey = ref<string | null>(null);
  /** Whole conversations already read, so opening or searching twice costs nothing */
  const snapshots = new Map<string, SessionSnapshot>();
  let cursor: Cursor | null = null;
  let started = false;

  function forget(ids: readonly string[]): void {
    for (const id of ids) {
      snapshots.delete(id);
      texts.delete(id);
    }
  }

  function toItems(docs: readonly Cursor[]): CloudHistoryItem[] {
    return docs
      .map((item) => toHistoryItem(item.id, item.data()))
      .filter((item): item is CloudHistoryItem => item !== null);
  }

  /** Reads the latest conversations of the account, from the start. Never throws. */
  async function load(): Promise<void> {
    const uid = account.user?.uid;
    if (!uid) {
      items.value = [];
      hasMore.value = false;
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
      items.value = toItems(snap.docs);
      cursor = snap.docs.at(-1) ?? null;
      hasMore.value = snap.docs.length >= HISTORY_LIMIT;
      errorKey.value = null;
    } catch (err) {
      logError('Reading the saved conversations failed', err);
      errorKey.value = 'account.history.loadFailed';
    } finally {
      loading.value = false;
    }
  }

  /** Reads the next older conversations. Never throws. */
  async function loadMore(): Promise<void> {
    const uid = account.user?.uid;
    if (!uid || !cursor || !hasMore.value || loadingMore.value || loading.value) return;
    loadingMore.value = true;
    try {
      const [db, { collection, getDocs, limit, orderBy, query, startAfter }] = await firestore();
      const snap = await getDocs(
        query(
          collection(db, 'users', uid, 'sessions'),
          orderBy('startedAt', 'desc'),
          startAfter(cursor),
          limit(HISTORY_LIMIT),
        ),
      );
      if (account.user?.uid !== uid) return;
      const known = new Set(items.value.map((item) => item.id));
      items.value = [...items.value, ...toItems(snap.docs).filter((item) => !known.has(item.id))];
      cursor = snap.docs.at(-1) ?? cursor;
      hasMore.value = snap.docs.length >= HISTORY_LIMIT;
      errorKey.value = null;
    } catch (err) {
      logError('Reading older saved conversations failed', err);
      errorKey.value = 'account.history.loadFailed';
    } finally {
      loadingMore.value = false;
    }
  }

  /** A whole conversation, read once; null when it is no longer in the account. Throws. */
  async function fetchSnapshot(uid: string, id: string): Promise<SessionSnapshot | null> {
    const cached = snapshots.get(id);
    if (cached) return cached;
    const [db, { collection, doc, getDoc, getDocs }] = await firestore();
    const session = doc(db, 'users', uid, 'sessions', id);
    const [data, chunks] = await Promise.all([
      getDoc(session),
      getDocs(collection(session, 'chunks')),
    ]);
    if (!data.exists()) {
      items.value = items.value.filter((item) => item.id !== id);
      forget([id]);
      return null;
    }
    const ordered = [...chunks.docs]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((chunk) => chunk.data());
    const snapshot = parseSnapshot(fromCloudSession(data.data(), ordered));
    if (account.user?.uid === uid) {
      snapshots.set(id, snapshot);
      texts.set(id, linesText(snapshot.lines));
    }
    return snapshot;
  }

  /** Opens a saved conversation in the session page. False when it could not. */
  async function open(id: string): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid || openingId.value) return false;
    openingId.value = id;
    errorKey.value = null;
    try {
      const snapshot = await fetchSnapshot(uid, id);
      if (!snapshot) {
        errorKey.value = 'account.history.gone';
        return false;
      }
      viewer.showSaved(snapshot, id);
      return true;
    } catch (err) {
      logError('Opening a saved conversation failed', err);
      errorKey.value = 'account.history.openFailed';
      return false;
    } finally {
      openingId.value = null;
    }
  }

  /**
   * Whole conversations, in the order asked, for exporting them; those no longer in the
   * account are left out. Null when reading failed.
   */
  async function read(ids: readonly string[]): Promise<SessionSnapshot[] | null> {
    const uid = account.user?.uid;
    if (!uid) return null;
    errorKey.value = null;
    try {
      const found: SessionSnapshot[] = [];
      for (const id of ids) {
        const snapshot = await fetchSnapshot(uid, id);
        if (snapshot) found.push(snapshot);
      }
      return found;
    } catch (err) {
      logError('Reading saved conversations to export them failed', err);
      errorKey.value = 'account.history.openFailed';
      return null;
    }
  }

  /**
   * Reads the sentences of the listed conversations not read yet, a few at a time, so a
   * search also finds what was said. One that fails is skipped (logged). Never throws.
   */
  async function indexContent(): Promise<void> {
    const uid = account.user?.uid;
    if (!uid || indexing.value) return;
    indexing.value = true;
    try {
      const pending = items.value.map((item) => item.id).filter((id) => !texts.has(id));
      const next = async (): Promise<void> => {
        for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
          if (account.user?.uid !== uid) return;
          try {
            await fetchSnapshot(uid, id);
          } catch (err) {
            logError(`Reading conversation ${id} to search it failed`, err);
          }
        }
      };
      await Promise.all(Array.from({ length: READ_PARALLEL }, next));
    } finally {
      indexing.value = false;
    }
  }

  /** Writes the person's own fields of a conversation, shown at once and undone on failure */
  async function patch(
    id: string,
    change: Partial<Pick<CloudHistoryItem, 'title' | 'starred'>>,
  ): Promise<boolean> {
    const uid = account.user?.uid;
    const index = items.value.findIndex((item) => item.id === id);
    const before = items.value[index];
    if (!uid || !before) return false;
    items.value[index] = { ...before, ...change };
    errorKey.value = null;
    try {
      const [db, { deleteField, doc, serverTimestamp, updateDoc }] = await firestore();
      const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (change.title !== undefined) fields.title = change.title || deleteField();
      if (change.starred !== undefined) fields.starred = change.starred || deleteField();
      await updateDoc(doc(db, 'users', uid, 'sessions', id), fields);
      return true;
    } catch (err) {
      logError('Updating a saved conversation failed', err);
      const now = items.value.findIndex((item) => item.id === id);
      if (now !== -1) items.value.splice(now, 1, before);
      errorKey.value = 'account.history.updateFailed';
      return false;
    }
  }

  /** Names a conversation; an empty name goes back to its date. False when it could not. */
  function rename(id: string, title: string): Promise<boolean> {
    return patch(id, { title: cleanTitle(title) });
  }

  function setStarred(id: string, starred: boolean): Promise<boolean> {
    return patch(id, { starred });
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

  /** Deletes the given conversations from the account. False when it could not. */
  async function removeMany(ids: readonly string[]): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid || deleting.value || ids.length === 0) return false;
    deleting.value = true;
    errorKey.value = null;
    try {
      await deleteSessions(uid, ids);
      const gone = new Set(ids);
      items.value = items.value.filter((item) => !gone.has(item.id));
      forget(ids);
      if (viewer.cloudId !== null && gone.has(viewer.cloudId)) viewer.close();
      return true;
    } catch (err) {
      logError('Deleting saved conversations failed', err);
      errorKey.value = 'account.history.deleteFailed';
      // Some may be gone already: read the list again so it shows what is left
      void load();
      return false;
    } finally {
      deleting.value = false;
    }
  }

  /** Deletes one conversation from the account. False when it could not. */
  function remove(id: string): Promise<boolean> {
    return removeMany([id]);
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
      hasMore.value = false;
      cursor = null;
      snapshots.clear();
      texts.clear();
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
        hasMore.value = false;
        cursor = null;
        snapshots.clear();
        texts.clear();
        if (viewer.source === 'cloud') viewer.close();
        void load();
      },
      { immediate: true },
    );
    // A conversation saved for the first time joins the list; one saved again is read anew
    watch(
      () => [cloudSave.lastSavedId, cloudSave.lastSavedAt] as const,
      ([id]) => {
        if (!id) return;
        forget([id]);
        if (!items.value.some((item) => item.id === id)) void load();
      },
    );
  }

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    openingId,
    deleting,
    indexing,
    texts,
    errorKey,
    load,
    loadMore,
    open,
    read,
    indexContent,
    rename,
    setStarred,
    remove,
    removeMany,
    removeAll,
    start,
  };
});
