import { defineStore } from 'pinia';
import { ref, watch, type WatchStopHandle } from 'vue';
import type { DocumentReference } from 'firebase/firestore';
import { brandCustom, setBrandCustom, type BrandCustom } from '@/shared/brand/brand';
import { logError } from '@/shared/errors';
import { getFirebaseDb, loadFirestore } from '../firebase';
import { useAccount } from './useAccount';

/** Changes are sent once typing stops for this long */
export const BRAND_SAVE_DELAY_MS = 800;

export type CloudBrandStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Where the brand lives in the account: users/{uid}/settings/brand */
function brandPath(uid: string): [string, string, string, string] {
  return ['users', uid, 'settings', 'brand'];
}

function isEmpty(custom: BrandCustom): boolean {
  return Object.keys(custom).length === 0;
}

/**
 * Keeps the person's own brand (name, logo, colour) in their account, so it follows
 * them to any device they sign in on. On sign-in the account's copy wins; without one,
 * what this browser has is uploaded. Every later change is saved after a short pause.
 * Signed out, the brand stays in this browser as before.
 */
export const useCloudBrand = defineStore('cloud-brand', () => {
  const account = useAccount();
  const status = ref<CloudBrandStatus>('idle');

  /** The brand as last read from or written to the account, to skip echoes */
  let synced = '';
  /** Account whose copy has been read; until then local changes are not sent */
  let pulledFor: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopWatches: WatchStopHandle[] = [];

  async function brandRef(uid: string): Promise<DocumentReference> {
    const [db, { doc }] = await Promise.all([getFirebaseDb(), loadFirestore()]);
    return doc(db, ...brandPath(uid));
  }

  /** Writes the current brand to the account, or deletes it when there is none */
  async function push(uid: string): Promise<void> {
    const custom = brandCustom.value;
    const json = JSON.stringify(custom);
    if (json === synced) return;
    status.value = 'saving';
    try {
      const [target, { setDoc, deleteDoc, serverTimestamp }] = await Promise.all([
        brandRef(uid),
        loadFirestore(),
      ]);
      if (isEmpty(custom)) await deleteDoc(target);
      else await setDoc(target, { ...custom, updatedAt: serverTimestamp() });
      synced = json;
      status.value = 'saved';
    } catch (err) {
      logError('Saving the brand to the account failed', err);
      status.value = 'error';
    }
  }

  /** Reads the account's brand on sign-in: it wins, or this browser's goes up */
  async function pull(uid: string): Promise<void> {
    try {
      const [target, { getDoc }] = await Promise.all([brandRef(uid), loadFirestore()]);
      const snapshot = await getDoc(target);
      if (account.user?.uid !== uid) return;
      pulledFor = uid;
      if (snapshot.exists()) {
        setBrandCustom(snapshot.data());
        synced = JSON.stringify(brandCustom.value);
        status.value = 'saved';
      } else {
        synced = JSON.stringify({});
        if (!isEmpty(brandCustom.value)) await push(uid);
      }
    } catch (err) {
      logError('Reading the brand from the account failed', err);
      status.value = 'error';
    }
  }

  function schedule(): void {
    const uid = account.user?.uid;
    if (!uid || pulledFor !== uid) return;
    clearTimeout(timer);
    timer = setTimeout(() => void push(uid), BRAND_SAVE_DELAY_MS);
  }

  /** Follows the account and the brand; safe to call more than once */
  function start(): void {
    if (stopWatches.length > 0 || !account.enabled) return;
    stopWatches = [
      watch(
        () => account.user?.uid,
        (uid) => {
          clearTimeout(timer);
          pulledFor = null;
          synced = '';
          status.value = 'idle';
          if (uid) void pull(uid);
        },
        { immediate: true },
      ),
      watch(brandCustom, schedule),
    ];
  }

  function stop(): void {
    for (const unwatch of stopWatches) unwatch();
    stopWatches = [];
    clearTimeout(timer);
  }

  /** Deletes the account's copy (before deleting the account). False when it could not. */
  async function remove(): Promise<boolean> {
    const uid = account.user?.uid;
    if (!uid) return true;
    clearTimeout(timer);
    try {
      const [target, { deleteDoc }] = await Promise.all([brandRef(uid), loadFirestore()]);
      await deleteDoc(target);
      pulledFor = null;
      return true;
    } catch (err) {
      logError('Deleting the brand from the account failed', err);
      return false;
    }
  }

  return { status, start, stop, remove };
});
