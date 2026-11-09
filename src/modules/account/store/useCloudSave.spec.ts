import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

interface Write {
  path: string;
  data: Record<string, unknown>;
}

const firestore = vi.hoisted(() => ({
  writes: [] as Write[][],
  fail: false,
}));

vi.mock('../firebase', () => ({
  ACCOUNTS_ENABLED: true,
  getFirebaseAuth: vi.fn(() => Promise.resolve({})),
  getFirebaseDb: vi.fn(() => Promise.resolve({})),
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  doc: (parent: { path?: string }, ...segments: string[]): { path: string } => ({
    path: [parent.path, ...segments].filter(Boolean).join('/'),
  }),
  serverTimestamp: (): string => 'SERVER_TIME',
  writeBatch: (): unknown => {
    const pending: Write[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>): void => {
        pending.push({ path: ref.path, data });
      },
      commit: (): Promise<void> => {
        if (firestore.fail) return Promise.reject(new Error('offline'));
        firestore.writes.push(pending);
        return Promise.resolve();
      },
    };
  },
}));

vi.mock('@/shared/errors', () => ({ logError: vi.fn() }));

const { useAccount } = await import('./useAccount');
const { useCloudSave } = await import('./useCloudSave');
const { useSessionRecord } = await import('@/modules/session');

function signIn(): void {
  useAccount().user = { uid: 'u1', name: 'Ana', email: 'a@example.com', photoUrl: null };
}

function beginWith(count: number): ReturnType<typeof useSessionRecord> {
  const record = useSessionRecord();
  record.begin({ pair: { from: 'en', to: 'es' }, startedAt: 1000 });
  for (let i = 0; i < count; i++) record.addLine({ at: i, source: `s${i}`, translation: `t${i}` });
  return record;
}

describe('useCloudSave', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    firestore.writes = [];
    firestore.fail = false;
    window.localStorage.clear();
  });

  afterEach(() => {
    useCloudSave().stop();
  });

  it('sends nothing until the user turns saving on', async () => {
    signIn();
    beginWith(2);
    await useCloudSave().flush();
    expect(firestore.writes).toEqual([]);
  });

  it('sends nothing without an account', async () => {
    beginWith(2);
    const cloud = useCloudSave();
    cloud.setEnabled(true);
    await cloud.flush();
    expect(firestore.writes).toEqual([]);
    expect(cloud.active).toBe(false);
  });

  it('saves the conversation and then only what is new', async () => {
    signIn();
    const record = beginWith(2);
    const cloud = useCloudSave();
    cloud.enabled = true;
    await cloud.flush();
    expect(firestore.writes).toHaveLength(1);
    const [session, chunk] = firestore.writes[0] ?? [];
    expect(session?.path).toBe('users/u1/sessions/1000');
    expect(session?.data).toMatchObject({ lineCount: 2, updatedAt: 'SERVER_TIME' });
    expect(chunk?.path).toBe('users/u1/sessions/1000/chunks/0');
    expect(chunk?.data.lines).toHaveLength(2);
    expect(cloud.status).toBe('saved');

    // Nothing changed: no write
    await cloud.flush();
    expect(firestore.writes).toHaveLength(1);

    record.addLine({ at: 9, source: 'new', translation: 'nuevo' });
    await cloud.flush();
    expect(firestore.writes).toHaveLength(2);
    expect(firestore.writes[1]?.[1]?.data.lines).toHaveLength(3);
  });

  it('skips a conversation where nothing was said', async () => {
    signIn();
    beginWith(0);
    const cloud = useCloudSave();
    cloud.enabled = true;
    await cloud.flush();
    expect(firestore.writes).toEqual([]);
  });

  it('says when saving failed and tries the same again next time', async () => {
    signIn();
    beginWith(1);
    const cloud = useCloudSave();
    cloud.enabled = true;
    firestore.fail = true;
    await cloud.flush();
    expect(cloud.status).toBe('error');
    firestore.fail = false;
    await cloud.flush();
    expect(cloud.status).toBe('saved');
    expect(firestore.writes).toHaveLength(1);
  });

  it('saves as soon as the conversation ends', async () => {
    signIn();
    const record = beginWith(1);
    const cloud = useCloudSave();
    cloud.enabled = true;
    cloud.start();
    record.end();
    await nextTick();
    await vi.waitFor(() => expect(firestore.writes).toHaveLength(1));
    expect(firestore.writes[0]?.[0]?.data.endedAt).toEqual(expect.any(Number));
  });

  it('remembers the choice on this device', () => {
    useCloudSave().setEnabled(true);
    setActivePinia(createPinia());
    expect(useCloudSave().enabled).toBe(true);
  });
});
