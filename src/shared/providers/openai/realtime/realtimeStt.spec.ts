import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SttCallbacks, SttOptions, SttSession } from '../../types';
import {
  CONNECT_TIMEOUT_MS,
  DRAIN_MS,
  FLUSH_MS,
  INPUT_SAMPLE_RATE,
  MODELS,
  REALTIME_TRANSCRIPTION_URL,
  STABLE_CONNECTION_MS,
} from '../config';
import { openAiRealtimeStt } from './realtimeStt';

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

  receive(event: Record<string, unknown> | string): void {
    this.onmessage?.({ data: typeof event === 'string' ? event : JSON.stringify(event) });
  }

  fail(): void {
    this.onerror?.();
  }

  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  types(): unknown[] {
    return this.sent.map((message) => message.type);
  }
}

function last(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error('No socket opened');
  return socket;
}

type MockCallbacks = { [K in keyof SttCallbacks]-?: Mock<NonNullable<SttCallbacks[K]>> };

function callbacks(): MockCallbacks {
  return {
    onPartial: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onStatus: vi.fn(),
    onActivity: vi.fn(),
    onUsage: vi.fn(),
  };
}

async function connect(
  cb: SttCallbacks,
  options: Partial<SttOptions> = {},
): Promise<{ session: SttSession; ws: FakeWebSocket }> {
  const promise = openAiRealtimeStt.connect({ apiKey: KEY, keywords: [], ...options }, cb);
  const ws = last();
  ws.open();
  return { session: await promise, ws };
}

/** Samples of a constant level; 0x4000 is clearly speech, 0 is silence. */
function chunk(ms: number, level = 0x4000): Int16Array {
  return new Int16Array((INPUT_SAMPLE_RATE * ms) / 1000).fill(level);
}

/** Decodes the PCM16 samples of an input_audio_buffer.append event. */
function samplesOf(message: Record<string, unknown> | undefined): Int16Array {
  const bytes = Uint8Array.from(atob(String(message?.audio)), (char) => char.charCodeAt(0));
  return new Int16Array(bytes.buffer);
}

function consoleText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((arg: unknown) =>
      arg instanceof Error ? `${arg.message} ${String(arg.cause)}` : JSON.stringify(arg),
    )
    .join('\n');
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('connecting', () => {
  it('sends the key only in the subprotocol, never in the URL', async () => {
    const { ws } = await connect(callbacks());

    expect(ws.url).toBe(REALTIME_TRANSCRIPTION_URL);
    expect(ws.url).not.toContain(KEY);
    expect(ws.protocols).toEqual(['realtime', `openai-insecure-api-key.${KEY}`]);
  });

  it('configures the session with the default model and no keywords when there are none', async () => {
    const { ws } = await connect(callbacks());
    const update = ws.sent[0] as {
      type: string;
      session: { audio: { input: Record<string, unknown> } };
    };

    expect(update.type).toBe('session.update');
    expect(update.session.audio.input).toEqual({
      format: { type: 'audio/pcm', rate: INPUT_SAMPLE_RATE },
      transcription: { model: MODELS.transcription },
      turn_detection: null,
    });
  });

  it('caps keywords at 50 and honours a model override', async () => {
    const keywords = Array.from({ length: 60 }, (_, i) => `term${i}`);
    const { ws } = await connect(callbacks(), { keywords, model: 'custom-stt' });
    const transcription = (
      ws.sent[0] as {
        session: { audio: { input: { transcription: { model: string; keywords: string[] } } } };
      }
    ).session.audio.input.transcription;

    expect(transcription.model).toBe('custom-stt');
    expect(transcription.keywords).toHaveLength(50);
    expect(transcription.keywords[49]).toBe('term49');
  });

  it('sends the glossary as a prompt to gpt-4o transcription models', async () => {
    const { ws } = await connect(callbacks(), {
      keywords: ['Acme', 'SCADA'],
      model: 'gpt-4o-mini-transcribe',
    });
    const update = ws.sent[0] as {
      session: { audio: { input: { transcription: Record<string, unknown> } } };
    };

    expect(update.session.audio.input.transcription).toEqual({
      model: 'gpt-4o-mini-transcribe',
      prompt: 'Glossary: Acme, SCADA',
    });
  });

  it('rejects with connectionFailed when the socket errors before opening', async () => {
    const promise = openAiRealtimeStt.connect({ apiKey: KEY, keywords: [] }, callbacks());
    last().fail();

    await expect(promise).rejects.toMatchObject({ userMessageKey: 'errors.connectionFailed' });
  });

  it('rejects when the socket closes before opening', async () => {
    const promise = openAiRealtimeStt.connect({ apiKey: KEY, keywords: [] }, callbacks());
    last().drop();

    await expect(promise).rejects.toMatchObject({ userMessageKey: 'errors.connectionFailed' });
  });

  it('times out, rejects and closes the socket when it never opens', async () => {
    const promise = openAiRealtimeStt.connect({ apiKey: KEY, keywords: [] }, callbacks());
    const ws = last();
    const assertion = expect(promise).rejects.toMatchObject({
      userMessageKey: 'errors.connectionFailed',
    });
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

    await assertion;
    expect(ws.close).toHaveBeenCalled();
    expect(ws.onopen).toBeNull();
  });
});

