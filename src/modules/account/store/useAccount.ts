import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { User } from 'firebase/auth';
import { logError } from '@/shared/errors';
import { ACCOUNTS_ENABLED, getFirebaseAuth } from '../firebase';

/** Who is signed in, as much as the app shows */
export interface AccountUser {
  uid: string;
  name: string;
  email: string;
  photoUrl: string | null;
}

/** Popup errors that mean "use a full-page redirect instead" */
const NEEDS_REDIRECT = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-environment',
]);
/** Popup errors that are the user's own choice, not a failure */
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
}

function toAccountUser(user: User): AccountUser {
  return {
    uid: user.uid,
    name: user.displayName ?? user.email ?? '',
    email: user.email ?? '',
    photoUrl: user.photoURL,
  };
}

/**
 * The signed-in account (Google through Firebase Auth). Signing in is optional: without
 * an account everything stays on this device, as before.
 */
export const useAccount = defineStore('account', () => {
  const enabled = ACCOUNTS_ENABLED;
  const user = ref<AccountUser | null>(null);
  /** False until Firebase says whether a session was kept from last time */
  const ready = ref(!enabled);
  const busy = ref(false);
  /** i18n key of why the last sign-in failed */
  const errorKey = ref<string | null>(null);
  let started = false;

  /** Starts listening to the sign-in state; safe to call more than once */
  async function init(): Promise<void> {
    if (!enabled || started) return;
    started = true;
    try {
      const [auth, { onAuthStateChanged }] = await Promise.all([
        getFirebaseAuth(),
        import('firebase/auth'),
      ]);
      onAuthStateChanged(auth, (next) => {
        user.value = next ? toAccountUser(next) : null;
        ready.value = true;
      });
    } catch (err) {
      started = false;
      ready.value = true;
      logError('Starting sign-in failed', err);
    }
  }

  async function signIn(): Promise<void> {
    if (!enabled || busy.value) return;
    busy.value = true;
    errorKey.value = null;
    try {
      const [auth, { GoogleAuthProvider, signInWithPopup, signInWithRedirect }] = await Promise.all(
        [getFirebaseAuth(), import('firebase/auth')],
      );
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        if (!NEEDS_REDIRECT.has(errorCode(err))) throw err;
        await signInWithRedirect(auth, provider);
      }
    } catch (err) {
      if (!CANCELLED.has(errorCode(err))) {
        logError('Signing in failed', err);
        errorKey.value = 'account.signInFailed';
      }
    } finally {
      busy.value = false;
    }
  }

  async function signOut(): Promise<void> {
    if (!enabled || busy.value) return;
    busy.value = true;
    try {
      const [auth, { signOut: firebaseSignOut }] = await Promise.all([
        getFirebaseAuth(),
        import('firebase/auth'),
      ]);
      await firebaseSignOut(auth);
    } catch (err) {
      logError('Signing out failed', err);
    } finally {
      busy.value = false;
    }
  }

  return { enabled, user, ready, busy, errorKey, init, signIn, signOut };
});
