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

describe('createTranscriptItems with a model that writes while people speak', () => {
  function live(): ReturnType<typeof setup> & { partials: string[] } {
    const finals: string[] = [];
    const partials: string[] = [];
    const items = createTranscriptItems(
      { onPartial: (text) => partials.push(text), onFinal: (text) => finals.push(text) },
      { live: true },
    );
    return { items, finals, partials };
  }

  function say(items: ReturnType<typeof createTranscriptItems>, id: string, text: string): void {
    for (const word of text.split(' ')) items.delta(id, ` ${word}`);
  }

  it('hands each sentence over as the next begins, without waiting for the audio to be cut', () => {
    const { items, finals, partials } = live();

    say(items, 'a', 'Sales grew a lot. However, costs went up. So');

    expect(finals).toEqual(['Sales grew a lot.', 'However, costs went up.']);
    expect(partials.at(-1)).toBe('So');
  });

  it('sends only what is left when the sentence is finally closed', () => {
    const { items, finals } = live();
    say(items, 'a', 'Sales grew a lot. However, costs went up');
    items.committed('a');

    items.completed('a', 'Sales grew a lot. However, costs went up.');

    expect(finals).toEqual(['Sales grew a lot.', 'However, costs went up.']);
  });

  it('hands the last sentence over at its full stop once its audio is closed', () => {
    const { items, finals } = live();
    say(items, 'a', 'However, costs went');
    items.committed('a');

    say(items, 'a', 'up.');
    expect(finals).toEqual(['However, costs went up.']);

    items.completed('a', 'However, costs went up.');
    expect(finals).toEqual(['However, costs went up.']);
  });

  it('says nothing twice when the closing text differs from what was streamed', () => {
    const { items, finals } = live();
    say(items, 'a', 'Sales grew a lot. However, costs went up');
    items.committed('a');

    items.completed('a', 'Sales grew a lot! However, costs went up.');

    expect(finals).toEqual(['Sales grew a lot.', 'However, costs went up']);
  });

  it('hands over a finished sentence when no more words come, even with the audio still open', () => {
    const { items, finals } = live();
    const start = Date.now();
    say(items, 'a', 'How are you?');

    items.settle(start + 300);
    expect(finals).toEqual([]);
    items.settle(start + 1000);

    expect(finals).toEqual(['How are you?']);
    expect(items.hasPending()).toBe(false);
  });

  it('never sends out a full stop on its own when it comes after its sentence went out', () => {
    const { items, finals } = live();
    const start = Date.now();
    say(items, 'a', 'Hizo lo contrario');
    items.settle(start + 2000);
    expect(finals).toEqual(['Hizo lo contrario']);

    items.delta('a', '.');
    items.settle(start + 4000);
    items.committed('a');
    items.completed('a', 'Hizo lo contrario.');

    expect(finals).toEqual(['Hizo lo contrario']);
  });

  it('waits longer for a sentence left half said', () => {
    const { items, finals } = live();
    const start = Date.now();
    say(items, 'a', 'How are');

    items.settle(start + 1000);
    expect(finals).toEqual([]);
    items.settle(start + 2000);

    expect(finals).toEqual(['How are']);
  });

  it('keeps the order: a sentence waits for the one before it to close', () => {
    const { items, finals } = live();
    items.committed('a');
    say(items, 'b', 'Second one. Third');
    expect(finals).toEqual([]);

    items.completed('a', 'First.');
    say(items, 'b', 'one');

    expect(finals).toEqual(['First.', 'Second one.']);
  });

  it('does not give up on a sentence still being said, however long it runs', () => {
    const { items, finals } = live();
    const start = Date.now();
    say(items, 'a', 'One moment');

    expect(items.expire(8000, start + 9000, true)).toBe(0);
    say(items, 'a', 'please. Thanks');

    expect(finals).toEqual(['One moment please.']);
  });

  it('gives each early piece the voice heard so far and the moment it began', () => {
    const metas: unknown[] = [];
    const voice = { pitch: 120, bands: new Float32Array(16), speechMs: 900 };
    const items = createTranscriptItems(
      { onPartial: vi.fn(), onFinal: (_text, meta) => metas.push(meta) },
      { live: true, voiceSoFar: () => voice },
    );

    say(items, 'a', 'Sales grew a lot. However');

    expect(metas).toEqual([{ voice, startedOn: expect.any(Number) as number }]);
  });

  it('gives a sentence handed over after its audio closed the voice of that audio', () => {
    const metas: unknown[] = [];
    const voice = { pitch: 120, bands: new Float32Array(16), speechMs: 900 };
    const items = createTranscriptItems(
      { onPartial: vi.fn(), onFinal: (_text, meta) => metas.push(meta) },
      // The meter starts over when the audio is closed: nothing to peek at any more
      { live: true, voiceSoFar: () => null },
    );
    say(items, 'a', 'Costs went');
    items.committed('a', voice, 1000);

    say(items, 'a', 'up.');

    expect(metas).toEqual([{ voice, startedOn: expect.any(Number) as number }]);
  });

  it('leaves the text whole for a model that only writes once the sentence is closed', () => {
    const { items, finals } = setup();
    say(items, 'a', 'Sales grew a lot. However, costs went up.');
    expect(finals).toEqual([]);
    items.committed('a');
    items.completed('a', 'Sales grew a lot. However, costs went up.');

    expect(finals).toEqual(['Sales grew a lot. However, costs went up.']);
  });
});
