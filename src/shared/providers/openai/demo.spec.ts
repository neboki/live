import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  DEMO_API: '/api/demo',
}));

const { requestDemo } = await import('./demo');
const { apiBase, authHeaders, transcriptionSocket, translationSocket } = await import('./endpoint');
const { REALTIME_TRANSCRIPTION_URL } = await import('./config');

function answer(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('requestDemo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the grant the demo server hands out', async () => {
    answer(200, { key: 'temp-key-1', seconds: 180 });
    await expect(requestDemo()).resolves.toEqual({ key: 'temp-key-1', seconds: 180 });
    expect(fetch).toHaveBeenCalledWith('/api/demo/session', { method: 'POST' });
  });

  it.each([
    [429, { error: { code: 'demo_client' } }, 'errors.demoQuota'],
    [429, { error: { code: 'demo_day' } }, 'errors.demoQuota'],
    [502, { error: { code: 'demo_unavailable' } }, 'errors.demoUnavailable'],
    [200, { nothing: true }, 'errors.demoUnavailable'],
  ])('answers %i %j with %s', async (status, body, key) => {
    answer(status, body);
    await expect(requestDemo()).resolves.toMatchObject({ userMessageKey: key });
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(requestDemo()).resolves.toMatchObject({
      userMessageKey: 'errors.connectionFailed',
    });
  });
});

describe('demo access', () => {
  const access = { apiKey: 'temp-key-1', endpoint: '/api/demo' };

  it('sends text requests to the demo server and transcribes straight with OpenAI', () => {
    expect(apiBase(access)).toBe('/api/demo/v1');
    expect(authHeaders(access)).toEqual({ Authorization: 'Bearer temp-key-1' });
    expect(transcriptionSocket(access)).toEqual({
      url: REALTIME_TRANSCRIPTION_URL,
      protocols: ['realtime', 'openai-insecure-api-key.temp-key-1'],
    });
  });

  it('has no interpreter', () => {
    expect(() => translationSocket(access)).toThrow();
  });
});
