import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import { ExternalServiceError } from '@/shared/errors';
import type { LlmProvider, TranslateRequest } from '@/shared/providers/types';
import { createLivePipeline } from './livePipeline';
import { fakeLlm, fakeRecord, fakeStt } from './livePipeline.fakes';
import { TRANSLATE_LIMITS } from './translateWatchdog';

/** Never answers until aborted, like a stalled stream */
function hang(request: TranslateRequest): Promise<void> {
  return new Promise((_, reject) => {
    request.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError')),
    );
  });
}

async function answer(request: TranslateRequest, onDelta: (chunk: string) => void): Promise<void> {
  onDelta(`ES:${request.text}`);
}

function setup(translate: LlmProvider['translate']): {
  overlay: ReturnType<typeof useOverlayStore>;
  stt: ReturnType<typeof fakeStt>;
  record: ReturnType<typeof fakeRecord>;
  onFatal: ReturnType<typeof vi.fn>;
  start: () => Promise<unknown>;
} {
  const overlay = useOverlayStore();
  const stt = fakeStt();
  const record = fakeRecord();
  const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
  const onFatal = vi.fn();
  const start = (): Promise<unknown> =>
    pipeline.start({ apiKey: 'test-key', targetLanguage: 'Spanish', onFatal, onNotice: vi.fn() });
  return { overlay, stt, record, onFatal, start };
}

describe('createLivePipeline with a stuck translator', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks again when a translation says nothing in time', async () => {
    const translate = vi
      .fn<LlmProvider['translate']>()
      .mockImplementationOnce(hang)
      .mockImplementation(answer);
    const { overlay, stt, start } = setup(translate);
    await start();

    stt.callbacks().onFinal('Hello');
    await vi.advanceTimersByTimeAsync(TRANSLATE_LIMITS.firstWordsMs);

    expect(translate).toHaveBeenCalledTimes(2);
    expect(overlay.translation.text).toBe('ES:Hello');
    expect(overlay.translation.done).toBe(true);
  });

  it('moves on to the next sentence when a translation stays stuck', async () => {
    const translate = vi
      .fn<LlmProvider['translate']>()
      .mockImplementationOnce(hang)
      .mockImplementationOnce(hang)
      .mockImplementation(answer);
    const { overlay, stt, record, onFatal, start } = setup(translate);
    await start();

    stt.callbacks().onFinal('Lost');
    stt.callbacks().onFinal('Next');
    await vi.advanceTimersByTimeAsync(TRANSLATE_LIMITS.firstWordsMs * 2);

    expect(overlay.translation.text).toBe('ES:Next');
    expect(onFatal).not.toHaveBeenCalled();
    const lines = record.addLine.mock.calls.map(([line]) => [line.source, line.translation]);
    expect(lines).toEqual([
      ['Lost', ''],
      ['Next', 'ES:Next'],
    ]);
  });

  it('does not ask again once part of the translation is on screen', async () => {
    const translate = vi
      .fn<LlmProvider['translate']>()
      .mockImplementationOnce((request, onDelta) => {
        onDelta('Ho');
        return hang(request);
      })
      .mockImplementation(answer);
    const { overlay, stt, start } = setup(translate);
    await start();

    stt.callbacks().onFinal('Hello');
    await vi.advanceTimersByTimeAsync(TRANSLATE_LIMITS.stallMs);

    expect(translate).toHaveBeenCalledTimes(1);
    expect(overlay.translation.text).toBe('Ho');
  });

  it('asks again after a server error', async () => {
    const translate = vi
      .fn<LlmProvider['translate']>()
      .mockRejectedValueOnce(new ExternalServiceError('502'))
      .mockImplementation(answer);
    const { overlay, stt, start } = setup(translate);
    await start();

    stt.callbacks().onFinal('Hello');
    await vi.advanceTimersByTimeAsync(0);

    expect(translate).toHaveBeenCalledTimes(2);
    expect(overlay.translation.text).toBe('ES:Hello');
  });
});
