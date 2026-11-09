import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PcmPlayer } from '@/shared/audio/pcmPlayer';
import { createOpenAiTts } from './tts';

const config = { apiKey: 'sk-test', model: 'gpt-4o-mini-tts', voice: 'alloy' };

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

/** `seconds` of silence as PCM16 bytes */
function silence(seconds: number): number[] {
  return new Array<number>(seconds * 24_000 * 2).fill(0);
}

describe('createOpenAiTts', () => {
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

  it('posts model, voice and input with a Bearer header, asking for raw PCM', async () => {
    const tts = createOpenAiTts(() => config, undefined, player);
    await tts.speak('Hola', 'es');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: 'Hola',
      response_format: 'pcm',
    });
  });

  it('plays the audio as it arrives, joining a sample split across reads, then waits for it', async () => {
    fetchMock.mockResolvedValueOnce(
      streamed([
        [1, 0, 2],
        [0, 3, 0],
      ]).response,
    );
    const tts = createOpenAiTts(() => config, undefined, player);
    await tts.speak('Hola', 'es');

    expect(player.played.map((pcm) => [...pcm])).toEqual([[1], [2, 3]]);
    expect(player.whenDrained).toHaveBeenCalledTimes(1);
  });

  it('reports the usage of every clip, with its exact duration once it has arrived', async () => {
    fetchMock.mockResolvedValueOnce(streamed([silence(1), silence(0.5)]).response);
    const onUsage = vi.fn();
    const tts = createOpenAiTts(() => config, onUsage, player);
    await tts.speak('Hola, ¿qué tal?', 'es');

    expect(onUsage).toHaveBeenCalledWith({
      model: 'gpt-4o-mini-tts',
      inputTokens: 4,
      cachedInputTokens: 0,
      outputTokens: 0,
      audioSeconds: 1.5,
    });
  });

  it('stop() cuts a clip still streaming and estimates what was billed from the text', async () => {
    const { response, push } = streamed([[1, 0]], true);
    fetchMock.mockResolvedValueOnce(response);
    const onUsage = vi.fn();
    const tts = createOpenAiTts(() => config, onUsage, player);
    const done = tts.speak('Adiós', 'es');
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    tts.stop();
    push([2, 0]);
    await expect(done).resolves.toBeUndefined();

    expect(player.stop).toHaveBeenCalled();
    expect(player.played).toHaveLength(1);
    expect(player.whenDrained).not.toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ audioSeconds: 5 / 15 }));
  });

  it('passes the abort signal to fetch and stops the player on abort', async () => {
    const { response } = streamed([[1, 0]], true);
    fetchMock.mockResolvedValueOnce(response);
    const controller = new AbortController();
    const tts = createOpenAiTts(() => config, undefined, player);
    const done = tts.speak('Hola', 'es', controller.signal);
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal);
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(player.stop).toHaveBeenCalled();
  });

  it('maps a 401 to the invalid key error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":{"code":"invalid_api_key"}}', { status: 401 }),
    );
    const tts = createOpenAiTts(() => config, undefined, player);
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({ status: 401 });
    expect(player.played).toHaveLength(0);
  });

  it('maps a network failure to an external service error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const tts = createOpenAiTts(() => config, undefined, player);
    await expect(tts.speak('Hola', 'es')).rejects.toMatchObject({ status: 502 });
  });

  it('fails when the reply has no body, and when the stream breaks', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const tts = createOpenAiTts(() => config, undefined, player);
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
    const tts = createOpenAiTts(() => config, undefined, player);
    await tts.speak('   ', 'es');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
