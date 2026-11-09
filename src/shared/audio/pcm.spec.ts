import { describe, expect, it } from 'vitest';
import { Resampler, createPcmAssembler, floatTo16BitPcm, levelFromRms, rms } from './pcm';

function ramp(length: number, start = 0): Float32Array {
  return Float32Array.from({ length }, (_, i) => (start + i) / 1000);
}

describe('Resampler', () => {
  it('halves the number of samples from 48 kHz to 24 kHz', () => {
    const resampler = new Resampler(48_000, 24_000);
    let total = 0;
    for (let chunk = 0; chunk < 10; chunk++) total += resampler.process(ramp(480)).length;

    expect(total).toBeGreaterThanOrEqual(2399);
    expect(total).toBeLessThanOrEqual(2400);
  });

  it('is continuous across chunk boundaries', () => {
    const resampler = new Resampler(48_000, 24_000);
    const first = resampler.process(ramp(100, 0));
    const second = resampler.process(ramp(100, 100));
    const joined = [...first, ...second];

    // A ramp resampled by 2 keeps a constant step of 0.002
    joined.slice(1).forEach((value, i) => {
      expect(value - (joined[i] ?? 0)).toBeCloseTo(0.002, 6);
    });
  });

  it('rejects invalid sample rates', () => {
    expect(() => new Resampler(0)).toThrow(RangeError);
  });
});

describe('floatTo16BitPcm', () => {
  it('scales and clamps samples', () => {
    expect(Array.from(floatTo16BitPcm(Float32Array.from([0, 1, -1, 2, -2])))).toEqual([
      0, 32767, -32768, 32767, -32768,
    ]);
  });
});

describe('levels', () => {
  it('computes the RMS of a signal', () => {
    expect(rms(Float32Array.from([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });

  it('maps silence to 0 and loud audio to 1', () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(0.5)).toBe(1);
  });
});

describe('createPcmAssembler', () => {
  it('turns whole bytes into little-endian samples', () => {
    const assemble = createPcmAssembler();
    expect([...assemble(new Uint8Array([1, 0, 0xff, 0xff]))]).toEqual([1, -1]);
  });

  it('keeps an odd byte for the next read', () => {
    const assemble = createPcmAssembler();
    expect([...assemble(new Uint8Array([1, 0, 2]))]).toEqual([1]);
    expect([...assemble(new Uint8Array([0, 3, 0]))]).toEqual([2, 3]);
    expect([...assemble(new Uint8Array([0]))]).toEqual([]);
    expect([...assemble(new Uint8Array([]))]).toEqual([]);
  });
});
