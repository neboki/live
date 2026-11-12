import { describe, expect, it } from 'vitest';
import { highlightParts } from './highlight';

describe('highlightParts', () => {
  it('returns the text whole without a search', () => {
    expect(highlightParts('Hello there', '  ')).toEqual([{ text: 'Hello there', hit: false }]);
  });

  it('marks every match, whatever its case, keeping the original letters', () => {
    expect(highlightParts('Plan the plan', 'PLAN')).toEqual([
      { text: 'Plan', hit: true },
      { text: ' the ', hit: false },
      { text: 'plan', hit: true },
    ]);
  });

  it('returns the text whole when nothing matches', () => {
    expect(highlightParts('Hello', 'bye')).toEqual([{ text: 'Hello', hit: false }]);
  });

  it('does not mark a text whose lower case has another length', () => {
    expect(highlightParts('İstanbul', 'i')).toEqual([{ text: 'İstanbul', hit: false }]);
  });
});
