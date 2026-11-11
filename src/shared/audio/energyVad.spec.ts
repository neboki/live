import { describe, expect, it } from 'vitest';
import { createEnergyVad } from './energyVad';

const RATE = 24_000;
const CHUNK = RATE / 10; // 100 ms
const speech = (): Int16Array => new Int16Array(CHUNK).fill(3000);
const silence = (): Int16Array => new Int16Array(CHUNK);
/** RMS 0.01 is the speech threshold; 327/32768 ≈ 0.00998 stays just below it */
const whisper = (): Int16Array => new Int16Array(CHUNK).fill(327);
const atThreshold = (): Int16Array => new Int16Array(CHUNK).fill(328);

describe('createEnergyVad', () => {
  it('never closes a sentence when nobody spoke', () => {
    const vad = createEnergyVad();
    const closes = Array.from({ length: 30 }, () => vad.feed(silence(), RATE));

    expect(closes.some(Boolean)).toBe(false);
    expect(vad.flush()).toBe(false);
  });

  it('closes after half a second of silence following speech', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);
    const closes = Array.from({ length: 5 }, () => vad.feed(silence(), RATE));

    expect(closes).toEqual([false, false, false, false, true]);
  });

  it('caps a long monologue at 4 seconds', () => {
    const vad = createEnergyVad();
    const closes = Array.from({ length: 60 }, () => vad.feed(speech(), RATE));

    expect(closes.indexOf(true)).toBe(39);
  });

  it('closes a long sentence on a shorter pause the longer it runs', () => {
    const after = (speechChunks: number): number => {
      const vad = createEnergyVad();
      Array.from({ length: speechChunks }, () => vad.feed(speech(), RATE));
      const closes = Array.from({ length: 6 }, () => vad.feed(silence(), RATE));
      return (closes.indexOf(true) + 1) * 100;
    };

    expect(after(10)).toBe(500);
    // 2 s of speech: 300 ms is enough
    expect(after(20)).toBe(300);
    // 3 s of speech: a 200 ms breath (two chunks reach the 180 ms step)
    expect(after(30)).toBe(200);
  });

  it('flush reports a sentence still open', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);

    expect(vad.flush()).toBe(true);
    expect(vad.flush()).toBe(false);
  });

  it('treats audio just below the threshold as silence and at it as speech', () => {
    const quiet = createEnergyVad();
    quiet.feed(whisper(), RATE);
    expect(quiet.flush()).toBe(false);

    const loud = createEnergyVad();
    loud.feed(atThreshold(), RATE);
    expect(loud.flush()).toBe(true);
  });

  it('a short pause resets the silence counter', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);
    const closes = [
      ...Array.from({ length: 4 }, () => vad.feed(silence(), RATE)),
      vad.feed(speech(), RATE),
      ...Array.from({ length: 4 }, () => vad.feed(silence(), RATE)),
    ];

    expect(closes.some(Boolean)).toBe(false);
    expect(vad.feed(silence(), RATE)).toBe(true);
  });

  it('starts counting the 4 s cap only once speech begins', () => {
    const vad = createEnergyVad();
    Array.from({ length: 50 }, () => vad.feed(silence(), RATE));
    const closes = Array.from({ length: 60 }, () => vad.feed(speech(), RATE));

    expect(closes.indexOf(true)).toBe(39);
  });

  it('starts fresh after closing a sentence', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);
    Array.from({ length: 5 }, () => vad.feed(silence(), RATE));

    expect(vad.feed(silence(), RATE)).toBe(false);
    expect(vad.flush()).toBe(false);
  });

  it('measures time from the sample rate', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);

    // At 48 kHz the same chunk lasts 50 ms, so ten of them are needed
    const closes = Array.from({ length: 10 }, () => vad.feed(silence(), RATE * 2));
    expect(closes.indexOf(true)).toBe(9);
  });

  it('reports a sentence as open from its first speech until it closes', () => {
    const vad = createEnergyVad();
    vad.feed(silence(), RATE);
    expect(vad.isOpen()).toBe(false);
    vad.feed(speech(), RATE);
    expect(vad.isOpen()).toBe(true);
    Array.from({ length: 4 }, () => vad.feed(silence(), RATE));
    expect(vad.isOpen()).toBe(true);
    vad.feed(silence(), RATE);
    expect(vad.isOpen()).toBe(false);
  });

  it('ignores empty chunks and invalid rates', () => {
    const vad = createEnergyVad();
    vad.feed(speech(), RATE);

    expect(vad.feed(new Int16Array(), RATE)).toBe(false);
    expect(vad.feed(silence(), 0)).toBe(false);
    expect(vad.flush()).toBe(true);
  });
});
