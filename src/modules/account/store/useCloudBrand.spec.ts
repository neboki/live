import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { brand, brandCustom, resetBrandCustom, updateBrandCustom } from '@/shared/brand/brand';
import { useAccount } from './useAccount';
import { BRAND_SAVE_DELAY_MS, useCloudBrand } from './useCloudBrand';

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

const PATH = 'users/u1/settings/brand';

function signIn(): void {
  useAccount().user = { uid: 'u1', name: 'Ana', email: 'a@example.com', photoUrl: null };
}

async function settle(): Promise<void> {
  await vi.runAllTimersAsync();
}

describe('useCloudBrand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    cloud.docs.clear();
    cloud.fail = false;
    resetBrandCustom();
  });

  afterEach(() => {
    useCloudBrand().stop();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('takes the account’s brand on sign-in', async () => {
    cloud.docs.set(PATH, { name: 'Ingeteam', accent: '#0055a4', updatedAt: 'T' });
    updateBrandCustom({ name: 'Local' });
    useCloudBrand().start();
    signIn();
    await settle();
    expect(brand.value.name).toBe('Ingeteam');
    expect(brandCustom.value).toEqual({ name: 'Ingeteam', accent: '#0055a4' });
    expect(useCloudBrand().status).toBe('saved');
  });

  it('uploads this browser’s brand when the account has none', async () => {
    updateBrandCustom({ name: 'Acme' });
    useCloudBrand().start();
    signIn();
    await settle();
    expect(cloud.docs.get(PATH)).toEqual({ name: 'Acme', updatedAt: 'SERVER_TIME' });
  });

  it('saves later changes after a pause, and deletes the copy when reset', async () => {
    useCloudBrand().start();
    signIn();
    await settle();
    expect(cloud.docs.has(PATH)).toBe(false);

    updateBrandCustom({ accent: '#123456' });
    await vi.advanceTimersByTimeAsync(BRAND_SAVE_DELAY_MS - 1);
    expect(cloud.docs.has(PATH)).toBe(false);
    await settle();
    expect(cloud.docs.get(PATH)).toMatchObject({ accent: '#123456' });

    resetBrandCustom();
    await settle();
    expect(cloud.docs.has(PATH)).toBe(false);
  });

  it('sends nothing while signed out', async () => {
    useCloudBrand().start();
    updateBrandCustom({ name: 'Acme' });
    await settle();
    expect(cloud.docs.size).toBe(0);
    expect(useCloudBrand().status).toBe('idle');
  });

  it('reports a failed save and keeps the brand in the browser', async () => {
    useCloudBrand().start();
    signIn();
    await settle();
    cloud.fail = true;
    updateBrandCustom({ name: 'Acme' });
    await settle();
    expect(useCloudBrand().status).toBe('error');
    expect(brand.value.name).toBe('Acme');
  });

  it('deletes the account’s copy', async () => {
    cloud.docs.set(PATH, { name: 'Acme', updatedAt: 'T' });
    signIn();
    expect(await useCloudBrand().remove()).toBe(true);
    expect(cloud.docs.has(PATH)).toBe(false);
  });
});
