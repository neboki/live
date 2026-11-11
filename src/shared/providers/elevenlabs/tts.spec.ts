import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PcmPlayer } from '@/shared/audio/pcmPlayer';
import { createElevenLabsTts } from './tts';

/** Shaped like an ElevenLabs key, built at runtime so no key-like text sits in the repo */
const KEY = ['sk', 'fakefakefakefakefake'].join('_');
const config = { apiKey: KEY, model: 'eleven_flash_v2_5', voice: 'voice/1' };

interface FakePlayer extends PcmPlayer {
  played: Int16Array[];
}

function fakePlayer(): FakePlayer {
  const played: Int16Array[] = [];
  return {
    played,
    play: (pcm) => played.push(pcm),
    stop: vi.fn(),
    close: vi.fn(),
    whenDrained: vi.fn(() => Promise.resolve()),
    whenLeft: vi.fn(() => Promise.resolve()),
  };
}

/** A streamed body: `chunks` arrive one read at a time; with `open` the stream stays open */
function streamed(
  chunks: number[][],
  open = false,
): {
  response: Response;
  push: (chunk: number[]) => void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      controller = ctl;
      chunks.forEach((chunk) => ctl.enqueue(new Uint8Array(chunk)));
      if (!open) ctl.close();
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'audio/pcm' } }),
    push: (chunk) => controller?.enqueue(new Uint8Array(chunk)),
  };
}

function sent(fetchMock: ReturnType<typeof vi.fn>, call = 0): [string, RequestInit] {
  return fetchMock.mock.calls[call] as [string, RequestInit];
}

describe('createElevenLabsTts', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let player: FakePlayer;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(streamed([[1, 0]]).response));
    player = fakePlayer();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts text, model and language with the xi-api-key header, asking for 24 kHz PCM', async () => {
    const tts = createElevenLabsTts(() => config, undefined, player);
    await tts.speak('Hola', 'es-ES');

    const [url, init] = sent(fetchMock);
    expect(url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice%2F1/stream?output_format=pcm_24000',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Hola',
      model_id: 'eleven_flash_v2_5',
      language_code: 'es',
    });
  });

  it('passes the sentence before in the same language, for a smoother join', async () => {
    const tts = createElevenLabsTts(() => config, undefined, player);
    await tts.speak('Hola a todos.', 'es');
    fetchMock.mockResolvedValueOnce(streamed([[1, 0]]).response);
    await tts.speak('Empezamos.', 'es');
    fetchMock.mockResolvedValueOnce(streamed([[1, 0]]).response);
    await tts.speak('Hello.', 'en');

    expect(JSON.parse(sent(fetchMock, 1)[1].body as string)).toMatchObject({
      previous_text: 'Hola a todos.',
    });
    expect(JSON.parse(sent(fetchMock, 2)[1].body as string)).not.toHaveProperty('previous_text');
  });

  it('leaves the language out when the tag has no ISO 639-1 code', async () => {
    const tts = createElevenLabsTts(() => config, undefined, player);
    await tts.speak('Hola', 'auto');
    expect(JSON.parse(sent(fetchMock)[1].body as string)).not.toHaveProperty('language_code');
  });

  it('plays the audio as it arrives, joining a sample split across reads, then waits for it', async () => {
    fetchMock.mockResolvedValueOnce(
      streamed([
        [1, 0, 2],
        [0, 3, 0],
      ]).response,
    );
    const tts = createElevenLabsTts(() => config, undefined, player);
    await tts.speak('Hola', 'es');

    expect(player.played.map((pcm) => [...pcm])).toEqual([[1], [2, 3]]);
    expect(player.whenLeft).toHaveBeenCalledTimes(1);
  });

  it('reports the characters of every clip, what ElevenLabs bills', async () => {
    const onUsage = vi.fn();
    const tts = createElevenLabsTts(() => config, onUsage, player);
    await tts.speak('Hola, ¿qué tal?', 'es');

    expect(onUsage).toHaveBeenCalledWith({
      model: 'eleven_flash_v2_5',
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      characters: 15,
    });
  });

  it('stop() cuts a clip still streaming; the clip is still billed', async () => {
    const { response, push } = streamed([[1, 0]], true);
    fetchMock.mockResolvedValueOnce(response);
    const onUsage = vi.fn();
    const tts = createElevenLabsTts(() => config, onUsage, player);
    const done = tts.speak('Adiós', 'es');
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    tts.stop();
    // The download is cancelled at once: the stream takes nothing more
    expect(() => push([2, 0])).toThrow();
    await expect(done).resolves.toBeUndefined();

    expect(player.stop).toHaveBeenCalled();
    expect(player.played).toHaveLength(1);
    expect(player.whenLeft).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ characters: 5 }));
  });

  it('passes the abort signal to fetch and stops the player on abort', async () => {
    const { response } = streamed([[1, 0]], true);
    fetchMock.mockResolvedValueOnce(response);
    const controller = new AbortController();
    const tts = createElevenLabsTts(() => config, undefined, player);
    const done = tts.speak('Hola', 'es', controller.signal);
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    expect(sent(fetchMock)[1].signal).toBe(controller.signal);
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(player.stop).toHaveBeenCalled();
  });

  it('tells a rejected key from an account with no credit, keeping the key out', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(`{"detail":{"status":"invalid_api_key","message":"bad ${KEY}"}}`, {
        status: 401,
      }),
    );
    const tts = createElevenLabsTts(() => config, undefined, player);
    const rejected = tts.speak('Hola', 'es');
    await expect(rejected).rejects.toMatchObject({ status: 401, userMessageKey: 'errors.ttsKey' });
    await expect(rejected).rejects.not.toHaveProperty('message', expect.stringContaining(KEY));

    fetchMock.mockResolvedValueOnce(
      new Response('{"detail":{"status":"quota_exceeded","message":"No credits"}}', {
        status: 401,
      }),
    );
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({
      userMessageKey: 'errors.ttsCredit',
    });
    expect(player.played).toHaveLength(0);
  });

  it('maps a network failure to an external service error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const tts = createElevenLabsTts(() => config, undefined, player);
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({
      status: 502,
      userMessageKey: 'errors.ttsFailed',
    });
  });

  it('fails when the reply has no body, and when the stream breaks', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const tts = createElevenLabsTts(() => config, undefined, player);
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({
      userMessageKey: 'errors.ttsFailed',
    });

    const broken = new ReadableStream<Uint8Array>({
      pull(ctl) {
        ctl.error(new TypeError('network error'));
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(broken, { status: 200 }));
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({ status: 502 });
  });

  it('skips blank text without calling the API', async () => {
    const tts = createElevenLabsTts(() => config, undefined, player);
    await tts.speak('   ', 'es');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
