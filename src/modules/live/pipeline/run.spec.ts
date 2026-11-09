import { describe, expect, it } from 'vitest';
import { captionDueFrom, createRun, isSaidIn, takeNext, type Sentence } from './run';

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

describe('captionDueFrom', () => {
  const run = (): ReturnType<typeof createRun> =>
    createRun({ apiKey: 'k', targetLanguage: 'Spanish', onFatal: () => undefined });

  it('is null while every sentence heard has its caption', () => {
    expect(captionDueFrom(run())).toBeNull();
  });

  it('is where the oldest sentence waiting for its translation began', () => {
    const waiting = run();
    waiting.inFlight = { sentence: { ...sentence(1, 'b', null), from: 900 }, text: 'x' };
    waiting.queue = [{ ...sentence(2, 'c', null), from: 1500 }, sentence(1200, 'd', null)];
    expect(captionDueFrom(waiting)).toBe(900);
  });

  it('counts speech still being said, from its start or the end of the last sentence', () => {
    const speaking = run();
    speaking.sttActivity = 'speech';
    speaking.speechStartedOn = 1000;
    expect(captionDueFrom(speaking)).toBe(1000);
    speaking.lastHeardOn = 3000;
    expect(captionDueFrom(speaking)).toBe(3000);
    speaking.sttActivity = 'idle';
    expect(captionDueFrom(speaking)).toBeNull();
  });
});
