import { describe, expect, it } from 'vitest';
import { mergePcm } from './pcm';
import { PRE_ROLL_MS, type GateStep, createSilenceGate } from './silenceGate';

const RATE = 24_000;
const CHUNK = RATE / 10; // 100 ms

/** A chunk whose every sample is `tag`, so the order of what goes out can be read back. */
const tagged = (tag: number, length = CHUNK): Int16Array => new Int16Array(length).fill(tag);
/** Below the 0.01 RMS threshold (≈ 327), so silence for the VAD */
const quiet = (tag: number, length = CHUNK): Int16Array => tagged(tag, length);
const speech = (tag = 3000, length = CHUNK): Int16Array => tagged(tag, length);

const sent = (step: GateStep): Int16Array => mergePcm(step.audio);
const samples = (steps: GateStep[]): number =>
  steps.reduce((sum, step) => sum + sent(step).length, 0);

describe('createSilenceGate', () => {
  it('sends nothing while nobody speaks, however long the silence', () => {
    const gate = createSilenceGate(RATE);
    const steps = Array.from({ length: 600 }, () => gate.push(quiet(0)));

    expect(samples(steps)).toBe(0);
    expect(steps.some((step) => step.commit)).toBe(false);
    expect(gate.isIdle()).toBe(true);
  });

  it('sends the pre-roll first, oldest first, then the speech chunk', () => {
    const gate = createSilenceGate(RATE);
    for (const tag of [1, 2, 3, 4, 5]) gate.push(quiet(tag));
    const step = gate.push(speech());

    // Only the newest 300 ms (chunks 3, 4, 5) are kept
    expect(step.audio.map((pcm) => pcm[0])).toEqual([3, 4, 5, 3000]);
    expect(sent(step)).toHaveLength(CHUNK * 4);
    expect(step.commit).toBe(false);
    expect(gate.isIdle()).toBe(false);
  });

  it('cuts the oldest held chunk so the pre-roll is exactly 300 ms', () => {
    const gate = createSilenceGate(RATE);
    gate.push(quiet(1, CHUNK * 2));
    gate.push(quiet(2, CHUNK * 2));
    const audio = sent(gate.push(speech()));

    expect(audio).toHaveLength(CHUNK * 4);
    // 100 ms left of chunk 1, all 200 ms of chunk 2, then the speech
    expect([audio[0], audio[CHUNK - 1], audio[CHUNK], audio[CHUNK * 3]]).toEqual([1, 1, 2, 3000]);
  });

  it('sends speech right away with no pre-roll when nothing was held', () => {
    const gate = createSilenceGate(RATE);

    expect(gate.push(speech()).audio).toHaveLength(1);
  });

  it('keeps sending the sentence tail and commits on the closing chunk', () => {
    const gate = createSilenceGate(RATE);
    gate.push(speech());
    const tail = Array.from({ length: 5 }, (_, i) => gate.push(quiet(i + 1)));

    expect(tail.map((step) => step.audio.length)).toEqual([1, 1, 1, 1, 1]);
    expect(tail.map((step) => step.commit)).toEqual([false, false, false, false, true]);
    expect(gate.isIdle()).toBe(true);
  });

  it('holds silence again after the commit', () => {
    const gate = createSilenceGate(RATE);
    gate.push(speech());
    for (let i = 0; i < 5; i++) gate.push(quiet(0));
    const after = Array.from({ length: 50 }, () => gate.push(quiet(0)));

    expect(samples(after)).toBe(0);
  });

  it('opens a new sentence with its pre-roll after a long silence', () => {
    const gate = createSilenceGate(RATE);
    gate.push(speech(3000));
    for (let i = 0; i < 5; i++) gate.push(quiet(0));
    for (let i = 0; i < 300; i++) gate.push(quiet(i % 300));
    const step = gate.push(speech(4000));

    expect(step.audio.map((pcm) => pcm[0])).toEqual([297, 298, 299, 4000]);
    expect(step.commit).toBe(false);
  });

  it('closes a monologue at 4 s and sends the speech that follows without a gap', () => {
    const gate = createSilenceGate(RATE);
    const steps = Array.from({ length: 41 }, () => gate.push(speech()));

    expect(steps.findIndex((step) => step.commit)).toBe(39);
    expect(steps.every((step) => step.audio.length === 1)).toBe(true);
    expect(gate.isIdle()).toBe(false);
  });

  it('holds silence that follows a monologue closed at 4 s', () => {
    const gate = createSilenceGate(RATE);
    for (let i = 0; i < 40; i++) gate.push(speech());

    expect(gate.push(quiet(0)).audio).toEqual([]);
  });

  it('flush reports an open sentence and drops the held pre-roll', () => {
    const gate = createSilenceGate(RATE);
    gate.push(quiet(7));
    expect(gate.flush()).toBe(false);
    // The dropped pre-roll does not come back with the next speech
    expect(gate.push(speech()).audio).toHaveLength(1);
    expect(gate.flush()).toBe(true);
    expect(gate.isIdle()).toBe(true);
  });

  it('ignores empty chunks', () => {
    const gate = createSilenceGate(RATE);

    expect(gate.push(new Int16Array(0))).toEqual({ audio: [], commit: false });
  });

  it.each([
    [16_000, PRE_ROLL_MS, 4800],
    [24_000, PRE_ROLL_MS, 7200],
    [48_000, PRE_ROLL_MS, 14_400],
    [24_000, 150, 3600],
    [24_000, 0, 0],
  ])('at %i Hz keeps %i ms of pre-roll as %i samples', (rate, preRollMs, expected) => {
    const gate = createSilenceGate(rate, { preRollMs });
    for (let i = 0; i < 10; i++) gate.push(quiet(1, rate / 10));
    const audio = sent(gate.push(speech(3000, rate / 10)));

    expect(audio.length - rate / 10).toBe(expected);
  });
});
