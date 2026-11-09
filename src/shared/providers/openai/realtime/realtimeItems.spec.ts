import { describe, expect, it, vi } from 'vitest';
import { createTranscriptItems } from './realtimeItems';

function setup(): {
  items: ReturnType<typeof createTranscriptItems>;
  finals: string[];
} {
  const finals: string[] = [];
  const items = createTranscriptItems({
    onPartial: vi.fn(),
    onFinal: (text) => finals.push(text),
  });
  return { items, finals };
}

describe('createTranscriptItems', () => {
  it('sends finals in commit order, a slow sentence holding back the next', () => {
    const { items, finals } = setup();
    items.committed('a');
    items.committed('b');

    items.completed('b', 'Second');
    expect(finals).toEqual([]);
    items.completed('a', 'First');

    expect(finals).toEqual(['First', 'Second']);
  });

  it('gives up on a sentence the server never finishes, with the text it had', () => {
    const { items, finals } = setup();
    const start = Date.now();
    items.committed('a');
    items.delta('a', 'Half a sen');
    items.committed('b');
    items.completed('b', 'Next one');

    expect(items.expire(8000, start + 7999)).toBe(0);
    expect(finals).toEqual([]);
    expect(items.expire(8000, start + 9000)).toBe(1);

    expect(finals).toEqual(['Half a sen', 'Next one']);
    expect(items.hasOpen()).toBe(false);
  });

  it('ignores the late final of a sentence it gave up on', () => {
    const { items, finals } = setup();
    const start = Date.now();
    items.committed('a');
    items.delta('a', 'Partial');
    items.expire(8000, start + 9000);

    items.delta('a', ' more');
    items.completed('a', 'Partial and more');

    expect(finals).toEqual(['Partial']);
    expect(items.hasOpen()).toBe(false);
  });

  it('drops a given-up sentence that had no text at all', () => {
    const { items, finals } = setup();
    const start = Date.now();
    items.committed('a');
    items.committed('b');
    items.completed('b', 'After');

    items.expire(8000, start + 9000);

    expect(finals).toEqual(['After']);
  });
});
