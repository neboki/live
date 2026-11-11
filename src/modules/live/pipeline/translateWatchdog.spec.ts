import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError, RateLimitError, UnauthorizedError } from '@/shared/errors';
import {
  hedged,
  isRetryable,
  translationTimeout,
  watchTranslation,
  type TranslateCall,
} from './translateWatchdog';

const LIMITS = { firstWordsMs: 1000, stallMs: 500 };

/** A call that never answers until aborted, then rejects like fetch does */
const hanging: TranslateCall = (signal) =>
  new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

describe('watchTranslation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes a call that answers in time straight through', async () => {
    const chunks: string[] = [];
    const call: TranslateCall = async (_signal, onDelta) => {
      onDelta('Hola ');
      onDelta('mundo');
    };

    await watchTranslation(call, new AbortController().signal, (c) => chunks.push(c), LIMITS);

    expect(chunks.join('')).toBe('Hola mundo');
  });

  it('gives up and aborts the call when no words come in time', async () => {
    let seen: AbortSignal | null = null;
    const call: TranslateCall = (signal, onDelta) => {
      seen = signal;
      return hanging(signal, onDelta);
    };
    const result = watchTranslation(call, new AbortController().signal, () => undefined, LIMITS);
    const check = expect(result).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(LIMITS.firstWordsMs);

    await check;
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
  });

  it('gives up when a translation under way goes quiet, keeping what came', async () => {
    const chunks: string[] = [];
    const call: TranslateCall = (signal, onDelta) => {
      onDelta('Hola');
      return hanging(signal, onDelta);
    };
    const result = watchTranslation(
      call,
      new AbortController().signal,
      (c) => chunks.push(c),
      LIMITS,
    );
    const check = expect(result).rejects.toThrow(/timed out/);

    await vi.advanceTimersByTimeAsync(LIMITS.stallMs);

    await check;
    expect(chunks).toEqual(['Hola']);
  });

  it('keeps waiting while words keep coming', async () => {
    let say: (chunk: string) => void = () => undefined;
    let end: () => void = () => undefined;
    const call: TranslateCall = (_signal, onDelta) => {
      say = onDelta;
      return new Promise((resolve) => (end = resolve));
    };
    const result = watchTranslation(call, new AbortController().signal, () => undefined, LIMITS);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(LIMITS.stallMs - 100);
      say('x');
    }
    end();

    await expect(result).resolves.toBeUndefined();
  });

  it('ignores words a timed-out call says afterwards', async () => {
    const chunks: string[] = [];
    let late: (chunk: string) => void = () => undefined;
    const call: TranslateCall = (_signal, onDelta) => {
      late = onDelta;
      return new Promise(() => undefined);
    };
    const result = watchTranslation(
      call,
      new AbortController().signal,
      (c) => chunks.push(c),
      LIMITS,
    );
    const check = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(LIMITS.firstWordsMs);
    await check;

    late('too late');

    expect(chunks).toEqual([]);
  });

  it('rejects with the abort when the run is cancelled', async () => {
    const run = new AbortController();
    const result = watchTranslation(hanging, run.signal, () => undefined, LIMITS);
    const check = expect(result).rejects.toMatchObject({ name: 'AbortError' });

    run.abort(new DOMException('stopped', 'AbortError'));

    await check;
  });

  it('passes the call failure through', async () => {
    const refused = new UnauthorizedError('bad key');
    const result = watchTranslation(
      () => Promise.reject(refused),
      new AbortController().signal,
      () => undefined,
      LIMITS,
    );

    await expect(result).rejects.toBe(refused);
  });
});

describe('isRetryable', () => {
  it('retries timeouts, network and server failures, never refusals or rate limits', () => {
    expect(isRetryable(translationTimeout('first words', 1))).toBe(true);
    expect(isRetryable(new ExternalServiceError('down'))).toBe(true);
    expect(isRetryable(new RateLimitError('slow down'))).toBe(false);
    expect(isRetryable(new UnauthorizedError('bad key'))).toBe(false);
    expect(isRetryable(new Error('bug'))).toBe(false);
  });
});

describe('hedged', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A call that speaks `text` after `ms`, unless aborted first */
  function speaksAfter(ms: number, text: string): TranslateCall {
    return (signal, onDelta) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          onDelta(text);
          resolve();
        }, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
  }

  it('makes one request when the first answers in time', async () => {
    const call = vi.fn(speaksAfter(500, 'Hola'));
    const chunks: string[] = [];
    const done = hedged(call, 1000)(new AbortController().signal, (c) => chunks.push(c));

    await vi.advanceTimersByTimeAsync(2000);

    await done;
    expect(call).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(['Hola']);
  });

  it('races a twin when the first is slow, keeps the first to speak and aborts the other', async () => {
    const signals: AbortSignal[] = [];
    const calls = [speaksAfter(5000, 'lento'), speaksAfter(200, 'rápido')];
    const call: TranslateCall = (signal, onDelta) => {
      signals.push(signal);
      return (calls[signals.length - 1] as TranslateCall)(signal, onDelta);
    };
    const chunks: string[] = [];
    const done = hedged(call, 1000)(new AbortController().signal, (c) => chunks.push(c));

    await vi.advanceTimersByTimeAsync(1200);

    await done;
    expect(chunks).toEqual(['rápido']);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('fails only once every request started has failed', async () => {
    let n = 0;
    const call: TranslateCall = (signal, onDelta) =>
      ++n === 1
        ? speaksAfter(1500, 'x')(signal, onDelta).then(() => {
            throw new ExternalServiceError('first broke');
          })
        : Promise.reject(new ExternalServiceError('second broke'));
    const done = hedged(call, 1000)(new AbortController().signal, () => undefined);
    const check = expect(done).rejects.toThrow(/first broke/);

    await vi.advanceTimersByTimeAsync(2000);

    await check;
  });

  it('gives up at once when the caller cancels', async () => {
    const parent = new AbortController();
    const signals: AbortSignal[] = [];
    const call: TranslateCall = (signal, onDelta) => {
      signals.push(signal);
      return hanging(signal, onDelta);
    };
    const done = hedged(call, 1000)(parent.signal, () => undefined);
    const check = expect(done).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1000);

    parent.abort();

    await check;
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