describe('audio', () => {
  it('appends audio before committing the sentence', async () => {
    const { session, ws } = await connect(callbacks());
    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    session.append(chunk(600, 0));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    expect(ws.types()).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
  });

  it('sends audio as it arrives, without waiting for a timer (background tabs slow them down)', async () => {
    const { session, ws } = await connect(callbacks());

    session.append(chunk(100));

    expect(ws.types()).toEqual(['session.update', 'input_audio_buffer.append']);
  });

  it('does not append silence while no sentence is open', async () => {
    const { session, ws } = await connect(callbacks());
    for (let i = 0; i < 100; i++) {
      session.append(chunk(100, 0));
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    }

    expect(ws.types()).toEqual(['session.update']);
  });

  it('appends speech with the last 300 ms of silence before it', async () => {
    const { session, ws } = await connect(callbacks());
    // Levels under the speech threshold, tagged so the order can be read back
    for (const level of [1, 2, 3, 4, 5]) {
      session.append(chunk(100, level));
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    }
    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    const appends = ws.sent.filter((message) => message.type === 'input_audio_buffer.append');
    expect(appends).toHaveLength(1);
    const pcm = samplesOf(appends[0]);
    const tenth = INPUT_SAMPLE_RATE / 10;
    expect(pcm).toHaveLength(tenth * 4);
    expect([pcm[0], pcm[tenth], pcm[tenth * 2], pcm[tenth * 3]]).toEqual([3, 4, 5, 0x4000]);
  });

  it('sends the sentence tail, commits, then holds silence again', async () => {
    const { session, ws } = await connect(callbacks());
    for (const [ms, level] of [
      [100, 0x4000],
      [500, 0],
      [3000, 0],
    ] as const) {
      for (let t = 0; t < ms; t += 100) {
        session.append(chunk(100, level));
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
      }
    }

    expect(ws.types().filter((type) => type === 'input_audio_buffer.append')).toHaveLength(6);
    expect(ws.types().at(-1)).toBe('input_audio_buffer.commit');
  });
});

