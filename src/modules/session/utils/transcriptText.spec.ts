import { describe, expect, it } from 'vitest';
import type { SessionLine } from '../types';
import { clock } from './toMarkdown';
import { OPENING_LINES, transcriptOpening, transcriptText } from './transcriptText';

const START = Date.UTC(2026, 0, 5, 9, 0, 0);

function lines(count: number): SessionLine[] {
  return Array.from({ length: count }, (_, i) => ({
    at: START + i * 1000,
    source: `sentence ${i}`,
    translation: `frase ${i}`,
  }));
}

describe('transcriptText', () => {
  it('writes each sentence as it was heard, with its time and its voice when known', () => {
    const [first, second] = lines(2) as [SessionLine, SessionLine];

    expect(transcriptText([first, { ...second, speaker: 1 }])).toBe(
      `[${clock(first.at)}] sentence 0\n[${clock(second.at)}] Voice 2: sentence 1`,
    );
  });

  it('keeps the beginning and the end of one too long, on whole lines', () => {
    const all = lines(200);
    const text = transcriptText(all, 600);
    const kept = text.split('\n');

    expect(text.length).toBeLessThanOrEqual(600);
    expect(kept[0]).toContain('sentence 0');
    expect(kept.at(-1)).toContain('sentence 199');
    expect(kept.filter((line) => line === '[…]')).toHaveLength(1);
    expect(kept.every((line) => line === '[…]' || /^\[.+\] sentence \d+$/.test(line))).toBe(true);
  });
});

describe('transcriptOpening', () => {
  it('is only how the conversation begins', () => {
    expect(transcriptOpening(lines(OPENING_LINES + 20)).split('\n')).toHaveLength(OPENING_LINES);
  });
});
