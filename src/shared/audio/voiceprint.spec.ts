import { describe, expect, it } from 'vitest';
import { createSpeakerClusters } from './speakerClusters';
import { createVoiceprintMeter, voiceDistance, type Voiceprint } from './voiceprint';

const RATE = 24_000;

/** A synthetic voice: harmonics of `pitch`, fading by `tilt` per harmonic, with a little vibrato */
function voice(pitch: number, tilt: number, ms: number, seed = 0): Int16Array {
  const samples = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(samples);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    // The phase is accumulated, so the vibrato bends the pitch without drifting it
    phase +=
      (2 * Math.PI * pitch * (1 + 0.02 * Math.sin((2 * Math.PI * 5 * i) / RATE + seed))) / RATE;
    let value = 0;
    for (let h = 1; h * pitch < 6000; h++) value += tilt ** (h - 1) * Math.sin(h * phase);
    out[i] = Math.round(value * 3000);
  }
  return out;
}

function printOf(pcm: Int16Array): Voiceprint | null {
  const meter = createVoiceprintMeter(RATE);
  // In ~100 ms chunks, as the capture delivers them
  for (let i = 0; i < pcm.length; i += 2400) meter.add(pcm.subarray(i, i + 2400));
  return meter.take();
}

const low = (ms = 1500, seed = 0): Int16Array => voice(115, 0.7, ms, seed);
const high = (ms = 1500, seed = 0): Int16Array => voice(215, 0.85, ms, seed);

describe('voiceprint', () => {
  it('finds the pitch of a voice', () => {
    expect(printOf(low())?.pitch).toBeCloseTo(115, -1);
    expect(printOf(high())?.pitch).toBeCloseTo(215, -1);
  });

  it('gives no print to silence or to a very short sound', () => {
    expect(printOf(new Int16Array(RATE))).toBeNull();
    expect(printOf(low(200))).toBeNull();
  });

  it('puts two takes of one voice closer than two different voices', () => {
    const [a, b, c] = [printOf(low(1500, 0)), printOf(low(1500, 2)), printOf(high())];
    if (!a || !b || !c) throw new Error('missing print');
    expect(voiceDistance(a, b)).toBeLessThan(voiceDistance(a, c) / 3);
  });
});

describe('createSpeakerClusters', () => {
  it('tells two voices apart and recognises them when they come back', () => {
    const clusters = createSpeakerClusters();
    const turns = [low(1500, 0), high(1500, 0), low(1500, 1), high(1500, 3), low(1500, 4)];
    expect(turns.map((pcm) => clusters.assign(printOf(pcm)))).toEqual([0, 1, 0, 1, 0]);
    // Five 1.5 s turns of DSP: slow on loaded machines and shared runners
  }, 20_000);

  it('keeps one person as one voice while their mood changes', () => {
    const clusters = createSpeakerClusters();
    // Flat, excited, a question, flat again, a little tired: the same man throughout
    const moods = [voice(115, 0.7, 1500), voice(150, 0.75, 1500), voice(160, 0.7, 1500)];
    moods.push(voice(115, 0.7, 1500, 3), voice(105, 0.68, 1500));
    expect(moods.map((pcm) => clusters.assign(printOf(pcm)))).toEqual([0, 0, 0, 0, 0]);
  }, 20_000);

  it('still tells two similar voices apart', () => {
    const clusters = createSpeakerClusters();
    // Two men, or two women: close in pitch, different in timbre
    const men = [voice(110, 0.7, 1500), voice(140, 0.85, 1500)];
    expect(men.map((pcm) => clusters.assign(printOf(pcm)))).toEqual([0, 1]);
    const women = createSpeakerClusters();
    const pair = [voice(190, 0.8, 1500), voice(230, 0.9, 1500)];
    expect(pair.map((pcm) => women.assign(printOf(pcm)))).toEqual([0, 1]);
  }, 20_000);

  it('gives a sentence without a print to whoever spoke last', () => {
    const clusters = createSpeakerClusters();
    clusters.assign(printOf(low()));
    clusters.assign(printOf(high()));
    expect(clusters.assign(null)).toBe(1);
  });

  it('does not found a new speaker on a short sentence', () => {
    const clusters = createSpeakerClusters();
    expect(clusters.assign(printOf(low()))).toBe(0);
    // 600 ms of a new voice is too little to be sure: it stays with the known one
    expect(clusters.assign(printOf(high(600)))).toBe(0);
  });

  it('says nothing until someone has spoken', () => {
    expect(createSpeakerClusters().assign(null)).toBeNull();
  });
});
