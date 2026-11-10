import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive } from 'vue';

interface CapturedOptions {
  engine: () => unknown;
  fallback: unknown;
  onError: (key: string) => void;
}

const speech = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(),
  options: null as unknown,
}));
const openAiStop = vi.hoisted(() => vi.fn());
const openAiClose = vi.hoisted(() => vi.fn());
const tts = vi.hoisted(() => ({ onUsage: null as unknown, addUsage: vi.fn() }));

const overlay = reactive({
  translation: { id: 0, text: '', done: false },
  options: { voice: true },
  paused: false,
  setNotice: vi.fn(),
});
const settings = reactive({
  apiKey: 'test-key',
  tts: { engine: 'browser' as 'browser' | 'openai', model: 'gpt-4o-mini-tts', voice: 'alloy' },
});

vi.mock('../store/useOverlayStore', () => ({ useOverlayStore: () => overlay }));
vi.mock('@/modules/settings/store/useSettingsStore', () => ({
  useSettingsStore: () => settings,
}));
vi.mock('@/shared/providers/openai/tts/tts', () => ({
  createOpenAiTts: (_config: unknown, onUsage: unknown) => {
    tts.onUsage = onUsage;
    return { speak: vi.fn(), stop: openAiStop, close: openAiClose };
  },
}));
const record = reactive({
  addUsage: (usage: unknown) => tts.addUsage(usage),
  lines: [] as { at: number; from?: number; source: string; translation: string }[],
});
vi.mock('@/modules/session', () => ({ useSessionRecord: () => record }));
vi.mock('@/shared/speech/useSpeech', () => ({
  useSpeech: (options: unknown) => {
    speech.options = options;
    return { speak: speech.speak, stop: speech.stop };
  },
}));

import { useVoiceOutput } from './useVoiceOutput';

async function finishTranslation(id: number, text: string): Promise<void> {
  overlay.translation = { id, text, done: true };
  await nextTick();
}

function captured(): CapturedOptions {
  return speech.options as CapturedOptions;
}

