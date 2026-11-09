import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

type AuthListener = (user: unknown) => void;

const firebase = vi.hoisted(() => ({
  listener: null as ((user: unknown) => void) | null,
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../firebase', () => ({
  ACCOUNTS_ENABLED: true,
  getFirebaseAuth: vi.fn(() => Promise.resolve({})),
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: (_auth: unknown, listener: AuthListener): void => {
    firebase.listener = listener;
  },
  signInWithPopup: firebase.signInWithPopup,
  signInWithRedirect: firebase.signInWithRedirect,
  signOut: firebase.signOut,
}));

vi.mock('@/shared/errors', () => ({ logError: vi.fn() }));

const { useAccount } = await import('./useAccount');

function failure(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('useAccount', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    firebase.listener = null;
    vi.clearAllMocks();
  });

  it('is not ready until Firebase reports the kept session', async () => {
    const account = useAccount();
    expect(account.ready).toBe(false);
    await account.init();
    firebase.listener?.({
      uid: 'u1',
      displayName: 'Ana',
      email: 'ana@example.com',
      photoURL: null,
    });
    expect(account.ready).toBe(true);
    expect(account.user).toEqual({
      uid: 'u1',
      name: 'Ana',
      email: 'ana@example.com',
      photoUrl: null,
    });
    firebase.listener?.(null);
    expect(account.user).toBeNull();
  });

  it('falls back to a redirect when the popup is blocked', async () => {
    firebase.signInWithPopup.mockRejectedValueOnce(failure('auth/popup-blocked'));
    const account = useAccount();
    await account.signIn();
    expect(firebase.signInWithRedirect).toHaveBeenCalledOnce();
    expect(account.errorKey).toBeNull();
    expect(account.busy).toBe(false);
  });

  it('says nothing when the user closes the popup', async () => {
    firebase.signInWithPopup.mockRejectedValueOnce(failure('auth/popup-closed-by-user'));
    const account = useAccount();
    await account.signIn();
    expect(account.errorKey).toBeNull();
  });

  it('reports other sign-in failures', async () => {
    firebase.signInWithPopup.mockRejectedValueOnce(failure('auth/network-request-failed'));
    const account = useAccount();
    await account.signIn();
    expect(account.errorKey).toBe('account.signInFailed');
    expect(firebase.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('signs out', async () => {
    const account = useAccount();
    await account.signOut();
    expect(firebase.signOut).toHaveBeenCalledOnce();
    expect(account.busy).toBe(false);
  });
});
