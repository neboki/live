import { describe, expect, it } from 'vitest';
import type { SessionLine } from '@/modules/session';
import { linesReached } from './sync';

function line(at: number, from?: number): SessionLine {
  return { at, ...(from === undefined ? {} : { from }), source: 's', translation: 't' };
}

describe('linesReached', () => {
  const now = 100_000;

  it('shows a line once the picture gets to where its sentence began', () => {
    const lines = [line(90_000, 88_000), line(95_000, 93_000), line(99_000, 97_000)];
    // 6 s behind: the picture is at 94 000, past the first two starts
    expect(linesReached(lines, 6000, now)).toEqual(lines.slice(0, 2));
    expect(linesReached(lines, 2000, now)).toEqual(lines);
    expect(linesReached(lines, 13_000, now)).toEqual([]);
  });

  it('falls back to when the sentence ended where its start is unknown', () => {
    const lines = [line(95_000)];
    expect(linesReached(lines, 5000, now)).toEqual(lines);
    expect(linesReached(lines, 5001, now)).toEqual([]);
  });
});
