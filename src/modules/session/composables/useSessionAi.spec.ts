import { createPinia, setActivePinia } from 'pinia';
import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/modules/settings';
import { openAiAssistant, type AskRequest } from '@/shared/providers/openai/llm/assistant';
import { openAiLlm } from '@/shared/providers/openai/llm/openAiLlm';
import { useSessionRecord } from '../store/useSessionRecord';
import { useSessionViewer } from '../store/useSessionViewer';
import { useSessionAi, type SessionAi } from './useSessionAi';

vi.mock('@/shared/providers/openai/llm/assistant', () => ({
  openAiAssistant: { title: vi.fn(), ask: vi.fn() },
}));
vi.mock('@/shared/providers/openai/llm/openAiLlm', () => ({
  openAiLlm: { summarize: vi.fn() },
}));

const START = new Date(2026, 9, 20, 14, 30).getTime();
const KEY = `sk-${'a'.repeat(48)}`;
const SPENT = { model: 'm', inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 };

let scope: EffectScope;
let changed: ReturnType<typeof vi.fn<() => void>>;

/** The conversation that just ended, on screen, with `count` sentences */
function show(count: number): void {
  const record = useSessionRecord();
  record.begin({ pair: { from: 'en', to: 'es' }, startedAt: START });
  for (let i = 0; i < count; i++) {
    record.addLine({ at: START + i * 1000, source: `sentence ${i}`, translation: `frase ${i}` });
  }
  record.end();
  useSessionViewer().showRecent();
}

function start(key = KEY): SessionAi {
  useSettingsStore().apiKey = key;
  return scope.run(() => useSessionAi(changed)) as SessionAi;
}

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  scope = effectScope();
  changed = vi.fn<() => void>();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(openAiAssistant.title).mockReset();
  vi.mocked(openAiAssistant.ask).mockReset();
  vi.mocked(openAiLlm.summarize).mockReset();
});

afterEach(() => scope.stop());

describe('useSessionAi', () => {
  it('offers nothing without a key of the person', async () => {
    show(6);
    const ai = start('');

    expect(ai.ready.value).toBe(false);
    expect(await ai.name()).toBe(false);
    expect(await ai.summarize()).toBe(false);
    expect(await ai.ask('Anything')).toBe(false);
    expect(openAiAssistant.title).not.toHaveBeenCalled();
  });

  it('names the conversation in the language it was read in and adds what it cost', async () => {
    show(3);
    const ai = start();
    vi.mocked(openAiAssistant.title).mockImplementation((request) => {
      request.onUsage?.(SPENT);
      return Promise.resolve('Budget review');
    });

    expect(await ai.name()).toBe(true);

    expect(openAiAssistant.title).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: KEY, targetLanguage: 'Spanish' }),
    );
    expect(useSessionViewer().snapshot).toMatchObject({ title: 'Budget review', usage: [SPENT] });
    expect(useSessionRecord().title).toBe('Budget review');
    expect(changed).toHaveBeenCalled();
    expect(ai.naming.value).toBe(false);
  });

  it('keeps a failed name to the log when nobody asked for it, and says why when asked', async () => {
    show(3);
    const ai = start();
    vi.mocked(openAiAssistant.title).mockRejectedValue(new Error('down'));

    expect(await ai.name({ quiet: true })).toBe(false);
    expect(ai.errorKey.value).toBeNull();

    expect(await ai.name()).toBe(false);
    expect(ai.errorKey.value).toBe('errors.unexpected');
    expect(useSessionViewer().snapshot).not.toHaveProperty('title');
  });

  it('writes the summary again from the whole conversation', async () => {
    show(5);
    const ai = start();
    useSessionViewer().setSummary(['Old point']);
    vi.mocked(openAiLlm.summarize).mockResolvedValue(['New point']);

    expect(await ai.summarize()).toBe(true);

    expect(vi.mocked(openAiLlm.summarize).mock.calls[0]?.[0]).toMatchObject({
      summary: [],
      newLines: ['sentence 0', 'sentence 1', 'sentence 2', 'sentence 3', 'sentence 4'],
    });
    expect(useSessionViewer().snapshot?.summary).toEqual(['New point']);
  });

  it('keeps the summary there was when the new one comes back empty', async () => {
    show(5);
    const ai = start();
    useSessionViewer().setSummary(['Old point']);
    vi.mocked(openAiLlm.summarize).mockResolvedValue([]);

    expect(await ai.summarize()).toBe(false);
    expect(useSessionViewer().snapshot?.summary).toEqual(['Old point']);
    expect(ai.errorKey.value).toBe('session.view.summaryEmpty');
  });

  it('answers as it is written, and a follow-up carries what came before', async () => {
    show(3);
    const ai = start();
    vi.mocked(openAiAssistant.ask).mockImplementation((request, onDelta) => {
      onDelta('First ');
      onDelta('answer');
      request.onUsage?.(SPENT);
      return Promise.resolve();
    });

    expect(await ai.ask('Write the minutes', 'Minutes')).toBe(true);
    expect(await ai.ask('Shorter')).toBe(true);

    expect(ai.turns.value).toMatchObject([
      { label: 'Minutes', request: 'Write the minutes', answer: 'First answer', status: 'done' },
      { label: 'Shorter', answer: 'First answer', status: 'done' },
    ]);
    const second = vi.mocked(openAiAssistant.ask).mock.calls[1]?.[0] as AskRequest;
    expect(second.transcript).toContain('sentence 2');
    expect(second.earlier).toEqual([{ request: 'Write the minutes', answer: 'First answer' }]);
    expect(useSessionViewer().snapshot?.usage).toMatchObject([{ inputTokens: 200 }]);
  });

  it('keeps what arrived of an answer that was stopped, and marks one that failed', async () => {
    show(3);
    const ai = start();
    vi.mocked(openAiAssistant.ask).mockImplementationOnce(
      (request, onDelta) =>
        new Promise((_, reject) => {
          onDelta('Half');
          request.signal?.addEventListener('abort', () =>
            reject(new DOMException('stopped', 'AbortError')),
          );
        }),
    );

    const asked = ai.ask('Long one');
    ai.stop();
    expect(await asked).toBe(false);
    expect(ai.turns.value).toMatchObject([{ answer: 'Half', status: 'stopped' }]);
    expect(ai.errorKey.value).toBeNull();

    vi.mocked(openAiAssistant.ask).mockRejectedValueOnce(new Error('down'));
    expect(await ai.ask('Again')).toBe(false);
    expect(ai.turns.value[1]).toMatchObject({ status: 'failed' });
    expect(ai.asking.value).toBe(false);
  });

  it('forgets what was asked when another conversation is opened', async () => {
    show(3);
    const ai = start();
    vi.mocked(openAiAssistant.ask).mockResolvedValue(undefined);
    await ai.ask('Anything');
    expect(ai.turns.value).toHaveLength(1);

    useSessionViewer().close();
    await Promise.resolve();

    expect(ai.turns.value).toEqual([]);
  });
});
