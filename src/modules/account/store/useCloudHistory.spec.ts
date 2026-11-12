import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

interface Ref {
  path: string;
}

/** A tiny in-memory Firestore: documents by path */
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  failReads: false,
  failWrites: false,
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
  const DELETE = Symbol('delete');
  const join = (parent: { path?: string }, segments: string[]): Ref => ({
    path: [parent.path, ...segments].filter(Boolean).join('/'),
  });
  return {
    doc: (parent: { path?: string }, ...segments: string[]): Ref => join(parent, segments),
    collection: (parent: { path?: string }, ...segments: string[]): Ref => join(parent, segments),
    query: (ref: Ref): Ref => ref,
    orderBy: (): null => null,
    limit: (): null => null,
    startAfter: (): null => null,
    serverTimestamp: (): string => 'now',
    deleteField: (): symbol => DELETE,
    updateDoc: (ref: Ref, fields: Record<string, unknown>): Promise<void> => {
      if (store.failWrites) return Promise.reject(new Error('denied'));
      const merged = Object.entries({ ...store.docs.get(ref.path), ...fields }).filter(
        ([, value]) => value !== DELETE,
      );
      store.docs.set(ref.path, Object.fromEntries(merged));
      return Promise.resolve();
    },
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
    store.failWrites = false;
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

  it('names and stars a conversation, and an empty name removes it', async () => {
    saved('1000', 1000, [['a']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    expect(await history.rename('1000', '  Weekly   sync ')).toBe(true);
    expect(await history.setStarred('1000', true)).toBe(true);
    expect(store.docs.get(`${BASE}/1000`)).toMatchObject({ title: 'Weekly sync', starred: true });
    expect(history.items[0]).toMatchObject({ title: 'Weekly sync', starred: true });
    await history.rename('1000', '');
    expect(store.docs.get(`${BASE}/1000`)).not.toHaveProperty('title');
  });

  it('keeps the name, summary and cost written from the page of a conversation', async () => {
    saved('1000', 1000, [['a']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    await history.open('1000');
    const shown = useSessionViewer().snapshot;
    if (!shown) throw new Error('not opened');
    const usage = [{ model: 'm', inputTokens: 5, cachedInputTokens: 0, outputTokens: 3 }];

    expect(
      await history.keep('1000', { ...shown, title: ' Budget  review ', summary: ['New'], usage }),
    ).toBe(true);

    expect(store.docs.get(`${BASE}/1000`)).toMatchObject({
      title: 'Budget review',
      summary: ['New'],
      usage,
      updatedAt: 'now',
    });
    expect(history.items[0]).toMatchObject({ title: 'Budget review', summary: ['New'] });
    // Opened again, it is read anew: name and summary included
    await history.open('1000');
    expect(useSessionViewer().snapshot).toMatchObject({ title: 'Budget review', summary: ['New'] });

    expect(await history.keep('1000', { ...shown, summary: ['New'] })).toBe(true);
    expect(store.docs.get(`${BASE}/1000`)).not.toHaveProperty('title');
  });

  it('says so when what was written could not be kept', async () => {
    saved('1000', 1000, [['a']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    await history.open('1000');
    const shown = useSessionViewer().snapshot;
    if (!shown) throw new Error('not opened');
    store.failWrites = true;

    expect(await history.keep('1000', { ...shown, title: 'Nope' })).toBe(false);
    expect(history.errorKey).toBe('account.history.updateFailed');
    expect(history.items[0]?.title).toBe('');
  });

  it('puts the name back when saving it failed', async () => {
    saved('1000', 1000, [['a']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    store.failWrites = true;
    expect(await history.rename('1000', 'Nope')).toBe(false);
    expect(history.items[0]?.title).toBe('');
    expect(history.errorKey).toBe('account.history.updateFailed');
  });

  it('deletes a selection and reads what was said to search it', async () => {
    saved('1000', 1000, [['alpha']]);
    saved('2000', 2000, [['beta']]);
    saved('3000', 3000, [['gamma']]);
    signIn();
    const history = useCloudHistory();
    await history.load();
    await history.indexContent();
    expect(history.texts.get('2000')).toBe('beta\nt:beta');
    expect(await history.removeMany(['1000', '3000'])).toBe(true);
    expect(history.items.map((item) => item.id)).toEqual(['2000']);
    expect(history.texts.has('1000')).toBe(false);
    expect([...store.docs.keys()].every((key) => key.includes('/2000'))).toBe(true);
  });
});
