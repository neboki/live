import { describe, expect, it } from 'vitest';
import { spokenUpTo } from './sentences';

describe('spokenUpTo', () => {
  it('stops after the last sentence whose next word has started', () => {
    const text = 'Hola a todos. Hoy hablamos de esto. Y de';
    expect(text.slice(0, spokenUpTo(text, 0))).toBe('Hola a todos. Hoy hablamos de esto. ');
  });

  it('is not fooled by decimals, nor by a sentence end still being typed', () => {
    expect(spokenUpTo('Son 3.5 kilos', 0)).toBe(0);
    expect(spokenUpTo('Hola a todos.', 0)).toBe(0);
    expect(spokenUpTo('Hola a todos. ', 0)).toBe(0);
  });

  it('only looks past what was already spoken', () => {
    const text = 'Hola a todos. ¿Qué tal? Bien';
    const first = spokenUpTo(text, 0);
    expect(text.slice(0, first)).toBe('Hola a todos. ¿Qué tal? ');
    expect(spokenUpTo(text, first)).toBe(first);
  });

  it('does not cut after an abbreviation or an initial', () => {
    expect(spokenUpTo('Habló el Dr. García ayer', 0)).toBe(0);
    expect(spokenUpTo('Use tools, e.g. a hammer', 0)).toBe(0);
    expect(spokenUpTo('Ask J. Smith first', 0)).toBe(0);
    const text = 'Llamó la Sra. Pérez. Luego';
    expect(text.slice(0, spokenUpTo(text, 0))).toBe('Llamó la Sra. Pérez. ');
  });

  it('takes closing quotes and brackets with the sentence', () => {
    const text = 'Dijo "vale." Luego';
    expect(text.slice(0, spokenUpTo(text, 0))).toBe('Dijo "vale." ');
  });
});
