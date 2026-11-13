import { describe, expect, it } from 'vitest';
import { captionComing, createRun, isSaidIn, takeNext, type Sentence } from './run';

function sentence(seq: number, text: string, speaker: number | null): Sentence {
  return { seq, text, previous: [], heardAt: seq, heardOn: seq, speaker };
}

describe('takeNext', () => {
  it("joins one speaker's sentences and stops where the turn changes", () => {
    const queue = [
      sentence(0, 'a', 0),
      sentence(1, 'b', 0),
      sentence(2, 'c', 1),
      sentence(3, 'd', 0),
    ];

    expect(takeNext(queue)).toMatchObject({ text: 'a b', speaker: 0, absorbed: [{ seq: 1 }] });
    expect(takeNext(queue)).toMatchObject({ text: 'c', speaker: 1 });
    expect(takeNext(queue)).toMatchObject({ text: 'd', speaker: 0 });
    expect(takeNext(queue)).toBeUndefined();
  });

  it('in a conversation, never joins sentences nobody could place', () => {
    const queue = [sentence(0, 'Hola', null), sentence(1, 'Hello', null)];
    expect(takeNext(queue, false)).toMatchObject({ text: 'Hola' });
    expect(takeNext(queue, false)).toMatchObject({ text: 'Hello' });
    expect(takeNext(queue, false)).toBeUndefined();
  });

  it('returns a lone sentence as it is', () => {
    const only = sentence(0, 'a', null);
    expect(takeNext([only])).toBe(only);
  });
});

describe('isSaidIn', () => {
  const said = (language?: string): Sentence => ({ ...sentence(0, 'a', null), language });

  it('matches codes, regional codes and English names', () => {
    expect(isSaidIn(said('es'), 'es', 'Spanish')).toBe(true);
    expect(isSaidIn(said('es-ES'), 'es', 'Spanish')).toBe(true);
    expect(isSaidIn(said('spanish'), 'es', 'Spanish')).toBe(true);
    expect(isSaidIn(said('en'), 'es', 'Spanish')).toBe(false);
  });

  it('translates when the language or the target code is unknown', () => {
    expect(isSaidIn(said(), 'es', 'Spanish')).toBe(false);
    expect(isSaidIn(said('es'), undefined, 'Spanish')).toBe(false);
  });

  it('needs every joined sentence in the target language', () => {
    const joined = { ...said('es'), absorbed: [said('en')] };
    expect(isSaidIn(joined, 'es', 'Spanish')).toBe(false);
    expect(isSaidIn({ ...joined, absorbed: [said('es')] }, 'es', 'Spanish')).toBe(true);
  });
});

describe('captionComing', () => {
  const run = (): ReturnType<typeof createRun> =>
    createRun({ apiKey: 'k', targetLanguage: 'Spanish', onFatal: () => undefined });

  it('is null while no translation is being written, or it has no words yet', () => {
    const idle = run();
    expect(captionComing(idle)).toBeNull();
    idle.inFlight = { sentence: { ...sentence(1, 'b', null), from: 900 }, text: '' };
    expect(captionComing(idle)).toBeNull();
  });

  it('is the words so far, placed where their sentence began', () => {
    const writing = run();
    writing.inFlight = { sentence: { ...sentence(1, 'b', 2), from: 900 }, text: 'Hola a' };
    expect(captionComing(writing)).toEqual({ from: 900, text: 'Hola a', speaker: 2 });
    // Without a known start, where it was heard in full
    const heard = sentence(1, 'c', null);
    writing.inFlight = { sentence: heard, text: 'x' };
    expect(captionComing(writing)).toEqual({ from: heard.heardOn, text: 'x' });
  });
});
