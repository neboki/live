import { describe, expect, it } from 'vitest';
import { clampTo, fractionOf, stepTo } from './range';

const RANGE = { min: 0.8, max: 1.8, step: 0.1 };

describe('range', () => {
  it('clamps to the limits', () => {
    expect(clampTo(RANGE, 0.2)).toBe(0.8);
    expect(clampTo(RANGE, 2)).toBe(1.8);
    expect(clampTo(RANGE, 1.25)).toBe(1.25);
  });

  it('snaps to the step without float noise', () => {
    expect(stepTo(RANGE, 1 + 0.1 + 0.1)).toBe(1.2);
    expect(stepTo(RANGE, 1.04)).toBe(1);
    expect(stepTo(RANGE, 9)).toBe(1.8);
  });

  it('says where a value sits, from 0 to 1', () => {
    expect(fractionOf(RANGE, 0.8)).toBe(0);
    expect(fractionOf(RANGE, 1.3)).toBeCloseTo(0.5);
    expect(fractionOf(RANGE, 5)).toBe(1);
  });
});
