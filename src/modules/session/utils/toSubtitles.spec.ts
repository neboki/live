import { describe, expect, it } from 'vitest';
import type { SessionSnapshot } from '../types';
import { toCues, toSubtitles } from './toSubtitles';

const START = 1_700_000_000_000;

function snapshot(lines: SessionSnapshot['lines']): SessionSnapshot {
  return {
    startedAt: START,
    endedAt: START + 60_000,
    pair: { from: 'EN', to: 'ES' },
    lines,
    summary: [],
    glossary: '',
    usage: [],
  };
}

describe('toCues', () => {
  it('times each sentence from when it began to when it was heard in full', () => {
    const cues = toCues(
      snapshot([
        { at: START + 4000, from: START + 1000, source: 'Hello.', translation: 'Hola.' },
        { at: START + 9000, from: START + 5000, source: 'Bye.', translation: 'Adiós.' },
      ]),
    );
    expect(cues).toEqual([
      { startMs: 1000, endMs: 4000, text: 'Hola.' },
      { startMs: 5000, endMs: 9000, text: 'Adiós.' },
    ]);
  });

  it('assumes three seconds for a sentence with no known start, never overlapping the last', () => {
    const cues = toCues(
      snapshot([
        { at: START + 4000, source: 'One.', translation: '' },
        { at: START + 5000, source: 'Two.', translation: 'Dos.' },
      ]),
    );
    expect(cues).toEqual([
      { startMs: 1000, endMs: 4000, text: 'One.' },
      { startMs: 4000, endMs: 5000, text: 'Dos.' },
    ]);
  });

  it('keeps every cue readable and skips empty lines', () => {
    const cues = toCues(
      snapshot([
        { at: START + 1000, from: START + 900, source: 'Quick.', translation: 'Rápido.' },
        { at: START + 1200, from: START + 1100, source: '', translation: '  ' },
        { at: START + 1300, from: START + 1250, source: 'Again.', translation: 'Otra.' },
      ]),
    );
    expect(cues).toEqual([
      { startMs: 200, endMs: 1000, text: 'Rápido.' },
      { startMs: 1000, endMs: 1800, text: 'Otra.' },
    ]);
  });
});

describe('toSubtitles', () => {
  const record = snapshot([
    { at: START + 4000, from: START + 1000, source: 'Hello.', translation: 'Hola.' },
    {
      at: START + 65_500,
      from: START + 61_000,
      source: 'Bye.',
      translation: 'Adiós,\nhasta luego.',
    },
  ]);

  it('writes SRT with numbered cues and comma milliseconds', () => {
    expect(toSubtitles(record, 'srt')).toBe(
      '1\n00:00:01,000 --> 00:00:04,000\nHola.\n\n2\n00:01:01,000 --> 00:01:05,500\nAdiós, hasta luego.\n',
    );
  });

  it('writes WebVTT with its header and dot milliseconds', () => {
    expect(toSubtitles(record, 'vtt')).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHola.\n\n00:01:01.000 --> 00:01:05.500\nAdiós, hasta luego.\n',
    );
  });
});
