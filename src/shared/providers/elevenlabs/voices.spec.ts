import { afterEach, describe, expect, it, vi } from 'vitest';
import { listElevenLabsVoices } from './voices';

const KEY = ['sk', 'fakefakefakefakefake'].join('_');

describe('listElevenLabsVoices', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the account voices with the key and puts the user’s own first', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            voices: [
              { voice_id: 'b', name: 'Bella', category: 'premade' },
              { voice_id: 'a', name: 'Adam', category: 'premade' },
              { voice_id: 'm', name: 'My voice', category: 'cloned' },
              { name: 'no id' },
            ],
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const voices = await listElevenLabsVoices(KEY);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
    expect(voices.map((voice) => voice.id)).toEqual(['m', 'a', 'b']);
  });

  it('rejects with the key error when the key is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"detail":{"status":"x"}}', { status: 401 }))),
    );
    await expect(listElevenLabsVoices(KEY)).rejects.toMatchObject({
      userMessageKey: 'errors.ttsKey',
    });
  });
});