describe('transcripts', () => {
  it('accumulates deltas per item and emits finals in commit order', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({ type: 'input_audio_buffer.committed', item_id: 'a' });
    ws.receive({ type: 'input_audio_buffer.committed', item_id: 'b' });
    const delta = 'conversation.item.input_audio_transcription.delta';
    ws.receive({ type: delta, item_id: 'a', delta: 'Hel' });
    ws.receive({ type: delta, item_id: 'b', delta: 'Wor' });
    ws.receive({ type: delta, item_id: 'a', delta: 'lo' });
    ws.receive({ type: delta, item_id: 'b', delta: 'ld' });

    // Only the newest open sentence is shown
    expect(cb.onPartial.mock.calls).toEqual([['Wor'], ['World']]);

    const completed = 'conversation.item.input_audio_transcription.completed';
    ws.receive({ type: completed, item_id: 'b', transcript: 'World.' });
    expect(cb.onFinal).not.toHaveBeenCalled();
    expect(cb.onPartial).toHaveBeenLastCalledWith('Hello');

    ws.receive({ type: completed, item_id: 'a', transcript: 'Hello.', language: 'en' });
    expect(cb.onFinal.mock.calls).toEqual([
      ['Hello.', { language: 'en' }],
      ['World.', undefined],
    ]);
  });

  it('reports speech, then transcribing until the sentence is done, then idle', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);

    session.append(chunk(200));
    expect(cb.onActivity).toHaveBeenLastCalledWith('speech');
    session.append(chunk(600, 0));
    // Committed but not acknowledged yet: still on its way
    expect(cb.onActivity).toHaveBeenLastCalledWith('transcribing');

    ws.receive({ type: 'input_audio_buffer.committed', item_id: 'a' });
    expect(cb.onActivity).toHaveBeenLastCalledWith('transcribing');
    const completed = 'conversation.item.input_audio_transcription.completed';
    ws.receive({ type: completed, item_id: 'a', transcript: 'Hello.' });
    expect(cb.onActivity).toHaveBeenLastCalledWith('idle');
    expect(cb.onActivity.mock.calls).toEqual([['speech'], ['transcribing'], ['idle']]);
  });

  it('tells each final when its own sentence began, even with several on their way', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    const firstBegan = Date.now();
    session.append(chunk(200));
    session.append(chunk(600, 0));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 3000);
    const secondBegan = Date.now();
    session.append(chunk(200));
    session.append(chunk(600, 0));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);

    ws.receive({ type: 'input_audio_buffer.committed', item_id: 'a' });
    ws.receive({ type: 'input_audio_buffer.committed', item_id: 'b' });
    const completed = 'conversation.item.input_audio_transcription.completed';
    ws.receive({ type: completed, item_id: 'a', transcript: 'One.' });
    ws.receive({ type: completed, item_id: 'b', transcript: 'Two.' });

    const starts = cb.onFinal.mock.calls.map(([, meta]) => meta?.startedOn);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toBeGreaterThanOrEqual(firstBegan);
    expect(starts[0]).toBeLessThan(secondBegan);
    expect(starts[1]).toBeGreaterThanOrEqual(secondBegan);
  });

  it('drops a final that is only whitespace', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: '   ',
    });

    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('ignores unreadable messages', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive('{not json');

    expect(cb.onError).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports the tokens the event carries, and always the audio seconds sent', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    const completed = 'conversation.item.input_audio_transcription.completed';
    ws.receive({
      type: completed,
      item_id: 'a',
      transcript: 'Hi',
      usage: { type: 'tokens', input_tokens: 30, output_tokens: 5 },
    });
    session.append(chunk(500));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    ws.receive({ type: completed, item_id: 'b', transcript: 'There' });

    expect(cb.onUsage.mock.calls).toEqual([
      [
        {
          model: MODELS.transcription,
          inputTokens: 30,
          cachedInputTokens: 0,
          outputTokens: 5,
          audioSeconds: 0,
        },
      ],
      [
        {
          model: MODELS.transcription,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          audioSeconds: 0.5,
        },
      ],
    ]);
  });

  it('counts only the audio actually sent, not the silence held back', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    for (let i = 0; i < 20; i++) {
      session.append(chunk(100, 0));
      await vi.advanceTimersByTimeAsync(FLUSH_MS);
    }
    session.append(chunk(200));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    ws.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'a' });

    // 300 ms of pre-roll plus 200 ms of speech; the other 1.7 s of silence is not billed
    expect(cb.onUsage.mock.calls[0]?.[0].audioSeconds).toBeCloseTo(0.5);
  });
});

describe('server errors', () => {
  it.each([
    ['invalid_api_key', 401, 'errors.invalidKey', true],
    ['insufficient_quota', 429, 'errors.noCredit', true],
    ['rate_limit_exceeded', 429, 'errors.rateLimited', false],
    ['session_expired', 502, 'errors.service', false],
    ['model_not_found', 404, 'errors.modelNotFound', true],
  ])('maps %s to %s / %s', async (code, status, key, closes) => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({ type: 'error', error: { code, message: 'nope' } });

    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ status, userMessageKey: key }),
    );
    expect(ws.close.mock.calls.length > 0).toBe(closes);
  });

  it('stops for good when the session settings are refused', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({
      type: 'error',
      error: { type: 'invalid_request_error', code: 'invalid_value', message: 'bad model' },
    });

    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, userMessageKey: 'errors.badSettings' }),
    );
    expect(ws.close).toHaveBeenCalled();
  });

  it('settles the bookkeeping of a refused commit, so the activity goes idle', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    session.append(chunk(500));
    session.append(chunk(600, 0));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(cb.onActivity).toHaveBeenLastCalledWith('transcribing');

    ws.receive({
      type: 'error',
      error: { code: 'input_audio_buffer_commit_empty', message: 'buffer too small' },
    });

    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onActivity).toHaveBeenLastCalledWith('idle');
  });

  it('only logs recoverable errors', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.receive({
      type: 'error',
      error: { code: 'input_audio_buffer_commit_empty', message: 'buffer too small' },
    });
    ws.receive({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'a',
      error: { message: 'could not transcribe' },
    });

    expect(cb.onError).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('never writes the key to the console', async () => {
    const { ws } = await connect(callbacks());
    ws.receive({
      type: 'error',
      error: { code: 'invalid_api_key', message: `Incorrect API key provided: ${KEY}` },
    });

    expect(errorSpy).toHaveBeenCalled();
    expect(consoleText(errorSpy)).not.toContain(KEY);
  });
});

