import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import { ExternalServiceError } from '@/shared/errors';
import { DRAIN_MS } from '@/shared/providers/openai/config';
import type { LlmProvider } from '@/shared/providers/types';
import { createLivePipeline, TRANSLATE_GRACE_MS } from './livePipeline';
import { deferred, fakeLlm, fakeRecord, fakeStt } from './livePipeline.fakes';

const options = { apiKey: 'test-key', targetLanguage: 'Spanish', onFatal: vi.fn() };

describe('createLivePipeline lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('buffers audio until connected and drops it while paused', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay });
    const starting = pipeline.start(options);
    pipeline.pushAudio(new Int16Array(1));
    await starting;

    overlay.paused = true;
    pipeline.pushAudio(new Int16Array(2));

    expect(stt.appended.map((pcm) => pcm.length)).toEqual([1]);
  });

  it('keeps only the last 50 chunks while connecting', async () => {
    const gate = deferred<undefined>();
    const stt = fakeStt({ gate: gate.promise });
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay: useOverlayStore() });
    const starting = pipeline.start(options);
    for (let i = 1; i <= 60; i++) pipeline.pushAudio(new Int16Array(i));
    gate.resolve(undefined);
    await starting;

    expect(stt.appended).toHaveLength(50);
    expect(stt.appended[0]?.length).toBe(11);
  });

  it('keeps translating a sentence that ends during the drain, then ignores the rest', async () => {
    vi.useFakeTimers();
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const translate = vi.fn<LlmProvider['translate']>(async () => undefined);
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay });
    await pipeline.start(options);
    const callbacks = stt.callbacks();

    pipeline.stop();
    expect(stt.close).toHaveBeenCalled();
    pipeline.pushAudio(new Int16Array(1));
    callbacks.onFinal('Just in time');
    await vi.advanceTimersByTimeAsync(DRAIN_MS);
    callbacks.onFinal('Too late');
    await vi.advanceTimersByTimeAsync(10);

    expect(stt.appended).toHaveLength(0);
    expect(translate.mock.calls.map(([request]) => request.text)).toEqual(['Just in time']);
  });

  it('lets the last translation finish after the drain, then records it', async () => {
    vi.useFakeTimers();
    const stt = fakeStt();
    const record = fakeRecord();
    const reply = deferred<undefined>();
    const translate = vi.fn<LlmProvider['translate']>(async (_request, onDelta) => {
      await reply.promise;
      onDelta('Justo a tiempo');
    });
    const llm = fakeLlm({ translate });
    const pipeline = createLivePipeline({ stt, llm, overlay: useOverlayStore(), record });
    await pipeline.start(options);
    const callbacks = stt.callbacks();

    pipeline.stop();
    await vi.advanceTimersByTimeAsync(DRAIN_MS - 100);
    callbacks.onFinal('Just in time');
    await vi.advanceTimersByTimeAsync(1000);
    reply.resolve(undefined);
    await vi.advanceTimersByTimeAsync(0);

    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'Just in time', translation: 'Justo a tiempo' }),
    );
  });

  it('records what is left when the grace period runs out', async () => {
    vi.useFakeTimers();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn<LlmProvider['translate']>(async (request, onDelta) => {
      onDelta('Uno');
      await new Promise((resolve) => request.signal?.addEventListener('abort', resolve));
    });
    const llm = fakeLlm({ translate });
    const pipeline = createLivePipeline({ stt, llm, overlay: useOverlayStore(), record });
    await pipeline.start(options);
    ['One', 'Two'].forEach((line) => stt.callbacks().onFinal(line));

    pipeline.stop();
    await vi.advanceTimersByTimeAsync(DRAIN_MS + TRANSLATE_GRACE_MS);

    expect(record.addLine.mock.calls.map(([line]) => [line.source, line.translation])).toEqual([
      ['One', 'Uno'],
      ['Two', ''],
    ]);
  });

  it('ignores an old run after a restart', async () => {
    const overlay = useOverlayStore();
    const first = fakeStt();
    const translate = vi.fn<LlmProvider['translate']>(async () => undefined);
    const pipeline = createLivePipeline({ stt: first, llm: fakeLlm({ translate }), overlay });
    await pipeline.start(options);
    const old = first.callbacks();

    await pipeline.start(options);
    old.onFinal('From the old run');
    old.onPartial('Old partial');

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(translate).not.toHaveBeenCalled();
    expect(overlay.source.text).toBe('');
  });

  it('returns the error when the transcriber cannot connect', async () => {
    const failure = new ExternalServiceError('closed', 'errors.connectionFailed');
    const stt = fakeStt({ failWith: failure });
    const pipeline = createLivePipeline({ stt, llm: fakeLlm(), overlay: useOverlayStore() });

    await expect(pipeline.start(options)).resolves.toBe(failure);
  });
});
