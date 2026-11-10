import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref, watch } from 'vue';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { useAccount } from './useAccount';
import { PREFS_SAVE_DELAY_MS, useCloudPrefs, type CloudPrefsOptions } from './useCloudPrefs';

interface Ref {
  path: string;
}

/** A tiny in-memory Firestore: documents by path */
const cloud = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { docs, fail: false };
  const guard = (): Promise<void> =>
    state.fail ? Promise.reject(new Error('offline')) : Promise.resolve();
  const api = {
    doc: (_db: unknown, ...segments: string[]): Ref => ({ path: segments.join('/') }),
    serverTimestamp: (): string => 'SERVER_TIME',
    getDoc: async (ref: Ref): Promise<{ exists: () => boolean; data: () => unknown }> => {
      await guard();
      const data = docs.get(ref.path);
      return { exists: () => data !== undefined, data: () => data };
    },
    setDoc: async (ref: Ref, data: Record<string, unknown>): Promise<void> => {
      await guard();
      docs.set(ref.path, data);
    },
    deleteDoc: async (ref: Ref): Promise<void> => {
      await guard();
      docs.delete(ref.path);
    },
  };
  return Object.assign(state, { api });
});

vi.mock('../firebase', () => ({
  ACCOUNTS_ENABLED: true,
  getFirebaseAuth: vi.fn(() => Promise.resolve({})),
  getFirebaseDb: vi.fn(() => Promise.resolve({})),
  loadFirestore: vi.fn(() => Promise.resolve(cloud.api)),
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));

vi.mock('@/shared/errors', () => ({ logError: vi.fn() }));

const PATH = 'users/u1/settings/prefs';
const KEYS = ['theme', 'locale'];

const busy = ref(false);
const reload = vi.fn();

function options(): CloudPrefsOptions {
  return {
    keys: KEYS,
    read: () => {
      const values: Record<string, string> = {};
      for (const key of KEYS) {
        const value = readStorage(key);
        if (value !== null) values[key] = value;
      }
      return values;
    },
    write: (values) => {
      for (const key of KEYS) {
        const value = values[key];
        writeStorage(key, typeof value === 'string' ? value : null);
      }
    },
    isBusy: () => busy.value,
    reload,
    watchBusy: (onIdle) =>
      watch(busy, (now) => {
        if (!now) onIdle();
      }),
  };
}

function signIn(): void {
  useAccount().user = { uid: 'u1', name: 'Ana', email: 'a@example.com', photoUrl: null };
}

async function settle(): Promise<void> {
  await vi.runAllTimersAsync();
}

describe('useCloudPrefs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    cloud.docs.clear();
    cloud.fail = false;
    busy.value = false;
    reload.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    useCloudPrefs().stop();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('applies the account’s copy on sign-in and reloads', async () => {
    cloud.docs.set(PATH, { version: 1, values: { theme: 'dark' }, updatedAt: 'T' });
    writeStorage('locale', 'en');
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(readStorage('theme')).toBe('dark');
    expect(readStorage('locale')).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when the account’s copy is already this browser’s', async () => {
    cloud.docs.set(PATH, { version: 1, values: { locale: 'en', theme: 'dark' }, updatedAt: 'T' });
    writeStorage('theme', 'dark');
    writeStorage('locale', 'en');
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(useCloudPrefs().status).toBe('saved');
  });

  it('uploads this browser’s preferences when the account has none', async () => {
    writeStorage('theme', 'light');
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(cloud.docs.get(PATH)).toEqual({
      version: 1,
      values: { theme: 'light' },
      updatedAt: 'SERVER_TIME',
    });
  });

  it('saves later changes after a pause, and only synced keys', async () => {
    useCloudPrefs().start(options());
    signIn();
    await settle();
    writeStorage('api-key', 'sk-secret');
    await settle();
    expect(cloud.docs.get(PATH)).toBeUndefined();
    writeStorage('theme', 'dark');
    await vi.advanceTimersByTimeAsync(PREFS_SAVE_DELAY_MS - 1);
    expect(cloud.docs.get(PATH)).toBeUndefined();
    await settle();
    expect(cloud.docs.get(PATH)?.values).toEqual({ theme: 'dark' });
  });

  it('waits for the live session to end before applying', async () => {
    cloud.docs.set(PATH, { version: 1, values: { theme: 'dark' }, updatedAt: 'T' });
    busy.value = true;
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(readStorage('theme')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    busy.value = false;
    await settle();
    expect(readStorage('theme')).toBe('dark');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does nothing while signed out', async () => {
    useCloudPrefs().start(options());
    writeStorage('theme', 'dark');
    await settle();
    expect(cloud.docs.size).toBe(0);
  });

  it('keeps working when the account cannot be reached', async () => {
    cloud.fail = true;
    writeStorage('theme', 'dark');
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(useCloudPrefs().status).toBe('error');
    expect(readStorage('theme')).toBe('dark');
  });

  it('removes the account’s copy', async () => {
    cloud.docs.set(PATH, { version: 1, values: {}, updatedAt: 'T' });
    useCloudPrefs().start(options());
    signIn();
    await settle();
    expect(await useCloudPrefs().remove()).toBe(true);
    expect(cloud.docs.has(PATH)).toBe(false);
  });
});
