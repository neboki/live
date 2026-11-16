import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  FREE_API: '/api/free',
}));

const { fetchFreeBalance, requestFreeSession, sendFreeTick, setIdTokenSource } =
  await import('./freePlan');
const { apiBase, authHeaders, transcriptionSocket, translationSocket, voiceSocket } =
  await import('./endpoint');
const { REALTIME_TRANSCRIPTION_URL } = await import('./config');

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const signedIn = (): void => setIdTokenSource(async () => 'id-token');

describe('requestFreeSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setIdTokenSource(null);
  });

  it('returns the grant the free server hands out, asked with the Google ID token', async () => {
    signedIn();
    answer(200, { key: 'temp-key-1', seconds: 1770, tickSeconds: 30 });
    await expect(requestFreeSession()).resolves.toEqual({
      key: 'temp-key-1',
      seconds: 1770,
      tickSeconds: 30,
    });
    expect(fetch).toHaveBeenCalledWith('/api/free/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer id-token' },
    });
  });

  it('asks to sign in when nobody is', async () => {
    answer(200, {});
    await expect(requestFreeSession()).resolves.toMatchObject({
      userMessageKey: 'errors.freeSignin',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [429, { error: { code: 'free_month' } }, 'errors.freeMonth'],
    [429, { error: { code: 'free_budget' } }, 'errors.freeBudget'],
    [401, { error: { code: 'free_signin' } }, 'errors.freeSignin'],
    [502, { error: { code: 'free_unavailable' } }, 'errors.freeUnavailable'],
    [200, { nothing: true }, 'errors.freeUnavailable'],
  ])('answers %i %j with %s', async (status, body, key) => {
    signedIn();
    answer(status, body);
    await expect(requestFreeSession()).resolves.toMatchObject({ userMessageKey: key });
  });

  it('reports an unreachable server', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(requestFreeSession()).resolves.toMatchObject({
      userMessageKey: 'errors.connectionFailed',
    });
  });
});

describe('fetchFreeBalance and sendFreeTick', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setIdTokenSource(null);
  });

  it('reads the minutes left this month', async () => {
    signedIn();
    answer(200, { seconds: 600, monthSeconds: 1800, available: true });
    await expect(fetchFreeBalance()).resolves.toEqual({
      seconds: 600,
      monthSeconds: 1800,
      available: true,
    });
  });

  it('checks in with the session key, not the Google token', async () => {
    answer(200, { seconds: 90 });
    await expect(sendFreeTick('temp-key-1')).resolves.toEqual({ seconds: 90 });
    expect(fetch).toHaveBeenCalledWith('/api/free/tick', {
      method: 'POST',
      headers: { Authorization: 'Bearer temp-key-1' },
    });
  });

  it('says when the session has ended', async () => {
    answer(401, { error: { code: 'free_expired' } });
    await expect(sendFreeTick('temp-key-1')).resolves.toMatchObject({
      userMessageKey: 'errors.freeEnded',
    });
  });
});

describe('free access', () => {
  const access = { apiKey: 'temp-key-1', endpoint: '/api/free' };

  it('sends text requests to the free server and transcribes straight with OpenAI', () => {
    expect(apiBase(access)).toBe('/api/free/v1');
    expect(authHeaders(access)).toEqual({ Authorization: 'Bearer temp-key-1' });
    expect(transcriptionSocket(access)).toEqual({
      url: REALTIME_TRANSCRIPTION_URL,
      protocols: ['realtime', 'openai-insecure-api-key.temp-key-1'],
    });
  });

  it('has no interpreter and no voice', () => {
    expect(() => translationSocket(access)).toThrow();
    expect(() => voiceSocket(access, 'any')).toThrow();
  });
});
