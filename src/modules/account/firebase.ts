// The Firebase web app that signs people in and keeps their conversations. Its config is
// public by design (Auth and the security rules guard the data); a build without it has
// no accounts at all.

import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const env = import.meta.env;

export const FIREBASE_CONFIG: FirebaseOptions | null =
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain:
          env.VITE_FIREBASE_AUTH_DOMAIN ?? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      }
    : null;

/** Whether this build lets people sign in */
export const ACCOUNTS_ENABLED = FIREBASE_CONFIG !== null;

/** Caches a lazy load; a failed one (offline) can be tried again */
function lazy<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = load();
      pending.catch(() => (pending = null));
    }
    return pending;
  };
}

const getFirebaseApp = lazy(async (): Promise<FirebaseApp> => {
  if (!FIREBASE_CONFIG) throw new Error('Firebase is not configured');
  const { initializeApp } = await import('firebase/app');
  return initializeApp(FIREBASE_CONFIG);
});

/**
 * The Auth instance, loaded on first use so the SDK stays out of the first page load.
 * Only call it when ACCOUNTS_ENABLED.
 */
export const getFirebaseAuth = lazy(async (): Promise<Auth> => {
  const [app, { getAuth }] = await Promise.all([getFirebaseApp(), import('firebase/auth')]);
  return getAuth(app);
});

/** The Firestore instance, loaded on first save or read. Only call it when ACCOUNTS_ENABLED. */
export const getFirebaseDb = lazy(async (): Promise<Firestore> => {
  const [app, { initializeFirestore }] = await Promise.all([
    getFirebaseApp(),
    import('firebase/firestore'),
  ]);
  // Optional fields of a sentence (speaker, language…) may be undefined: leave them out
  return initializeFirestore(app, { ignoreUndefinedProperties: true });
});
