import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import { AppError, ExternalServiceError, RateLimitError, UnauthorizedError } from '@/shared/errors';
import type { LlmProvider, SummaryRequest, TranslateRequest } from '@/shared/providers/types';
import { routeError } from './errorRoute';
import { createLivePipeline } from './livePipeline';
import { deferred, fakeLlm, fakeStt } from './livePipeline.fakes';

function setup(llm: LlmProvider): {
  overlay: ReturnType<typeof useOverlayStore>;
  stt: ReturnType<typeof fakeStt>;
  pipeline: ReturnType<typeof createLivePipeline>;
  onFatal: ReturnType<typeof vi.fn>;
  onNotice: ReturnType<typeof vi.fn>;
  run: () => Promise<AppError | null>;
} {
  const overlay = useOverlayStore();
  const stt = fakeStt();
  const pipeline = createLivePipeline({ stt, llm, overlay });
  const onFatal = vi.fn();
  const onNotice = vi.fn();
  const run = (): Promise<AppError | null> =>
    pipeline.start({ apiKey: 'test-key', targetLanguage: 'Spanish', onFatal, onNotice });
  return { overlay, stt, pipeline, onFatal, onNotice, run };
}

const failing = (error: unknown): Partial<LlmProvider> => ({
  translate: () => Promise.reject(error),
});

describe('createLivePipeline errors', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('stops the session when the key is rejected', async () => {
    const rejected = new UnauthorizedError('bad key');
    const { stt, onFatal, run } = setup(fakeLlm(failing(rejected)));
    await run();

    stt.callbacks().onFinal('Hello');

    await vi.waitFor(() => expect(onFatal).toHaveBeenCalledWith(rejected));
  });

  it('stops the session when there is no credit left', async () => {
    const noCredit = new RateLimitError('quota', 'errors.noCredit');
    const { stt, onFatal, onNotice, run } = setup(fakeLlm(failing(noCredit)));
    await run();

    stt.callbacks().onFinal('Hello');

    await vi.waitFor(() => expect(onFatal).toHaveBeenCalledWith(noCredit));
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('shows a notice for a rate limit and clears it after the next translation', async () => {
    const limited = new RateLimitError('slow down');
    const translate = vi
      .fn<LlmProvider['translate']>()
      .mockRejectedValueOnce(limited)
      .mockResolvedValue(undefined);
    const { overlay, stt, onFatal, onNotice, run } = setup(fakeLlm({ translate }));
    await run();
    onNotice.mockImplementation((error: AppError) => overlay.setNotice(error.userMessageKey));

    stt.callbacks().onFinal('Hello');
    await vi.waitFor(() => expect(onNotice).toHaveBeenCalledWith(limited));
    expect(overlay.notice).toBe('errors.rateLimited');
    stt.callbacks().onFinal('Again');

    await vi.waitFor(() => expect(overlay.notice).toBeNull());
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('does not stop the session on a server error', async () => {
    const outage = new ExternalServiceError('500');
    const { stt, onFatal, onNotice, run } = setup(fakeLlm(failing(outage)));
    await run();

    stt.callbacks().onFinal('Hello');

    await vi.waitFor(() => expect(onNotice).toHaveBeenCalledWith(outage));
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('stops the session on a transcription error', async () => {
    const lost = new ExternalServiceError('lost', 'errors.connectionLost');
    const { stt, onFatal, run } = setup(fakeLlm());
    await run();

    stt.callbacks().onError(lost);

    expect(onFatal).toHaveBeenCalledWith(lost);
  });

  it('only shows a notice for a transient transcription error', async () => {
    const limited = new RateLimitError('slow down');
    const outage = new ExternalServiceError('session expired');
    const { stt, onFatal, onNotice, run } = setup(fakeLlm());
    await run();

    stt.callbacks().onError(limited);
    stt.callbacks().onError(outage);

    expect(onNotice.mock.calls).toEqual([[limited], [outage]]);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('never marks a failed translation as done, so it is not read aloud', async () => {
    const translate = vi.fn<LlmProvider['translate']>(async (_request, onDelta) => {
      onDelta('Hola, est');
      throw new ExternalServiceError('500');
    });
    const { overlay, stt, onNotice, run } = setup(fakeLlm({ translate }));
    await run();

    stt.callbacks().onFinal('Hello, this is');

    await vi.waitFor(() => expect(onNotice).toHaveBeenCalled());
    expect(overlay.translation).toMatchObject({ text: 'Hola, est', done: false });
  });

  it('aborts the calls in flight and never logs the abort', async () => {
    let signal: AbortSignal | undefined;
    const translate = vi.fn(
      (request: TranslateRequest) =>
        new Promise<void>((_resolve, reject) => {
          signal = request.signal;
          request.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { stt, pipeline, onFatal, onNotice, run } = setup(fakeLlm({ translate }));
    await run();
    stt.callbacks().onFinal('Hello');
    await vi.waitFor(() => expect(translate).toHaveBeenCalled());

    pipeline.abort();
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(stt.close).toHaveBeenCalled();
    await vi.waitFor(() => expect(consoleError).not.toHaveBeenCalled());
    expect(onFatal).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('does not leak lines of a failed summary into the next run', async () => {
    const slow = deferred<string[]>();
    const summarize = vi
      .fn<(request: SummaryRequest) => Promise<string[]>>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue(['ok']);
    const { overlay, stt, run } = setup(fakeLlm({ summarize }));
    await run();
    overlay.options.summary = true;
    ['a', 'b', 'c', 'd'].forEach((line) => stt.callbacks().onFinal(line));

    await run();
    slow.reject(new ExternalServiceError('500'));
    await slow.promise.catch(() => undefined);
    ['e', 'f', 'g', 'h'].forEach((line) => stt.callbacks().onFinal(line));

    await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
    expect(summarize.mock.calls[1]?.[0].newLines).toEqual(['e', 'f', 'g', 'h']);
  });
});

describe('routeError', () => {
  it('sorts errors into fatal, notice and log', () => {
    expect(routeError(new UnauthorizedError('x'))).toBe('fatal');
    expect(routeError(new RateLimitError('x', 'errors.noCredit'))).toBe('fatal');
    expect(routeError(new RateLimitError('x'))).toBe('notice');
    expect(routeError(new ExternalServiceError('x', 'errors.connectionFailed'))).toBe('notice');
    expect(routeError(new ExternalServiceError('x', 'errors.connectionLost'))).toBe('fatal');
    expect(routeError(new AppError('x', { status: 400 }))).toBe('fatal');
    expect(routeError(new AppError('x', { status: 404 }))).toBe('fatal');
    expect(routeError(new AppError('x', { status: 409 }))).toBe('log');
  });
});
