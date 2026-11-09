import { describe, expect, it } from 'vitest';
import type { SessionLine } from '@/modules/session';
import { linesReached, suggestedDelay } from './sync';

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

describe('suggestedDelay', () => {
  const CHOICES = [3, 5, 8, 10, 15, 20, 30];
  /** A line whose caption arrived `waitMs` after its sentence began */
  const waited = (waitMs: number): SessionLine => line(100_000 + waitMs, 100_000);

  it('suggests nothing while the captions land within the delay', () => {
    expect(suggestedDelay([waited(4000), waited(9000), waited(7000)], 10, CHOICES)).toBeNull();
  });

  it('ignores a single slow caption', () => {
    expect(suggestedDelay([waited(4000), waited(14_000), waited(6000)], 10, CHOICES)).toBeNull();
  });

  it('offers the shortest delay that fits all but the slowest late caption', () => {
    const lines = [waited(12_000), waited(13_000), waited(25_000)];
    expect(suggestedDelay(lines, 10, CHOICES)).toBe(15);
  });

  it('offers the longest delay when even that is short, and nothing beyond it', () => {
    const lines = [waited(40_000), waited(45_000)];
    expect(suggestedDelay(lines, 10, CHOICES)).toBe(30);
    expect(suggestedDelay(lines, 30, CHOICES)).toBeNull();
  });

  it('looks only at recent lines, and only those whose start is known', () => {
    const old = [waited(20_000), waited(20_000)];
    const recent = Array.from({ length: 6 }, () => waited(3000));
    expect(suggestedDelay([...old, ...recent], 5, CHOICES)).toBeNull();
    expect(suggestedDelay([line(120_000), line(130_000)], 5, CHOICES)).toBeNull();
  });
});
