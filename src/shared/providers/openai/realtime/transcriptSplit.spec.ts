import { describe, expect, it } from 'vitest';
import { endsSentence, splitPoint, wordCount } from './transcriptSplit';

/** The piece `splitPoint` hands over, or '' when it waits */
function piece(text: string): string {
  return text.slice(0, splitPoint(text));
}

describe('splitPoint', () => {
  it('waits while the sentence is still being said', () => {
    expect(piece(' Good morning everyone, and thanks')).toBe('');
    expect(piece(' Good morning everyone.')).toBe('');
  });

  it('hands a sentence over once the next one has begun', () => {
    expect(piece(' Sales grew by twelve percent. Today')).toBe(' Sales grew by twelve percent.');
    expect(piece(' ¿Me oyes bien? Vale')).toBe(' ¿Me oyes bien?');
    expect(piece('今日は晴れです。明日')).toBe('今日は晴れです。');
  });

  it('does not take the full stop of an abbreviation, an initial or a number for an end', () => {
    expect(piece(' I spoke to Mr. Smith')).toBe('');
    expect(piece(' In the U.S. economy')).toBe('');
    expect(piece(' It costs 3.5 euros')).toBe('');
    expect(piece(' Written by J. Smith')).toBe('');
  });

  it('splits a long sentence at its last clause end', () => {
    const text =
      ' He estado de vacaciones dos semanas, así que es imposible que haya gastado tanto';
    expect(piece(text)).toBe(' He estado de vacaciones dos semanas,');
  });

  it('never leaves a clause of a few words on its own', () => {
    expect(piece(' Maria, I know you have been talking to two companies in Portugal')).toBe('');
  });

  it('splits speech without any punctuation before its last word', () => {
    const words = Array.from({ length: 23 }, (_, index) => `word${index}`);
    expect(piece(` ${words.join(' ')}`)).toBe(` ${words.slice(0, -1).join(' ')}`);
  });
});

describe('wordCount', () => {
  it('counts words, and two characters as a word where no spaces are written', () => {
    expect(wordCount(' one two  three ')).toBe(3);
    expect(wordCount('今日は晴れです')).toBe(4);
  });
});

describe('endsSentence', () => {
  it('tells a finished sentence from one cut short', () => {
    expect(endsSentence('How are you?')).toBe(true);
    expect(endsSentence('He said "no." ')).toBe(true);
    expect(endsSentence('How are')).toBe(false);
  });
});
