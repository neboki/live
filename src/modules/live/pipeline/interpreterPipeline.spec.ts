import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import type { PcmPlayer } from '@/shared/audio/pcmPlayer';
import type {
  InterpreterCallbacks,
  InterpreterOptions,
  InterpreterProvider,
} from '@/shared/providers/types';
import {
  INPUT_SAMPLE_RATE,
  INTERPRETER_IDLE_HOLD_MS,
  INTERPRETER_RESUME_PREROLL_MS,
} from '@/shared/providers/openai/config';
import { CLOSE_AFTER_END_MS } from './interpreterLines';
import { DEFAULT_TEXT_LAG_MS } from './interpreterTiming';
import { createInterpreterPipeline } from './interpreterPipeline';
import { fakeLlm, fakeRecord } from './livePipeline.fakes';
import { createSessionPipeline, usesInterpreter, withoutInterpreter } from './sessionPipeline';

const options = {
  apiKey: 'test-key',
  targetLanguage: 'Spanish',
  targetCode: 'es',
  models: { translation: 'gpt-realtime-translate', transcription: 'gpt-realtime-translate' },
  onFatal: vi.fn(),
};

function fakeInterpreter(): InterpreterProvider & {
  cb: () => InterpreterCallbacks;
  opts: () => InterpreterOptions;
  appended: Int16Array[];
  setLanguage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  let cb: InterpreterCallbacks | null = null;
  let opts: InterpreterOptions | null = null;
  const appended: Int16Array[] = [];
  const setLanguage = vi.fn();
  const close = vi.fn();
  return {
    appended,
    setLanguage,
    close,
    cb: () => cb as InterpreterCallbacks,
    opts: () => opts as InterpreterOptions,
    connect: async (next, callbacks) => {
      cb = callbacks;
      opts = next;
      return { append: (pcm) => appended.push(pcm), setLanguage, close };
    },
  };
}

function fakePlayer(): PcmPlayer & { played: Int16Array[] } {
  const played: Int16Array[] = [];
  return {
    played,
    play: (pcm) => played.push(pcm),
    stop: vi.fn(),
    close: vi.fn(),
    whenDrained: () => Promise.resolve(),
    whenLeft: () => Promise.resolve(),
  };
}

