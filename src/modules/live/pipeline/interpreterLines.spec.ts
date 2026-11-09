import { describe, expect, it } from 'vitest';
import {
  CLOSE_AFTER_END_MS,
  CLOSE_AFTER_IDLE_MS,
  MAX_LINE_CHARS,
  closeDelay,
  endsSentence,
  joinText,
  splitSource,
} from './interpreterLines';

describe('interpreterLines', () => {
  it('knows a sentence end, also before closing quotes', () => {
    expect(endsSentence('Hola.')).toBe(true);
    expect(endsSentence('¿Vienes?» ')).toBe(true);
    expect(endsSentence('Hola, qué')).toBe(false);
  });

  it('splits the original text at its last sentence end', () => {
    expect(splitSource('Hello there. How are')).toEqual({ done: 'Hello there.', rest: 'How are' });
    expect(splitSource('One. Two!')).toEqual({ done: 'One. Two!', rest: '' });
    expect(splitSource(' still talking ')).toEqual({ done: '', rest: 'still talking' });
  });

  it('puts a space between sentences that arrive glued together', () => {
    expect(joinText('Good morning.', 'Today')).toBe('Good morning. Today');
    expect(joinText('Good morning. ', 'Today')).toBe('Good morning. Today');
    expect(joinText('Good', ' morning')).toBe('Good morning');
    expect(joinText('Hi.', '..')).toBe('Hi...');
  });

  it('closes soon after a sentence end, at once when long, later otherwise', () => {
    expect(closeDelay('Done.')).toBe(CLOSE_AFTER_END_MS);
    expect(closeDelay(`${'a'.repeat(MAX_LINE_CHARS)}.`)).toBe(0);
    expect(closeDelay('not yet')).toBe(CLOSE_AFTER_IDLE_MS);
  });
});
