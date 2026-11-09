import type { NumberRange } from '../types';

/** Keeps `value` inside the range. */
export function clampTo(range: Readonly<NumberRange>, value: number): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** Clamps and snaps to the range's step, without the float noise of 0.1 + 0.2. */
export function stepTo(range: Readonly<NumberRange>, value: number): number {
  const snapped = range.min + Math.round((value - range.min) / range.step) * range.step;
  return Number(clampTo(range, snapped).toFixed(4));
}

/** Where `value` sits in the range, from 0 to 1 (for a slider's filled track). */
export function fractionOf(range: Readonly<NumberRange>, value: number): number {
  return (clampTo(range, value) - range.min) / (range.max - range.min);
}