describe('createInterpreterPipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('streams the translation and closes the line after a sentence end', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    const record = fakeRecord();
    const pipeline = createInterpreterPipeline({
      interpreter,
      llm: fakeLlm(),
      overlay,
      record,
      player: fakePlayer(),
      now: () => 0,
    });
    await pipeline.start(options);
    expect(interpreter.opts().language).toBe('es');
    expect(overlay.selfVoiced).toBe(true);

    interpreter.cb().onSource('Hello there. How');
    interpreter.cb().onTranslation('Hola ');
    interpreter.cb().onTranslation('a todos.');
    expect(overlay.translation).toMatchObject({ text: 'Hola a todos.', done: false });

    vi.advanceTimersByTime(CLOSE_AFTER_END_MS);
    expect(overlay.translation.done).toBe(true);
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Hello there.', translation: 'Hola a todos.' }),
    );
    // The line began when its first words were said: its text came about a second later
    const line = record.addLine.mock.calls[0]?.[0];
    expect((line?.at ?? 0) - (line?.from ?? 0)).toBe(CLOSE_AFTER_END_MS + DEFAULT_TEXT_LAG_MS);
    expect(overlay.source).toEqual({ text: 'How', partial: true });
  });

  it('plays the voice only while the voice option is on', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    const player = fakePlayer();
    const pipeline = createInterpreterPipeline({ interpreter, llm: fakeLlm(), overlay, player });
    await pipeline.start(options);

    overlay.options.voice = false;
    interpreter.cb().onAudio(new Int16Array([5, -5, 5, -5]));
    expect(player.played).toHaveLength(0);
    overlay.options.voice = true;
    interpreter.cb().onAudio(new Int16Array([5, -5, 5, -5]));
    expect(player.played).toHaveLength(1);
    // The silent padding between sentences is never queued
    interpreter.cb().onAudio(new Int16Array(9600));
    expect(player.played).toHaveLength(1);
  });

  it('goes quiet, and shows the original, when translation is turned off mid-session', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    const player = fakePlayer();
    const pipeline = createInterpreterPipeline({ interpreter, llm: fakeLlm(), overlay, player });
    overlay.options.voice = true;
    await pipeline.start(options);

    pipeline.setTargetLanguage(null);
    expect(player.stop).toHaveBeenCalled();
    interpreter.cb().onAudio(new Int16Array([5, -5, 5, -5]));
    interpreter.cb().onTranslation('Hola.');
    interpreter.cb().onSource('Hello.');
    vi.advanceTimersByTime(CLOSE_AFTER_END_MS);
    expect(player.played).toHaveLength(0);
    expect(overlay.translation).toMatchObject({ text: 'Hello.', done: true });

    pipeline.setTargetLanguage('French', 'fr');
    expect(interpreter.setLanguage).toHaveBeenCalledWith('fr');
    interpreter.cb().onAudio(new Int16Array([5, -5, 5, -5]));
    expect(player.played).toHaveLength(1);
  });

  it('stops sending a long silence, and sends its last moment when speech returns', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    const pipeline = createInterpreterPipeline({
      interpreter,
      llm: fakeLlm(),
      overlay,
      player: fakePlayer(),
    });
    await pipeline.start(options);
    const chunk = INPUT_SAMPLE_RATE / 10;
    const quiet = (): Int16Array => new Int16Array(chunk);
    const speech = (): Int16Array => new Int16Array(chunk).fill(8000);

    const quietChunks = INTERPRETER_IDLE_HOLD_MS / 100;
    for (let i = 0; i < quietChunks + 50; i++) pipeline.pushAudio(quiet());
    // Every chunk of the first 20 s went out (short pauses matter); then nothing
    expect(interpreter.appended).toHaveLength(quietChunks - 1);

    const voice = speech();
    pipeline.pushAudio(voice);
    const preRoll = INTERPRETER_RESUME_PREROLL_MS / 100;
    expect(interpreter.appended).toHaveLength(quietChunks - 1 + preRoll + 1);
    expect(interpreter.appended.at(-1)).toBe(voice);

    // Back to normal: the next quiet chunk is sent again
    pipeline.pushAudio(quiet());
    expect(interpreter.appended).toHaveLength(quietChunks - 1 + preRoll + 2);
  });

  it('keeps only the last moment of audio heard before the interpreter is connected', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    let open = (): void => undefined;
    const slow: InterpreterProvider = {
      connect: (next, callbacks) =>
        new Promise((resolve) => {
          open = () => resolve(interpreter.connect(next, callbacks));
        }),
    };
    const pipeline = createInterpreterPipeline({
      interpreter: slow,
      llm: fakeLlm(),
      overlay,
      player: fakePlayer(),
    });
    const started = pipeline.start(options);
    for (let i = 0; i < 25; i++) pipeline.pushAudio(new Int16Array([i]));
    open();
    await started;

    // 2 s of 100 ms chunks: the five oldest are gone
    expect(interpreter.appended).toHaveLength(20);
    expect(interpreter.appended[0]?.[0]).toBe(5);
    expect(interpreter.appended.at(-1)?.[0]).toBe(24);
  });

  it('sends audio, changes language live and closes gracefully', async () => {
    const overlay = useOverlayStore();
    const interpreter = fakeInterpreter();
    const pipeline = createInterpreterPipeline({
      interpreter,
      llm: fakeLlm(),
      overlay,
      player: fakePlayer(),
    });
    await pipeline.start(options);

    pipeline.pushAudio(new Int16Array(8));
    expect(interpreter.appended).toHaveLength(1);
    pipeline.setTargetLanguage('French', 'fr');
    expect(interpreter.setLanguage).toHaveBeenCalledWith('fr');
    pipeline.stop();
    expect(interpreter.close).toHaveBeenCalled();
    vi.runAllTimers();
    expect(overlay.selfVoiced).toBe(false);
  });
});

describe('sessionPipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('uses the interpreter only for its model and with a language to translate into', () => {
    expect(usesInterpreter(options)).toBe(true);
    expect(usesInterpreter({ ...options, targetLanguage: null })).toBe(false);
    expect(usesInterpreter({ ...options, models: { translation: 'gpt-6-luna' } })).toBe(false);
  });

  it('falls back to live transcription when the interpreter has nothing to do', () => {
    expect(withoutInterpreter({ ...options, targetLanguage: null }).models).toEqual({
      transcription: 'gpt-live-transcribe',
      translation: 'gpt-6-luna',
    });
  });

  it('starts the interpreter for the interpreter tier', async () => {
    const interpreter = fakeInterpreter();
    const stt = { connect: vi.fn() };
    const pipeline = createSessionPipeline({
      stt,
      llm: fakeLlm(),
      overlay: useOverlayStore(),
      interpreter,
    });
    await pipeline.start(options);
    expect(interpreter.opts().language).toBe('es');
    expect(stt.connect).not.toHaveBeenCalled();
    pipeline.abort();
  });
});
