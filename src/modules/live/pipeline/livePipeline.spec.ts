import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import type {
  LlmProvider,
  SuggestRequest,
  SummaryRequest,
  TranslateRequest,
} from '@/shared/providers/types';
import { QUESTIONS_EVERY, SUGGEST_CONTEXT_LINES, SUMMARY_RETRY_MS } from './extras';
import { createLivePipeline } from './livePipeline';
import { deferred, fakeLlm, fakeRecord, fakeStt } from './livePipeline.fakes';

const options = { apiKey: 'test-key', targetLanguage: 'Spanish', onFatal: vi.fn() };

describe('createLivePipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('streams the translation of each finished sentence, in order', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay, now: () => 0 });
    await pipeline.start(options);

    stt.callbacks().onPartial('Hel');
    expect(overlay.source).toEqual({ text: 'Hel', partial: true });

    stt.callbacks().onFinal('Hello');
    stt.callbacks().onFinal('Bye');

    await vi.waitFor(() => {
      expect(overlay.translation).toMatchObject({ text: '[Spanish] Bye', done: true });
    });
    expect(overlay.previous).toBe('[Spanish] Hello');
    expect(overlay.latencyMs).toBe(0);
  });

  it('without a target language, shows each sentence as heard and never translates', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn<LlmProvider['translate']>();
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start({ ...options, targetLanguage: null });

    stt.callbacks().onFinal('Hello');
    stt.callbacks().onFinal('Bye');

    await vi.waitFor(() => {
      expect(overlay.translation).toMatchObject({ text: 'Bye', done: true });
    });
    expect(overlay.previous).toBe('Hello');
    expect(overlay.activity).toBeNull();
    expect(translate).not.toHaveBeenCalled();
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Hello', translation: '' }),
    );
  });

  it('shows what is already said in the target language without translating it', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn<LlmProvider['translate']>(async (_request, onDelta) => {
      onDelta('Hola');
    });
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start({ ...options, targetCode: 'es' });

    stt.callbacks().onFinal('Buenos días', { language: 'es' });

    await vi.waitFor(() => {
      expect(overlay.translation).toMatchObject({ text: 'Buenos días', done: true });
    });
    expect(translate).not.toHaveBeenCalled();
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Buenos días', translation: 'Buenos días' }),
    );

    stt.callbacks().onFinal('Hello', { language: 'en' });
    await vi.waitFor(() => expect(overlay.translation).toMatchObject({ text: 'Hola' }));
  });

  it('shows what is on its way until the first translated words arrive', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const reply = deferred<undefined>();
    let push: (chunk: string) => void = () => undefined;
    const translate = vi.fn<LlmProvider['translate']>((_request, onDelta) => {
      push = onDelta;
      return reply.promise;
    });
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay });
    await pipeline.start(options);

    stt.callbacks().onActivity?.('speech');
    expect(overlay.activity).toBe('hearing');
    stt.callbacks().onActivity?.('transcribing');
    expect(overlay.activity).toBe('translating');
    stt.callbacks().onActivity?.('idle');
    stt.callbacks().onFinal('Hello');
    expect(overlay.activity).toBe('translating');

    push('Hola');
    expect(overlay.activity).toBeNull();
    reply.resolve(undefined);
    pipeline.abort();
    expect(overlay.activity).toBeNull();
  });

  it('sends the glossary as keywords and the models to every call', async () => {
    const overlay = useOverlayStore();
    overlay.glossary = ' Acme \n\nKubernetes ';
    const stt = fakeStt();
    const translate = vi.fn<LlmProvider['translate']>(async () => undefined);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay });
    const models = { transcription: 'stt-x', translation: 'tr-x' };
    await pipeline.start({ ...options, models });

    stt.callbacks().onFinal('Hello');
    await vi.waitFor(() => expect(translate).toHaveBeenCalled());

    expect(stt.options()).toMatchObject({ keywords: ['Acme', 'Kubernetes'], model: 'stt-x' });
    expect(translate.mock.calls[0]?.[0]).toMatchObject({
      model: 'tr-x',
      glossary: overlay.glossary,
    });
  });

  it('passes at most the 3 previous sentences', async () => {
    const stt = fakeStt();
    const translate = vi.fn<LlmProvider['translate']>(async () => undefined);
    const pipeline = createLivePipeline({
      stt,
      llm: fakeLlm({ translate }),
      overlay: useOverlayStore(),
    });
    await pipeline.start(options);

    // One at a time, so none is joined to another
    for (const [index, line] of ['a', 'b', 'c', 'd', 'e'].entries()) {
      stt.callbacks().onFinal(line);
      await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(index + 1));
    }

    expect(translate.mock.calls.at(-1)?.[0].previous).toEqual(['b', 'c', 'd']);
  });

  it('asks for every sentence at once, each on its own, and shows them in order', async () => {
    const stt = fakeStt();
    const first = deferred<undefined>();
    const translate = vi.fn(async (request: TranslateRequest, onDelta: (chunk: string) => void) => {
      if (request.text === '1') await first.promise;
      onDelta(`<${request.text}>`);
    });
    const record = fakeRecord();
    const overlay = useOverlayStore();
    const llm = fakeLlm({ translate });
    const pipeline = createLivePipeline({ stt, llm, overlay, record });
    await pipeline.start(options);

    ['1', '2', '3', '4'].forEach((line) => stt.callbacks().onFinal(line));
    // A slow first answer holds nobody: the others are asked for meanwhile, never joined
    await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(4));
    expect(translate.mock.calls.map(([request]) => request.text)).toEqual(['1', '2', '3', '4']);
    expect(translate.mock.calls[3]?.[0].previous).toEqual(['1', '2', '3']);
    // Nothing shows before its turn: the captions are still at the first sentence
    expect(record.addLine).not.toHaveBeenCalled();

    first.resolve(undefined);
    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(4));
    const lines = record.addLine.mock.calls.map(([line]) => line);
    expect(lines.map((line) => line.source)).toEqual(['1', '2', '3', '4']);
    // One short caption per sentence, each with its own translation
    expect(lines.map((line) => line.translation)).toEqual(['<1>', '<2>', '<3>', '<4>']);
  });

  it('drops the oldest waiting sentences beyond 6, keeping the record in order', async () => {
    const stt = fakeStt();
    const first = deferred<undefined>();
    const translate = vi.fn(async (request: TranslateRequest, onDelta: (chunk: string) => void) => {
      if (request.text === '1') await first.promise;
      onDelta(`<${request.text}>`);
    });
    const record = fakeRecord();
    const llm = fakeLlm({ translate });
    const pipeline = createLivePipeline({ stt, llm, overlay: useOverlayStore(), record });
    await pipeline.start(options);

    ['1', '2', '3', '4', '5', '6', '7', '8'].forEach((line) => stt.callbacks().onFinal(line));
    first.resolve(undefined);

    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(8));
    const lines = record.addLine.mock.calls.map(([line]) => line);
    // '2' was dropped while '1' was translating, but it still comes after '1'
    expect(lines.map((line) => line.source)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(lines.map((line) => line.translation)).toEqual([
      '<1>',
      '',
      '<3>',
      '<4>',
      '<5>',
      '<6>',
      '<7>',
      '<8>',
    ]);
    const stamps = lines.map((line) => line.at);
    expect(stamps).toEqual([...stamps].sort((x, y) => x - y));
  });

  it('records each translation, the detected language and the usage', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const usage = { model: 'tr-x', inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 };
    const llm = fakeLlm({
      translate: async (request, onDelta) => {
        request.onUsage?.(usage);
        onDelta(' Hola ');
      },
    });
    const pipeline = createLivePipeline({ stt, llm, overlay, record });
    await pipeline.start(options);

    stt.callbacks().onFinal('Hello', { language: 'en' });
    stt.callbacks().onUsage?.({ ...usage, model: 'stt-x', audioSeconds: 2 });

    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalled());
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Hello', language: 'en', translation: 'Hola' }),
    );
    expect(overlay.pair.from).toBe('EN');
    expect(record.addUsage).toHaveBeenCalledTimes(2);
  });

  it('shows and clears the reconnecting notice', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay });
    await pipeline.start(options);

    stt.callbacks().onStatus?.('reconnecting');
    expect(overlay.notice).toBe('live.reconnecting');
    stt.callbacks().onStatus?.('connected');
    expect(overlay.notice).toBeNull();
  });

  it('asks for suggestions only after a question, when they are on', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const suggest = vi.fn(async () => [{ mine: 'Sí', theirs: 'Yes' }]);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ suggest }), overlay });
    await pipeline.start(options);
    overlay.options.suggestions = true;

    stt.callbacks().onFinal('We start at nine.');
    stt.callbacks().onFinal('Does that work for you?');

    await vi.waitFor(() => expect(overlay.suggestions).toEqual([{ mine: 'Sí', theirs: 'Yes' }]));
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('ignores a suggestion that arrives after a newer one', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const slow = deferred<{ mine: string; theirs: string }[]>();
    const suggest = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([{ mine: 'new', theirs: 'new' }]);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ suggest }), overlay });
    await pipeline.start(options);
    overlay.options.suggestions = true;

    stt.callbacks().onFinal('First?');
    stt.callbacks().onFinal('Second?');
    await vi.waitFor(() => expect(overlay.suggestions).toEqual([{ mine: 'new', theirs: 'new' }]));
    slow.resolve([{ mine: 'old', theirs: 'old' }]);
    await slow.promise;

    expect(overlay.suggestions).toEqual([{ mine: 'new', theirs: 'new' }]);
  });

  it('summarises every few sentences when the summary is on', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay, record });
    await pipeline.start(options);
    overlay.options.summary = true;

    ['a', 'b', 'c', 'd'].forEach((line) => stt.callbacks().onFinal(line));

    await vi.waitFor(() => expect(overlay.summary).toEqual(['4 lines']));
    expect(record.setSummary).toHaveBeenCalledWith(['4 lines']);
  });

  it('waits longer after each failed summary instead of retrying on every sentence', async () => {
    vi.useFakeTimers();
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const summarize = vi.fn().mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ summarize }), overlay });
    await pipeline.start(options);
    overlay.options.summary = true;

    for (let i = 0; i < 10; i++) stt.callbacks().onFinal(`a${i}`);
    await vi.advanceTimersByTimeAsync(0);
    expect(summarize).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(SUMMARY_RETRY_MS);
    stt.callbacks().onFinal('later');
    await vi.advanceTimersByTimeAsync(0);
    expect(summarize).toHaveBeenCalledTimes(2);
    // The second failure waits twice as long
    await vi.advanceTimersByTimeAsync(SUMMARY_RETRY_MS);
    stt.callbacks().onFinal('again');
    await vi.advanceTimersByTimeAsync(0);
    expect(summarize).toHaveBeenCalledTimes(2);
    pipeline.abort();
    vi.useRealTimers();
  });

  it('writes reply suggestions from the recent lines and the summary, not the whole meeting', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const suggest = vi.fn().mockResolvedValue([]);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ suggest }), overlay });
    await pipeline.start(options);
    overlay.options.suggestions = true;
    overlay.setSummary(['Budget agreed']);

    for (let i = 0; i < 40; i++) stt.callbacks().onFinal(`line ${i}.`);
    stt.callbacks().onFinal('Any questions?');

    await vi.waitFor(() => expect(suggest).toHaveBeenCalled());
    const request = suggest.mock.calls.at(-1)?.[0] as SuggestRequest;
    expect(request.context).toHaveLength(SUGGEST_CONTEXT_LINES);
    expect(request.context.at(-1)).toBe('line 39.');
    expect(request.summary).toEqual(['Budget agreed']);
    expect(request.mode).toBe('conversation');
  });

  describe('about a talk', () => {
    function talk(suggest: LlmProvider['suggest'], summarize?: LlmProvider['summarize']) {
      const overlay = useOverlayStore();
      const stt = fakeStt();
      const llm = fakeLlm({ suggest, ...(summarize ? { summarize } : {}) });
      const pipeline = createLivePipeline({ stt, llm, overlay });
      overlay.mode = 'talk';
      overlay.options.suggestions = true;
      const say = (count: number, text = 'line'): void => {
        for (let i = 0; i < count; i++) stt.callbacks().onFinal(`${text} ${i}.`);
      };
      return { overlay, stt, pipeline, say };
    }

    it('offers questions every few sentences, not on each "?"', async () => {
      const suggest = vi.fn().mockResolvedValue([{ mine: '¿Por qué?', theirs: 'Why?' }]);
      const { overlay, stt, pipeline, say } = talk(suggest);
      await pipeline.start(options);

      stt.callbacks().onFinal('Why does this matter?');
      say(QUESTIONS_EVERY - 2);
      expect(suggest).not.toHaveBeenCalled();
      say(1);
      await vi.waitFor(() => expect(overlay.suggestions).toHaveLength(1));
      expect(suggest).toHaveBeenCalledTimes(1);
      expect(suggest.mock.calls[0]?.[0]).toMatchObject({ mode: 'talk', asked: [] });
    });

    it('keeps the questions on screen while the talk goes on, and when nothing new comes', async () => {
      const suggest = vi
        .fn()
        .mockResolvedValueOnce([{ mine: 'Q1', theirs: 'Q1' }])
        .mockResolvedValueOnce([]);
      const { overlay, pipeline, say } = talk(suggest);
      await pipeline.start(options);

      say(QUESTIONS_EVERY);
      await vi.waitFor(() => expect(overlay.suggestions).toEqual([{ mine: 'Q1', theirs: 'Q1' }]));
      say(QUESTIONS_EVERY);
      await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
      await Promise.resolve();
      expect(overlay.suggestions).toEqual([{ mine: 'Q1', theirs: 'Q1' }]);
    });

    it('tells the model which questions it already offered', async () => {
      const suggest = vi
        .fn()
        .mockResolvedValueOnce([{ mine: 'Q1', theirs: 'Q1' }])
        .mockResolvedValue([{ mine: 'Q2', theirs: 'Q2' }]);
      const { overlay, pipeline, say } = talk(suggest);
      await pipeline.start(options);

      say(QUESTIONS_EVERY);
      await vi.waitFor(() => expect(overlay.suggestions[0]?.mine).toBe('Q1'));
      say(QUESTIONS_EVERY);
      await vi.waitFor(() => expect(overlay.suggestions[0]?.mine).toBe('Q2'));
      expect((suggest.mock.calls[1]?.[0] as SuggestRequest).asked).toEqual(['Q1']);
    });

    it('never asks twice at once', async () => {
      const slow = deferred<{ mine: string; theirs: string }[]>();
      const suggest = vi.fn().mockReturnValue(slow.promise);
      const { pipeline, say } = talk(suggest);
      await pipeline.start(options);

      say(QUESTIONS_EVERY * 3);
      expect(suggest).toHaveBeenCalledTimes(1);
      slow.resolve([]);
    });

    it('asks at once when questions are turned on after a while', async () => {
      const suggest = vi.fn().mockResolvedValue([]);
      const { overlay, pipeline, say } = talk(suggest);
      overlay.options.suggestions = false;
      await pipeline.start(options);

      say(QUESTIONS_EVERY + 2);
      overlay.options.suggestions = true;
      say(1);
      expect(suggest).toHaveBeenCalledTimes(1);
    });

    it('drops questions that arrive after switching to a conversation', async () => {
      const slow = deferred<{ mine: string; theirs: string }[]>();
      const suggest = vi.fn().mockReturnValue(slow.promise);
      const { overlay, pipeline, say } = talk(suggest);
      await pipeline.start(options);

      say(QUESTIONS_EVERY);
      overlay.mode = 'conversation';
      slow.resolve([{ mine: 'late', theirs: 'late' }]);
      await slow.promise;
      await Promise.resolve();
      expect(overlay.suggestions).toEqual([]);
    });

    it('starts the count and the asked questions over with the conversation', async () => {
      const suggest = vi.fn().mockResolvedValue([{ mine: 'Q1', theirs: 'Q1' }]);
      const { overlay, pipeline, say } = talk(suggest);
      await pipeline.start(options);

      say(QUESTIONS_EVERY);
      await vi.waitFor(() => expect(overlay.suggestions).toHaveLength(1));
      pipeline.resetConversation();
      say(QUESTIONS_EVERY - 1);
      expect(suggest).toHaveBeenCalledTimes(1);
      say(1);
      await vi.waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
      expect((suggest.mock.calls[1]?.[0] as SuggestRequest).asked).toEqual([]);
    });

    it('summarises it as a talk', async () => {
      const summarize = vi.fn().mockResolvedValue(['idea']);
      const { overlay, pipeline, say } = talk(vi.fn().mockResolvedValue([]), summarize);
      overlay.options.summary = true;
      await pipeline.start(options);

      say(4);
      await vi.waitFor(() => expect(summarize).toHaveBeenCalled());
      expect((summarize.mock.calls[0]?.[0] as SummaryRequest).mode).toBe('talk');
    });
  });

  it('keeps at most 40 lines waiting for the summary', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const slow = deferred<string[]>();
    const summarize = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue(['ok']);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ summarize }), overlay });
    await pipeline.start(options);
    overlay.options.summary = true;

    for (let i = 0; i < 4; i++) stt.callbacks().onFinal(`a${i}`);
    for (let i = 0; i < 60; i++) stt.callbacks().onFinal(`b${i}`);
    slow.resolve(['first']);
    await slow.promise;
    stt.callbacks().onFinal('last');

    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
    expect(summarize.mock.calls[1]?.[0].newLines).toHaveLength(40);
  });

  it('does not collect lines for the summary while it is off', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const summarize = vi.fn(async () => ['x']);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ summarize }), overlay });
    await pipeline.start(options);

    ['a', 'b', 'c', 'd'].forEach((line) => stt.callbacks().onFinal(line));
    overlay.options.summary = true;
    stt.callbacks().onFinal('e');

    expect(summarize).not.toHaveBeenCalled();
  });
});
