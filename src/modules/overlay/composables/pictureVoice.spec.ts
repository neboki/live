import { describe, expect, it } from 'vitest';
import type { SessionLine } from '@/modules/session';
import { dueLines, LATE_VOICE_MS } from './pictureVoice';

function line(at: number, from: number | undefined, translation = 'hola'): SessionLine {
  return { at, ...(from === undefined ? {} : { from }), source: 'hello', translation };
}

describe('dueLines', () => {
  const lines = [line(10_000, 8000), line(14_000, 11_000), line(20_000, 17_000)];

  it('reads each line once the picture reaches where its sentence began', () => {
    expect(dueLines(lines, 0, 7999)).toEqual({ due: [], next: 0 });
    expect(dueLines(lines, 0, 8000)).toEqual({ due: [lines[0]], next: 1 });
    expect(dueLines(lines, 1, 12_000)).toEqual({ due: [lines[1]], next: 2 });
  });

  it('passes over lines the picture has already left behind', () => {
    // A jump ahead to 19 000: the first two ended long before
    expect(dueLines(lines, 0, 19_000)).toEqual({ due: [lines[2]], next: 3 });
    expect(dueLines(lines, 0, 10_000 + LATE_VOICE_MS).due).toEqual([lines[0], lines[1]]);
  });

  it('falls back to the end of the sentence and skips what needs no voice', () => {
    const others = [line(5000, undefined), line(6000, 5500, ''), line(7000, 6500, 'hello')];
    expect(dueLines(others, 0, 4999).due).toEqual([]);
    expect(dueLines(others, 0, 5000)).toEqual({ due: [others[0]], next: 1 });
    // The empty translation and the one said in the target language are passed over
    expect(dueLines(others, 1, 7000)).toEqual({ due: [], next: 3 });
  });
});
