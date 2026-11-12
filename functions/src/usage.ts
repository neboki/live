// How many free seconds each account, and everyone together, has used in a month.

import type { Firestore } from 'firebase-admin/firestore';

export interface MonthUsage {
  /** Seconds this account has used this month */
  user: number;
  /** Seconds everyone together has used this month */
  total: number;
}

export interface UsageStore {
  /** What this account and everyone have used in `month` */
  read: (uid: string, month: string) => Promise<MonthUsage>;
  /** Adds `seconds` to this account and to everyone; resolves with the new totals */
  charge: (uid: string, month: string, seconds: number) => Promise<MonthUsage>;
}

/** In memory: for tests */
export function createMemoryUsage(): UsageStore {
  const seconds = new Map<string, number>();
  const get = (key: string): number => seconds.get(key) ?? 0;

  return {
    read: async (uid, month) => ({ user: get(`${month}/${uid}`), total: get(month) }),
    charge: async (uid, month, added) => {
      seconds.set(`${month}/${uid}`, get(`${month}/${uid}`) + added);
      seconds.set(month, get(month) + added);
      return { user: get(`${month}/${uid}`), total: get(month) };
    },
  };
}

/**
 * In Firestore: `freeUsage/{month}` for everyone and `freeUsage/{month}/users/{uid}` per
 * account, each `{ seconds }`. The security rules close them to the app; only this
 * function writes them. It runs on one instance, so it keeps what it read in memory and
 * only reads each document once.
 */
export function createFirestoreUsage(db: Firestore): UsageStore {
  const known = new Map<string, number>();

  async function secondsAt(path: string): Promise<number> {
    const cached = known.get(path);
    if (cached !== undefined) return cached;
    const snap = await db.doc(path).get();
    const value: unknown = snap.get('seconds');
    const seconds = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    // A charge that landed while this read was on its way already set the newer value
    return known.get(path) ?? (known.set(path, seconds), seconds);
  }

  async function add(path: string, seconds: number): Promise<number> {
    const before = await secondsAt(path);
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.doc(path).set({ seconds: FieldValue.increment(seconds) }, { merge: true });
    const after = (known.get(path) ?? before) + seconds;
    known.set(path, after);
    return after;
  }

  return {
    read: async (uid, month) => {
      const [user, total] = await Promise.all([
        secondsAt(`freeUsage/${month}/users/${uid}`),
        secondsAt(`freeUsage/${month}`),
      ]);
      return { user, total };
    },
    charge: async (uid, month, seconds) => {
      const [user, total] = await Promise.all([
        add(`freeUsage/${month}/users/${uid}`, seconds),
        add(`freeUsage/${month}`, seconds),
      ]);
      return { user, total };
    },
  };
}
