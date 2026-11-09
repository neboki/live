import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

interface Ref {
  path: string;
}

/** A tiny in-memory Firestore: documents by path */
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failReads: false,
}));

function children(path: string): { id: string; ref: Ref; data: () => Record<string, unknown> }[] {
  const depth = path.split('/').length + 1;
  return [...store.docs.entries()]
    .filter(([key]) => key.startsWith(`${path}/`) && key.split('/').length === depth)
    .map(([key, data]) => ({
      id: key.split('/').pop() ?? '',
      ref: { path: key },
      data: () => data,
    }));
}

vi.mock('../firebase', () => ({
  ACCOUNTS_ENABLED: true,
  getFirebaseAuth: vi.fn(() => Promise.resolve({})),
  getFirebaseDb: vi.fn(() => Promise.resolve({})),
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));

vi.mock('firebase/firestore', () => {
  const join = (parent: { path?: string }, segments: string[]): Ref => ({
    path: [parent.path, ...segments].filter(Boolean).join('/'),
  });
  return {
    doc: (parent: { path?: string }, ...segments: string[]): Ref => join(parent, segments),
    collection: (parent: { path?: string }, ...segments: string[]): Ref => join(parent, segments),
    query: (ref: Ref): Ref => ref,
    orderBy: (): null => null,
    limit: (): null => null,
    getDocs: (ref: Ref): Promise<{ docs: ReturnType<typeof children> }> => {
      if (store.failReads) return Promise.reject(new Error('offline'));
      const docs = children(ref.path).sort(
        (a, b) => Number(b.data().startedAt ?? 0) - Number(a.data().startedAt ?? 0),
      );
      return Promise.resolve({ docs });
    },
    getDoc: (ref: Ref): Promise<{ exists: () => boolean; data: () => unknown }> =>
      Promise.resolve({
        exists: () => store.docs.has(ref.path),
        data: () => store.docs.get(ref.path),
      }),
    writeBatch: (): unknown => {
      const deletes: string[] = [];
      return {
        delete: (ref: Ref): void => void deletes.push(ref.path),
        commit: (): Promise<void> => {
          deletes.forEach((path) => store.docs.delete(path));
          return Promise.resolve();
        },
      };
    },
  };
});

vi.mock('@/shared/errors', () => ({ logError: vi.fn() }));

const { useAccount } = await import('./useAccount');
const { useCloudHistory } = await import('./useCloudHistory');
const { useCloudSave } = await import('./useCloudSave');
const { useSessionViewer } = await import('@/modules/session');

const BASE = 'users/u1/sessions';

function saved(id: string, startedAt: number, lines: string[][]): void {
  store.docs.set(`${BASE}/${id}`, {
    version: 1,
    startedAt,
    endedAt: startedAt + 60_000,
    pair: { from: 'en', to: 'es' },
    glossary: '',
    summary: ['point'],
    usage: [],
    lineCount: lines.flat().length,
    chunkSize: 200,
  });
  lines.forEach((chunk, index) =>
    store.docs.set(`${BASE}/${id}/chunks/${index}`, {
      lines: chunk.map((source, i) => ({ at: startedAt + i, source, translation: `t:${source}` })),
    }),
  );
}

function signIn(): void {
  useAccount().user = { uid: 'u1', name: 'Ana', email: 'a@example.com', photoUrl: null };
}

describe('useCloudHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    store.docs.clear();
    store.failReads = false;
    window.localStorage.clear();
  });

  it('lists the newest conversations first', async () => {
    saved('1000', 1000, [['a']]);
    saved('2000', 2000, [['b']]);
    store.docs.set('users/other/sessions/3000', { startedAt: 3000 });
    signIn();
    const history = useCloudHistory();
    await history.load();
    expect(history.items.map((item) => item.id)).toEqual(['2000', '1000']);
    expect(history.items[0]).toMatchObject({ lineCount: 1, pair: { from: 'en', to: 'es' } });
  });

  it('lists nothing without an account', async () => {
    saved('1000', 1000, [['a']]);
    const history = useCloudHistory();
    await history.load();
    expect(history.items).toEqual([]);
  });

  it('opens a conversation with its chunks in order', async () => {
    const many = Array.from({ length: 11 }, (_, i) => [`s${i}`]);
    saved('1000', 1000, many);
    signIn();
    const history = useCloudHistory();
    expect(await history.open('1000')).toBe(true);
    const viewer = useSessionViewer();
    expect(viewer.source).toBe('cloud');
    expect(viewer.cloudId).toBe('1000');
    // Chunk "10" comes after "9", not after "1"
    expect(viewer.snapshot?.lines.map((line) => line.source)).toEqual(many.flat());
    expect(viewer.snapshot?.summary).toEqual(['point']);
  });

  it('says so when a conversation is gone', async () => {
    signIn();
    const history = useCloudHistory();
    expect(await history.open('404')).toBe(false);
    expect(history.errorKey).toBe('account.history.gone');
  });

  it('deletes one conversation, its sentences too, and leaves its page', async () => {
    saved('1000', 1000, [['a'], ['b']]);
    saved('2000', 2000, [['c']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    await history.open('1000');
    expect(await history.remove('1000')).toBe(true);
    expect([...store.docs.keys()].filter((key) => key.includes('/1000'))).toEqual([]);
    expect(history.items.map((item) => item.id)).toEqual(['2000']);
    expect(useSessionViewer().snapshot).toBeNull();
  });

  it('deletes everything and turns saving off', async () => {
    saved('1000', 1000, [['a']]);
    saved('2000', 2000, [['b']]);
    signIn();
    const cloud = useCloudSave();
    cloud.setEnabled(true);
    const history = useCloudHistory();
    expect(await history.removeAll()).toBe(true);
    expect(store.docs.size).toBe(0);
    expect(cloud.enabled).toBe(false);
  });

  it('reports a failed read', async () => {
    signIn();
    store.failReads = true;
    const history = useCloudHistory();
    await history.load();
    expect(history.errorKey).toBe('account.history.loadFailed');
    expect(history.loading).toBe(false);
  });
});
