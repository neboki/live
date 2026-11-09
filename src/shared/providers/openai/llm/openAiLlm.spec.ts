import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeChat, streamChat } from './chat';
import { MODELS, TOKENS } from '../config';
import { openAiLlm, parseReplies } from './openAiLlm';
import {
  QUESTIONS_PROMPT,
  SUGGEST_PROMPT,
  SUMMARY_PROMPT,
  TALK_SUMMARY_PROMPT,
  TRANSLATE_PROMPT,
} from './prompts';

vi.mock('./chat', () => ({ completeChat: vi.fn(), streamChat: vi.fn() }));

const base = { apiKey: 'sk', targetLanguage: 'Spanish', glossary: '' };

beforeEach(() => {
  vi.mocked(completeChat).mockReset().mockResolvedValue('');
  vi.mocked(streamChat).mockReset().mockResolvedValue(undefined);
});

describe('openAiLlm', () => {
  it('translates by streaming with the translation model and prompt', async () => {
    const onDelta = vi.fn();
    await openAiLlm.translate({ ...base, text: 'Hi', previous: [] }, onDelta);

    expect(streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODELS.translation,
        system: TRANSLATE_PROMPT,
        maxTokens: TOKENS.translation,
      }),
      onDelta,
    );
  });

  it('summarizes with the summary model and parses points', async () => {
    vi.mocked(completeChat).mockResolvedValue('- One\n- Two');

    await expect(openAiLlm.summarize({ ...base, summary: [], newLines: ['x'] })).resolves.toEqual([
      'One',
      'Two',
    ]);
    expect(completeChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODELS.summary,
        system: SUMMARY_PROMPT,
        maxTokens: TOKENS.summary,
      }),
    );
    expect(vi.mocked(completeChat).mock.calls[0]?.[0].json).toBeUndefined();
  });

  it('asks for JSON suggestions with the suggestions model', async () => {
    vi.mocked(completeChat).mockResolvedValue('{"replies":[{"mine":"Si","theirs":"Yes"}]}');

    await expect(openAiLlm.suggest({ ...base, context: [], lastLine: 'Ok?' })).resolves.toEqual([
      { mine: 'Si', theirs: 'Yes' },
    ]);
    expect(completeChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODELS.suggestions,
        system: SUGGEST_PROMPT,
        maxTokens: TOKENS.suggestions,
        json: true,
      }),
    );
  });

  it('uses the talk prompts for a talk', async () => {
    vi.mocked(completeChat)
      .mockResolvedValueOnce('Idea')
      .mockResolvedValueOnce('{"questions":[{"mine":"¿Fuente?","theirs":"Source?"}]}');

    await openAiLlm.summarize({ ...base, summary: [], newLines: ['x'], mode: 'talk' });
    await expect(
      openAiLlm.suggest({ ...base, context: [], lastLine: 'So.', mode: 'talk', asked: ['Q0'] }),
    ).resolves.toEqual([{ mine: '¿Fuente?', theirs: 'Source?' }]);

    const [summary, questions] = vi.mocked(completeChat).mock.calls.map(([request]) => request);
    expect(summary?.system).toBe(TALK_SUMMARY_PROMPT);
    expect(questions?.system).toBe(QUESTIONS_PROMPT);
    expect(questions?.user).toContain('<asked>\nQ0\n</asked>');
    expect(questions?.json).toBe(true);
  });

  it('passes the model override, signal and usage callback through', async () => {
    const signal = new AbortController().signal;
    const onUsage = vi.fn();
    await openAiLlm.translate(
      { ...base, text: 'Hi', previous: [], model: 'gpt-x', signal, onUsage },
      vi.fn(),
    );
    await openAiLlm.summarize({ ...base, summary: [], newLines: [], model: 'gpt-y', signal });

    expect(vi.mocked(streamChat).mock.calls[0]?.[0]).toMatchObject({
      apiKey: 'sk',
      model: 'gpt-x',
      signal,
      onUsage,
    });
    expect(vi.mocked(completeChat).mock.calls[0]?.[0]).toMatchObject({ model: 'gpt-y', signal });
  });
});

describe('parseReplies', () => {
  it('reads fenced JSON and drops incomplete replies', () => {
    const text = '```json\n{"replies":[{"mine":"Si","theirs":"Yes"},{"mine":"Solo"}]}\n```';

    expect(parseReplies(text)).toEqual([{ mine: 'Si', theirs: 'Yes' }]);
  });

  it('drops non-string fields, trims and returns at most three', () => {
    const replies = [
      { mine: 1, theirs: 'x' },
      { mine: ' a ', theirs: ' b ' },
      { mine: 'c', theirs: ['d'] },
      null,
      { mine: 'e', theirs: 'f' },
      { mine: 'g', theirs: 'h' },
      { mine: 'i', theirs: 'j' },
    ];

    expect(parseReplies(JSON.stringify({ replies }))).toEqual([
      { mine: 'a', theirs: 'b' },
      { mine: 'e', theirs: 'f' },
      { mine: 'g', theirs: 'h' },
    ]);
  });

  it('caps each reply at 200 characters', () => {
    const long = 'x'.repeat(500);
    const [reply] = parseReplies(JSON.stringify({ replies: [{ mine: long, theirs: long }] }));

    expect(reply?.mine).toHaveLength(200);
    expect(reply?.theirs).toHaveLength(200);
  });

  it('returns nothing for unreadable or oddly shaped output', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(parseReplies('not json')).toEqual([]);
    expect(parseReplies('{"replies":"nope"}')).toEqual([]);
    expect(parseReplies('null')).toEqual([]);
  });
});
