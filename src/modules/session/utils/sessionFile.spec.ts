import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors';
import type { SessionSnapshot } from '../types';
import { parseSessionFile, SESSION_FORMAT, toSessionFile } from './sessionFile';

const START = new Date(2026, 9, 20, 14, 30).getTime();

function session(): SessionSnapshot {
  return {
    startedAt: START,
    endedAt: START + 60_000,
    pair: { from: 'AUTO', to: 'ES' },
    lines: [
      { at: START + 1_000, source: 'Hello', language: 'en', translation: 'Hola', speaker: 1 },
      { at: START + 2_000, source: 'Bye', translation: '' },
    ],
    summary: ['They said hello'],
    glossary: 'Acme',
    usage: [
      { model: 'gpt-6-luna', inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 },
      {
        model: 'gpt-live-transcribe',
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        audioSeconds: 60,
      },
    ],
  };
}

function file(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(toSessionFile(session())), ...overrides });
}

function errorOf(content: string): ValidationError {
  try {
    parseSessionFile(content);
  } catch (err) {
    if (err instanceof ValidationError) return err;
  }
  throw new Error('expected a ValidationError');
}

describe('session file', () => {
  it('round-trips a session', () => {
    expect(parseSessionFile(toSessionFile(session()))).toEqual(session());
  });

  it('writes a recognisable, versioned envelope', () => {
    const data = JSON.parse(toSessionFile(session(), new Date('2026-10-21T08:00:00Z')));

    expect(data).toMatchObject({
      format: SESSION_FORMAT,
      version: 1,
      exportedAt: '2026-10-21T08:00:00.000Z',
    });
  });

  it('refuses text that is not JSON or not ours', () => {
    expect(errorOf('not json').userMessageKey).toBe('errors.sessionFile');
    expect(errorOf('{"format":"other"}').userMessageKey).toBe('errors.sessionFile');
    expect(errorOf('[]').userMessageKey).toBe('errors.sessionFile');
  });

  it('says when the file comes from a newer version', () => {
    expect(errorOf(file({ version: 2 })).userMessageKey).toBe('errors.sessionFileVersion');
  });

  it('refuses fields of the wrong type', () => {
    const broken = { ...session(), lines: [{ at: 'soon', source: 'x', translation: 'y' }] };
    expect(errorOf(file({ session: broken })).message).toContain('line 0 time');
    expect(errorOf(file({ session: { ...session(), startedAt: -1 } })).status).toBe(400);
    expect(errorOf(file({ session: { ...session(), usage: [{ model: 3 }] } })).message).toContain(
      'usage 0 model',
    );
  });

  it('fills optional fields and drops unknown ones', () => {
    const minimal = { startedAt: START, lines: [{ at: START, source: 'Hi' }], extra: true };

    expect(parseSessionFile(file({ session: minimal }))).toEqual({
      startedAt: START,
      endedAt: null,
      pair: { from: '', to: '' },
      lines: [{ at: START, source: 'Hi', translation: '' }],
      summary: [],
      glossary: '',
      usage: [],
    });
  });
});
