import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcmToBase64 } from '@/shared/audio/pcm';
import type { InterpreterCallbacks } from '../../types';
import { REALTIME_TRANSLATION_URL } from '../config';
import { INTERPRETER_DRAIN_MS, openAiInterpreter } from './realtimeTranslate';

const KEY = 'test-secret-key-123456';
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
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

type MockCallbacks = {
  [K in keyof InterpreterCallbacks]-?: Mock<NonNullable<InterpreterCallbacks[K]>>;
};

function callbacks(): MockCallbacks {
  return {
    onSource: vi.fn(),
    onTranslation: vi.fn(),
    onAudio: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
    onUsage: vi.fn(),
  };
}

async function connect(cb: InterpreterCallbacks): Promise<{
  session: Awaited<ReturnType<typeof openAiInterpreter.connect>>;
  ws: FakeWebSocket;
}> {
  const promise = openAiInterpreter.connect({ apiKey: KEY, language: 'es' }, cb);
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error('No socket');
  ws.open();
  return { session: await promise, ws };
}

describe('openAiInterpreter', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the translation socket with the key in the subprotocol and sets the language', async () => {
    const { ws } = await connect(callbacks());
    expect(ws.url).toBe(REALTIME_TRANSLATION_URL);
    expect(ws.protocols).toEqual(['realtime', `openai-insecure-api-key.${KEY}`]);
    expect(ws.sent[0]).toEqual({
      type: 'session.update',
      session: {
        audio: {
          input: { transcription: { model: 'gpt-transcribe' } },
          output: { language: 'es' },
        },
      },
    });
  });

  it('refuses Azure', async () => {
    await expect(
      openAiInterpreter.connect(
        { apiKey: 'x', endpoint: 'https://r.openai.azure.com', language: 'es' },
        callbacks(),
      ),
    ).rejects.toMatchObject({ userMessageKey: 'errors.interpreterAzure' });
  });

  it('sends every chunk, silence too, and hands back text and voice', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    const silence = new Int16Array(240);
    session.append(silence);
    expect(ws.sent.at(-1)).toEqual({
      type: 'session.input_audio_buffer.append',
      audio: pcmToBase64(silence),
    });

    ws.receive({ type: 'session.input_transcript.delta', delta: 'Hello' });
    ws.receive({ type: 'session.output_transcript.delta', delta: 'Hola' });
    ws.receive({ type: 'session.output_audio.delta', delta: pcmToBase64(new Int16Array([1, 2])) });
    expect(cb.onSource).toHaveBeenCalledWith('Hello');
    expect(cb.onTranslation).toHaveBeenCalledWith('Hola');
    expect(Array.from(cb.onAudio.mock.calls[0]?.[0] as Int16Array)).toEqual([1, 2]);
  });

  it('changes language mid-session', async () => {
    const { session, ws } = await connect(callbacks());
    session.setLanguage('fr');
    expect(ws.sent.at(-1)).toEqual({
      type: 'session.update',
      session: {
        audio: {
          input: { transcription: { model: 'gpt-transcribe' } },
          output: { language: 'fr' },
        },
      },
    });
  });

  it('closes with session.close, reports the billed audio and waits for session.closed', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    session.append(new Int16Array(24000));
    session.close();
    expect(ws.sent.at(-1)).toEqual({ type: 'session.close' });
    expect(cb.onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-realtime-translate', audioSeconds: 1 }),
    );
    expect(ws.close).not.toHaveBeenCalled();
    ws.receive({ type: 'session.output_transcript.delta', delta: 'fin' });
    expect(cb.onTranslation).toHaveBeenCalledWith('fin');
    ws.receive({ type: 'session.closed' });
    expect(ws.close).toHaveBeenCalled();
  });

  it('gives up waiting for session.closed after the drain time', async () => {
    const { session, ws } = await connect(callbacks());
    session.close();
    vi.advanceTimersByTime(INTERPRETER_DRAIN_MS);
    expect(ws.close).toHaveBeenCalled();
  });

  it('stops for good on a rejected key', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({ type: 'error', error: { code: 'invalid_api_key', message: 'bad' } });
    expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(ws.close).toHaveBeenCalled();
  });
});
