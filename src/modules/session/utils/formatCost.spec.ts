import { describe, expect, it } from 'vitest';
import { formatEur, usdToEur } from './formatCost';

/** Intl uses a narrow no-break space before € in Spanish */
const normalize = (text: string): string => text.replace(/\s/g, ' ');

describe('formatEur', () => {
  it('converts dollars with the given rate', () => {
    expect(usdToEur(2, 0.5)).toBe(1);
  });

  it('shows two decimals from a cent up', () => {
    expect(normalize(formatEur(1.5, 'es', 1))).toBe('1,50 €');
    expect(formatEur(1.5, 'en', 1)).toBe('€1.50');
  });

  it('shows four decimals below a cent, so a cheap session is not 0,00 €', () => {
    expect(normalize(formatEur(0.0042, 'es', 1))).toBe('0,0042 €');
  });

  it('shows zero and never a negative amount', () => {
    expect(normalize(formatEur(0, 'es', 1))).toBe('0,00 €');
    expect(normalize(formatEur(-1, 'es', 1))).toBe('0,00 €');
  });
});
