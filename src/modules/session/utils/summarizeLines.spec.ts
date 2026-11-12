import { describe, expect, it, vi } from 'vitest';
import type { SummaryRequest, TextContext } from '@/shared/providers/types';
import { SUMMARY_CHUNK, summarizeLines } from './summarizeLines';

const CONTEXT: TextContext = { apiKey: 'key', targetLanguage: 'Spanish', glossary: '' };

function lines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `line ${i}`);
}

describe('summarizeLines', () => {
  it('sends the conversation a stretch at a time, each building on the last points', async () => {
    const summarize = vi.fn((request: SummaryRequest) =>
      Promise.resolve([`points after ${request.newLines.length} more`]),
    );

    const points = await summarizeLines({ summarize }, CONTEXT, lines(SUMMARY_CHUNK + 5));

    expect(summarize).toHaveBeenCalledTimes(2);
    expect(summarize.mock.calls[0]?.[0].summary).toEqual([]);
    expect(summarize.mock.calls[1]?.[0].summary).toEqual([`points after ${SUMMARY_CHUNK} more`]);
    expect(points).toEqual(['points after 5 more']);
  });

  it('keeps the earlier points when a stretch adds none', async () => {
    const summarize = vi
      .fn<(request: SummaryRequest) => Promise<string[]>>()
      .mockResolvedValueOnce(['first'])
      .mockResolvedValueOnce([]);

    expect(await summarizeLines({ summarize }, CONTEXT, lines(SUMMARY_CHUNK + 1))).toEqual([
      'first',
    ]);
  });

  it('asks nothing for an empty conversation', async () => {
    const summarize = vi.fn(() => Promise.resolve(['never']));

    expect(await summarizeLines({ summarize }, CONTEXT, [])).toEqual([]);
    expect(summarize).not.toHaveBeenCalled();
  });
});
