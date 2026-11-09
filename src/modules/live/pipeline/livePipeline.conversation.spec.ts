import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import type { LlmProvider, TranslateRequest } from '@/shared/providers/types';
import { PARTNER_SPEAKER, USER_SPEAKER } from './conversation';
import { createLivePipeline } from './livePipeline';
import { fakeLlm, fakeRecord, fakeStt } from './livePipeline.fakes';
import type { Partner } from './types';

// A conversation: the user speaks Spanish, the other person English

function partner(receive: { toUser?: boolean; toPartner?: boolean } = {}): Partner {
  return {
    code: 'en',
    language: 'English',
    toUser: () => receive.toUser ?? true,
    toPartner: () => receive.toPartner ?? true,
  };
}

function options(
  other: Partner = partner(),
): Parameters<ReturnType<typeof createLivePipeline>['start']>[0] {
  return {
    apiKey: 'test-key',
    targetLanguage: 'Spanish',
    targetCode: 'es',
    partner: other,
    onFatal: vi.fn(),
  };
}

/** A translator that streams `reply` in small pieces, as the real one does */
function streams(reply: (request: TranslateRequest) => string): LlmProvider['translate'] {
  return async (request, onDelta) => {
    const text = reply(request);
    for (let at = 0; at < text.length; at += 3) onDelta(text.slice(at, at + 3));
  };
}

describe('createLivePipeline in a conversation', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("tells who spoke from the words when the transcriber doesn't say", async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn(streams((request) => `<${request.targetLanguage}>`));
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start(options());

    stt.callbacks().onFinal('Where is the station?');
    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(1));
    stt.callbacks().onFinal('Está a dos calles.');
    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(2));

    expect(translate.mock.calls.map(([request]) => request.targetLanguage)).toEqual([
      'Spanish',
      'English',
    ]);
    expect(record.addLine.mock.calls.map(([line]) => line.speaker)).toEqual([
      PARTNER_SPEAKER,
      USER_SPEAKER,
    ]);
  });

  it('asks the translator to name the language it could not place, and hides the tag', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn(streams(() => '[en] Un taxi, por favor'));
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start(options());

    stt.callbacks().onFinal('Taxi');

    await vi.waitFor(() => {
      expect(overlay.translation).toMatchObject({
        text: 'Un taxi, por favor',
        done: true,
        speaker: PARTNER_SPEAKER,
      });
    });
    expect(translate.mock.calls[0]?.[0].targetLanguage).toContain('square brackets');
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'Taxi',
        translation: 'Un taxi, por favor',
        speaker: PARTNER_SPEAKER,
        language: 'en',
      }),
    );
  });

  it('keeps a translation the translator did not tag, with nobody placed', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn(streams(() => 'Taxi'));
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start(options());

    stt.callbacks().onFinal('Taxi');

    await vi.waitFor(() => {
      expect(overlay.translation).toMatchObject({ text: 'Taxi', done: true, speaker: null });
    });
    expect(record.addLine).toHaveBeenCalledWith(expect.objectContaining({ translation: 'Taxi' }));
  });

  it('drops a tagged line whose listener turned translations off', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    const translate = vi.fn(streams(() => '[en] Un taxi'));
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start(options(partner({ toUser: false })));

    stt.callbacks().onFinal('Taxi');

    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(1));
    expect(record.addLine).toHaveBeenCalledWith(
      expect.objectContaining({ translation: '', speaker: PARTNER_SPEAKER }),
    );
    expect(overlay.translation.text).toBe('');
  });

  it('never joins sentences nobody could place into one translation', async () => {
    const overlay = useOverlayStore();
    const stt = fakeStt();
    const record = fakeRecord();
    let release: () => void = () => undefined;
    const first = new Promise<void>((resolve) => (release = resolve));
    const translate = vi.fn<LlmProvider['translate']>(async (request, onDelta) => {
      if (request.text === 'Okay?') await first;
      onDelta(request.text === 'Taxi' ? '[en] Taxi' : '[es] Okay?');
    });
    const pipeline = createLivePipeline({ stt, llm: fakeLlm({ translate }), overlay, record });
    await pipeline.start(options());

    // Heard while the first is still translating: two unknown sentences queue up
    stt.callbacks().onFinal('Okay?');
    stt.callbacks().onFinal('Taxi');
    stt.callbacks().onFinal('Taxi');
    release();

    await vi.waitFor(() => expect(record.addLine).toHaveBeenCalledTimes(3));
    expect(translate.mock.calls.map(([request]) => request.text)).toEqual([
      'Okay?',
      'Taxi',
      'Taxi',
    ]);
  });
});
