import { describe, expect, it } from 'vitest';
import { createMarkupFilter } from './markupFilter';

/** What reaches the captions when the chunks come one by one */
function shown(chunks: string[]): string {
  const filter = createMarkupFilter();
  return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
}

describe('createMarkupFilter', () => {
  it('leaves an ordinary translation as it is', () => {
    expect(shown(['It hasn’t ', 'been 176 seats.'])).toBe('It hasn’t been 176 seats.');
  });

  it('takes out a tag the model adds, whole or split across chunks', () => {
    expect(shown(['It hasn’t been,</final_answer>'])).toBe('It hasn’t been,');
    expect(shown(['It hasn’t been,</fin', 'al_answer>'])).toBe('It hasn’t been,');
    expect(shown(['<transcript>', 'Hello', '</', 'transcript>'])).toBe('Hello');
  });

  it('keeps a "<" that is not a tag', () => {
    expect(shown(['Costs are < 5 % and x <', ' y'])).toBe('Costs are < 5 % and x < y');
    expect(shown(['I <3 it'])).toBe('I <3 it');
    expect(shown(['a <b'])).toBe('a <b');
  });

  it('starts over with a retried request', () => {
    const filter = createMarkupFilter();
    filter.push('Half </fin');
    filter.reset();

    expect(filter.push('Whole') + filter.flush()).toBe('Whole');
  });
});
