import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcmToBase64 } from '@/shared/audio/pcm';
import type { PcmPlayer } from '@/shared/audio/pcmPlayer';
import { createOpenAiVoice } from './realtimeVoice';

const KEY = 'test-secret-key-123456';
const config = { apiKey: KEY, model: 'gpt-realtime-2.1-mini', voice: 'marin' };
type Handler = ((event?: unknown) => void) | null;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  onopen: Handler = null;
  onmessage: Handler = null;
  onerror: Handler = null;
  onclose: Handler = null;
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWebSocket.instances.push(this);
    // Opens on the next tick, like a real socket
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  receive(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  /** The last response.create sent */
  lastRequest(): Record<string, unknown> | undefined {
    return this.sent.filter((event) => event.type === 'response.create').at(-1);
  }
}

interface FakePlayer extends PcmPlayer {
  played: number[][];
}

function fakePlayer(): FakePlayer {
  const played: number[][] = [];
  return {
    played,
    play: (pcm) => played.push([...pcm]),
    stop: vi.fn(),
    close: vi.fn(),
    whenDrained: vi.fn(() => Promise.resolve()),
  };
}

function socket(index = -1): FakeWebSocket {
  const ws = FakeWebSocket.instances.at(index);
  if (!ws) throw new Error('No socket');
  return ws;
}

/** Waits until the voice has asked for a response */
async function asked(ws: () => FakeWebSocket, count = 1): Promise<void> {
  await vi.waitFor(() =>
    expect(ws().sent.filter((event) => event.type === 'response.create')).toHaveLength(count),
  );
}

describe('createOpenAiVoice', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens a Realtime session for the model with the key in the subprotocol, set to speak', async () => {
    const voice = createOpenAiVoice(() => config, undefined, fakePlayer());
    const done = voice.speak('Hola a todos', 'es');
    await asked(socket);

    const ws = socket();
    expect(ws.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
    expect(ws.protocols).toEqual(['realtime', `openai-insecure-api-key.${KEY}`]);
    expect(ws.url).not.toContain(KEY);
    expect(ws.sent[0]).toMatchObject({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        audio: { output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' } },
      },
    });
    const request = ws.lastRequest() as { response: Record<string, unknown> };
    expect(request.response).toMatchObject({
      conversation: 'none',
      output_modalities: ['audio'],
      input: [],
    });
    expect(String(request.response.instructions)).toMatch(/exactly[\s\S]*Hola a todos$/);

    ws.receive({ type: 'response.created', response: { id: 'r1' } });
    ws.receive({ type: 'response.done', response: { id: 'r1', status: 'completed' } });
    await expect(done).resolves.toBeUndefined();
  });

  it('plays the audio of its own response as it arrives and reports the usage', async () => {
    const player = fakePlayer();
    const onUsage = vi.fn();
    const voice = createOpenAiVoice(() => config, onUsage, player);
    const done = voice.speak('Hola', 'es');
    await asked(socket);
    const ws = socket();

    ws.receive({ type: 'response.created', response: { id: 'r1' } });
    ws.receive({
      type: 'response.output_audio.delta',
      response_id: 'r1',
      delta: pcmToBase64(new Int16Array([1, 2])),
    });
    ws.receive({
      type: 'response.output_audio.delta',
      response_id: 'other',
      delta: pcmToBase64(new Int16Array([9])),
    });
    ws.receive({
      type: 'response.done',
      response: {
        id: 'r1',
        status: 'completed',
        usage: { input_tokens: 80, output_tokens: 300, input_token_details: { cached_tokens: 64 } },
      },
    });
    await done;

    expect(player.played).toEqual([[1, 2]]);
    expect(player.whenDrained).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      model: 'gpt-realtime-2.1-mini',
      inputTokens: 80,
      cachedInputTokens: 64,
      outputTokens: 300,
    });
  });

  it('keeps the session for the next sentence, and opens another when the voice changes', async () => {
    let current = { ...config };
    const voice = createOpenAiVoice(() => current, undefined, fakePlayer());
    for (const text of ['Uno', 'Dos']) {
      const done = voice.speak(text, 'es');
      await vi.waitFor(() => expect(socket().lastRequest()).toBeTruthy());
      socket().receive({ type: 'response.done', response: { status: 'completed' } });
      await done;
      socket().sent = [];
    }
    expect(FakeWebSocket.instances).toHaveLength(1);

    current = { ...config, voice: 'cedar' };
    const done = voice.speak('Tres', 'es');
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    await asked(socket);
    expect(socket(0).close).toHaveBeenCalled();
    socket().receive({ type: 'response.done', response: { status: 'completed' } });
    await done;
  });

  it('stop() cancels the response, silences the player and settles the sentence', async () => {
    const player = fakePlayer();
    const voice = createOpenAiVoice(() => config, undefined, player);
    const done = voice.speak('Hola', 'es');
    await asked(socket);
    socket().receive({ type: 'response.created', response: { id: 'r1' } });

    voice.stop();

    await expect(done).resolves.toBeUndefined();
    expect(socket().sent.at(-1)).toEqual({ type: 'response.cancel', response_id: 'r1' });
    expect(player.stop).toHaveBeenCalled();
    expect(player.whenDrained).not.toHaveBeenCalled();
  });

  it('rejects with the mapped error when the server refuses, so the browser voice takes over', async () => {
    const voice = createOpenAiVoice(() => config, undefined, fakePlayer());
    const done = voice.speak('Hola', 'es');
    await asked(socket);
    socket().receive({
      type: 'error',
      error: { code: 'invalid_api_key', message: `bad key ${KEY}` },
    });
    await expect(done).rejects.toMatchObject({ status: 401 });
    await expect(done).rejects.not.toHaveProperty('message', expect.stringContaining(KEY));
  });

  it('rejects when a response fails or the socket drops', async () => {
    const voice = createOpenAiVoice(() => config, undefined, fakePlayer());
    const failed = voice.speak('Hola', 'es');
    await asked(socket);
    socket().receive({
      type: 'response.done',
      response: { status: 'failed', status_details: { error: { message: 'boom' } } },
    });
    await expect(failed).rejects.toMatchObject({ userMessageKey: 'errors.ttsFailed' });

    const dropped = voice.speak('Otra', 'es');
    await asked(socket, 2);
    socket().onclose?.();
    await expect(dropped).rejects.toMatchObject({ userMessageKey: 'errors.ttsFailed' });
  });

  it('goes to the Azure resource with its deployment, and never to OpenAI with an Azure key', async () => {
    const azure = {
      ...config,
      endpoint: 'https://my-res.openai.azure.com',
      model: 'my-voice',
    };
    const voice = createOpenAiVoice(() => azure, undefined, fakePlayer());
    void voice.speak('Hola', 'es');
    await asked(socket);
    expect(socket().url).toBe(
      `wss://my-res.openai.azure.com/openai/v1/realtime?model=my-voice&api-key=${KEY}`,
    );
    voice.close?.();
  });

  it('skips blank text without opening anything', async () => {
    const voice = createOpenAiVoice(() => config, undefined, fakePlayer());
    await voice.speak('  ', 'es');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