describe('reconnecting', () => {
  it('reopens after an unexpected close with backoff and replays the setup and audio', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    // Mid-sentence, so the drop is announced
    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    ws.drop();
    expect(cb.onStatus).toHaveBeenCalledWith('reconnecting');

    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    last().fail();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    const next = last();
    next.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onStatus).toHaveBeenLastCalledWith('connected');
    expect(next.types()).toEqual(['session.update', 'input_audio_buffer.append']);
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('reconnects an idle socket quietly, without a notice', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS);
    ws.drop();
    await vi.advanceTimersByTimeAsync(500);
    last().open();
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(last().types()).toEqual(['session.update']);
    expect(cb.onStatus).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('announces an idle reconnect once an attempt fails', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.drop();
    await vi.advanceTimersByTimeAsync(500);
    last().fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onStatus.mock.calls).toEqual([['reconnecting']]);

    await vi.advanceTimersByTimeAsync(1000);
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(cb.onStatus.mock.calls).toEqual([['reconnecting'], ['connected']]);
  });

  it('gates the audio buffered while reconnecting like live audio', async () => {
    const { session, ws } = await connect(callbacks());
    ws.drop();
    for (const [ms, level] of [
      [2000, 0],
      [100, 0x4000],
      [600, 0],
      [2000, 0],
    ] as const) {
      for (let t = 0; t < ms; t += 100) session.append(chunk(100, level));
    }
    await vi.advanceTimersByTimeAsync(500);
    last().open();
    await vi.advanceTimersByTimeAsync(0);

    const next = last();
    expect(next.types()).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    // 300 ms pre-roll + 100 ms speech + 500 ms tail
    expect(samplesOf(next.sent[1])).toHaveLength((INPUT_SAMPLE_RATE * 900) / 1000);
  });

  it('forgets a sentence open at the drop, so silence alone is never committed', async () => {
    const { session, ws } = await connect(callbacks());
    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    ws.drop();
    for (let t = 0; t < 1000; t += 100) session.append(chunk(100, 0));
    await vi.advanceTimersByTimeAsync(500);
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    session.close();

    expect(last().types()).toEqual(['session.update']);
  });

  it('keeps at most about 10 s of audio while reconnecting', async () => {
    const { session, ws } = await connect(callbacks());
    ws.drop();
    for (let i = 0; i < 15; i++) session.append(chunk(1000));
    await vi.advanceTimersByTimeAsync(500);
    last().open();
    await vi.advanceTimersByTimeAsync(0);

    const append = last().sent.find((message) => message.type === 'input_audio_buffer.append');
    const bytes = atob(String(append?.audio)).length;
    expect(bytes / 2 / INPUT_SAMPLE_RATE).toBeLessThanOrEqual(10);
  });

  it('gives up with connectionLost once the retries run out', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.drop();
    for (const delay of [500, 1000, 2000, 4000, 8000]) {
      await vi.advanceTimersByTimeAsync(delay);
      last().fail();
      await vi.advanceTimersByTimeAsync(0);
    }

    expect(FakeWebSocket.instances).toHaveLength(6);
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ userMessageKey: 'errors.connectionLost' }),
    );
  });

  it('keeps backing off and gives up when every reopened socket drops at once', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.drop();
    for (const delay of [500, 1000, 2000, 4000, 8000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      const before = FakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
      last().open();
      await vi.advanceTimersByTimeAsync(0);
      last().drop();
    }

    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ userMessageKey: 'errors.connectionLost' }),
    );
  });

  it('starts the backoff over after a socket stayed up', async () => {
    const cb = callbacks();
    const { ws } = await connect(cb);
    ws.drop();
    await vi.advanceTimersByTimeAsync(500);
    last().open();
    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS);
    last().drop();

    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('never reconnects after close()', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    session.close();
    ws.drop();
    await vi.advanceTimersByTimeAsync(DRAIN_MS + 10_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(cb.onStatus).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });
});

describe('closing', () => {
  it('flushes and commits, keeps listening for the drain, then closes', async () => {
    const cb = callbacks();
    const { session, ws } = await connect(cb);
    session.append(chunk(100));
    session.close();

    expect(ws.types().slice(-2)).toEqual([
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    ws.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Last words',
    });
    expect(cb.onFinal).toHaveBeenCalledWith('Last words', undefined);
    expect(ws.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DRAIN_MS);
    expect(ws.close).toHaveBeenCalled();
    expect(ws.onmessage).toBeNull();
    session.append(chunk(100));
    await vi.advanceTimersByTimeAsync(FLUSH_MS);
    expect(ws.types().at(-1)).toBe('input_audio_buffer.commit');
  });
});
