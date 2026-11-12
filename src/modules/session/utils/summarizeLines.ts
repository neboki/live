import type { LlmProvider, TextContext } from '@/shared/providers/types';

/** Sentences sent per call, as while live: each call refines the key points so far */
export const SUMMARY_CHUNK = 40;

/**
 * The key points of a whole conversation, written after it ended: its sentences go to
 * the model a stretch at a time, each call building on the points of the one before.
 * Throws what the provider throws; empty when the model found nothing worth keeping.
 */
export async function summarizeLines(
  llm: Pick<LlmProvider, 'summarize'>,
  context: TextContext,
  lines: readonly string[],
): Promise<string[]> {
  let summary: string[] = [];
  for (let from = 0; from < lines.length; from += SUMMARY_CHUNK) {
    const points = await llm.summarize({
      ...context,
      summary,
      newLines: lines.slice(from, from + SUMMARY_CHUNK),
    });
    if (points.length) summary = points;
  }
  return summary;
}
