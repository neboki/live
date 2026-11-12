import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserTts } from './browserTts';
import type { TtsProvider } from './types';
import { MAX_BACKLOG, MAX_PENDING_CHARS, useSpeech } from './useSpeech';

interface FakeEngine extends TtsProvider {
  spoken: string[];
  finish: () => void;
  fail: (err: unknown) => void;
  stopMock: ReturnType<typeof vi.fn>;
}

/** An engine whose current item keeps playing until finish() or fail(). */
function fakeEngine(): FakeEngine {
  const spoken: string[] = [];
  let resolveCurrent: (() => void) | null = null;
  let rejectCurrent: ((err: unknown) => void) | null = null;
  const stopMock = vi.fn(() => resolveCurrent?.());
  return {
    spoken,
    stopMock,
    speak: (text: string): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        spoken.push(text);
        resolveCurrent = resolve;
        rejectCurrent = reject;
      }),
    stop: stopMock,
    finish: () => resolveCurrent?.(),
    fail: (err: unknown) => rejectCurrent?.(err),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useSpeech', () => {
  it('plays items in order, one after the other, without stopping between them', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('one', 'es');
    speech.speak('two', 'es');
    await flush();
    expect(engine.spoken).toEqual(['one']);

    engine.finish();
    await flush();
    expect(engine.spoken).toEqual(['one', 'two']);
    expect(engine.stopMock).not.toHaveBeenCalled();
  });

  it('reads every waiting sentence, joined into one clip, instead of dropping any', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('playing', 'es');
    await flush();
    for (let i = 1; i <= MAX_BACKLOG + 2; i++) speech.speak(`p${i}`, 'es');

    engine.finish();
    await flush();
    engine.finish();
    await flush();
    expect(engine.spoken).toEqual(['playing', 'p1 p2 p3 p4 p5']);
  });

  it('keeps only the most recent text when far too much is waiting', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('playing', 'es');
    await flush();
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`);
    words.forEach((word) => speech.speak(word, 'es'));

    engine.finish();
    await flush();
    const waiting = engine.spoken[1] ?? '';
    expect(waiting.length).toBeLessThanOrEqual(MAX_PENDING_CHARS);
    expect(waiting.endsWith('w399')).toBe(true);
    expect(waiting.split(' ')[0]).toMatch(/^w\d+$/);
  });

  it('skips to the latest whole sentences when the voice falls too far behind', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('playing', 'es');
    await flush();
    for (let i = 1; i <= 20; i++) speech.speak(`Esta es la frase número ${i}.`, 'es');

    engine.finish();
    await flush();
    const waiting = engine.spoken[1] ?? '';
    expect(waiting.length).toBeLessThanOrEqual(MAX_PENDING_CHARS);
    expect(waiting.startsWith('Esta es la frase')).toBe(true);
    expect(waiting.endsWith('número 20.')).toBe(true);
  });

  it('stop() empties the queue and stops the engine', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('one', 'es');
    speech.speak('two', 'es');
    await flush();
    speech.stop();
    await flush();
    expect(engine.stopMock).toHaveBeenCalled();
    expect(engine.spoken).toEqual(['one']);

    speech.speak('three', 'es');
    await flush();
    expect(engine.spoken).toEqual(['one', 'three']);
  });

  it('falls back to the browser engine after an engine error and reports it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const primary = fakeEngine();
    const browser = fakeEngine();
    const onError = vi.fn();
    const speech = useSpeech({ engine: () => primary, fallback: browser, onError });
    speech.speak('one', 'es');
    speech.speak('two', 'es');
    await flush();
    primary.fail(Object.assign(new Error('401'), { status: 401 }));
    await flush();

    expect(onError).toHaveBeenCalledWith('errors.ttsFailed');
    expect(browser.spoken).toEqual(['one']);
    browser.finish();
    await flush();
    expect(browser.spoken).toEqual(['one', 'two']);
    expect(primary.spoken).toEqual(['one']);
  });

  it('ignores blank text', async () => {
    const engine = fakeEngine();
    const speech = useSpeech({ engine: () => engine, fallback: engine });
    speech.speak('  ', 'es');
    await flush();
    expect(engine.spoken).toEqual([]);
  });
});

describe('createBrowserTts', () => {
  it('speaks consecutive utterances without cancel() in between', async () => {
    interface FakeUtterance {
      text: string;
      onend: (() => void) | null;
    }
    const utterances: FakeUtterance[] = [];
    const synth = {
      speak: vi.fn((u: FakeUtterance) => utterances.push(u)),
      cancel: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(readonly text: string) {}
      },
    );

    const tts = createBrowserTts();
    const first = tts.speak('one', 'es');
    utterances[0]?.onend?.();
    await first;
    const second = tts.speak('two', 'es');
    utterances[1]?.onend?.();
    await second;

    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.cancel).not.toHaveBeenCalled();
  });
});