describe('useVoiceOutput', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    overlay.translation = { id: 0, text: '', done: false };
    overlay.options.voice = true;
    overlay.paused = false;
    settings.apiKey = 'test-key';
    settings.tts.engine = 'browser';
    vi.clearAllMocks();
    scope = effectScope();
    scope.run(() => useVoiceOutput(() => 'es'));
  });

  afterEach(() => {
    scope.stop();
  });

  it('enqueues each finished translation', async () => {
    await finishTranslation(1, 'Hola');
    await finishTranslation(2, 'Adiós');
    expect(speech.speak.mock.calls).toEqual([
      ['Hola', 'es'],
      ['Adiós', 'es'],
    ]);
  });

  it('stops playback when the voice option is turned off', async () => {
    overlay.options.voice = false;
    await nextTick();
    expect(speech.stop).toHaveBeenCalled();
    expect(openAiStop).toHaveBeenCalled();

    await finishTranslation(1, 'Hola');
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('reads the last sentence at once when the voice is turned on', async () => {
    overlay.options.voice = false;
    await finishTranslation(1, 'Hola');
    overlay.options.voice = true;
    await nextTick();
    expect(speech.speak.mock.calls).toEqual([['Hola', 'es']]);
  });

  it('does not repeat the last sentence when the bar is resumed', async () => {
    await finishTranslation(1, 'Hola');
    overlay.paused = true;
    await nextTick();
    overlay.paused = false;
    await nextTick();
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('stops playback when the bar is paused', async () => {
    overlay.paused = true;
    await nextTick();
    expect(speech.stop).toHaveBeenCalled();
  });

  it('stops playback and closes the audio output when the scope is disposed', () => {
    scope.stop();
    expect(speech.stop).toHaveBeenCalled();
    expect(openAiClose).toHaveBeenCalled();
  });

  it('uses the OpenAI engine only when selected and a key is present', async () => {
    const options = captured();
    expect(options.engine()).toBe(options.fallback);
    settings.tts.engine = 'openai';
    await nextTick();
    expect(speech.stop).toHaveBeenCalled();
    expect(options.engine()).not.toBe(options.fallback);
    settings.apiKey = '';
    expect(options.engine()).toBe(options.fallback);
  });

  it('adds the OpenAI voice usage to the session cost', () => {
    const usage = {
      model: 'gpt-4o-mini-tts',
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 0,
    };
    (tts.onUsage as (next: typeof usage) => void)(usage);
    expect(tts.addUsage).toHaveBeenCalledWith(usage);
  });

  it('reads each sentence as soon as it is complete, and the rest when the line is done', async () => {
    overlay.translation = { id: 1, text: 'Hola a todos. Hoy', done: false };
    await nextTick();
    expect(speech.speak.mock.calls).toEqual([['Hola a todos.', 'es']]);
    overlay.translation = { id: 1, text: 'Hola a todos. Hoy hablamos de esto. Y', done: false };
    await nextTick();
    expect(speech.speak).toHaveBeenCalledTimes(2);
    expect(speech.speak).toHaveBeenLastCalledWith('Hoy hablamos de esto.', 'es');
    await finishTranslation(1, 'Hola a todos. Hoy hablamos de esto. Y de aquello.');
    expect(speech.speak).toHaveBeenCalledTimes(3);
    expect(speech.speak).toHaveBeenLastCalledWith('Y de aquello.', 'es');
  });

  it('starts over with every new line', async () => {
    overlay.translation = { id: 1, text: 'Hola a todos. Hoy', done: false };
    await nextTick();
    overlay.translation = { id: 2, text: 'Otra cosa. Y', done: false };
    await nextTick();
    expect(speech.speak.mock.calls).toEqual([
      ['Hola a todos.', 'es'],
      ['Otra cosa.', 'es'],
    ]);
  });

  it('does not read a translation that was never finished', async () => {
    overlay.translation = { id: 1, text: 'Hola, est', done: false };
    await nextTick();
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('shows the ttsFailed notice when the engine fails', () => {
    captured().onError('errors.ttsFailed');
    expect(overlay.setNotice).toHaveBeenCalledWith('errors.ttsFailed', 8000);
  });
});

describe('useVoiceOutput behind the picture', () => {
  let scope: ReturnType<typeof effectScope>;
  const picture = reactive({ on: true, lagSeconds: null as number | null, paused: false });
  const clock = { now: 100_000 };

  beforeEach(() => {
    overlay.translation = { id: 0, text: '', done: false };
    overlay.options.voice = true;
    overlay.paused = false;
    record.lines = [];
    Object.assign(picture, { on: true, lagSeconds: null, paused: false });
    vi.clearAllMocks();
    scope = effectScope();
    scope.run(() =>
      useVoiceOutput(
        () => 'es',
        () => true,
        undefined,
        () => (picture.on ? { lagSeconds: picture.lagSeconds, paused: picture.paused } : null),
        () => clock.now,
      ),
    );
  });

  afterEach(() => scope.stop());

  it('reads each line when the picture reaches it, not as it is written', async () => {
    await finishTranslation(1, 'Hola');
    expect(speech.speak).not.toHaveBeenCalled();

    record.lines.push({ at: 99_000, from: 97_000, source: 'Hello', translation: 'Hola' });
    picture.lagSeconds = 4; // the picture is at 96 000
    await nextTick();
    expect(speech.speak).not.toHaveBeenCalled();

    picture.lagSeconds = 3; // 97 000: the sentence begins on screen
    await nextTick();
    expect(speech.speak.mock.calls).toEqual([['Hola', 'es']]);
    picture.lagSeconds = 2.5;
    await nextTick();
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('goes quiet while the picture is paused, and back to live reading without it', async () => {
    picture.lagSeconds = 3;
    await nextTick();
    picture.paused = true;
    await nextTick();
    expect(speech.stop).toHaveBeenCalled();

    picture.on = false;
    await nextTick();
    await finishTranslation(2, 'Adiós');
    expect(speech.speak.mock.calls).toEqual([['Adiós', 'es']]);
  });
});
