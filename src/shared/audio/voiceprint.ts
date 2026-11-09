// A rough "voiceprint" of one sentence, computed on the device: the speaker's pitch
// and the shape of their voice's spectrum (timbre). Two sentences with close prints
// were probably said by the same person. It is deliberately simple: good enough to
// tell apart two or three clearly different voices in a video or a call, not a
// biometric. It never leaves the browser and is forgotten with the session.

export interface Voiceprint {
  /** Median pitch of the voiced frames, in Hz; null when none was clearly voiced */
  pitch: number | null;
  /** Mean log energy per band, with the overall loudness removed */
  bands: Float32Array;
  /** Speech analysed, in ms: short prints are less reliable */
  speechMs: number;
}

export interface VoiceprintMeter {
  /** Adds audio of the open sentence */
  add: (pcm: Int16Array) => void;
  /** The print of everything added since the last take, or null with too little speech */
  take: () => Voiceprint | null;
  reset: () => void;
}

const FRAME = 1024;
export const BAND_COUNT = 16;
/** Normalised RMS below which a frame is not analysed (same threshold as the VAD) */
const SPEECH_RMS = 0.01;
/** Below this much speech a sentence gets no print */
const MIN_SPEECH_MS = 400;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
/** Normalised autocorrelation a frame needs to count as voiced */
const VOICED_CORRELATION = 0.45;
/** A lag within this share of the best score counts as a candidate period */
const NEAR_BEST = 0.9;
const MIN_BAND_HZ = 100;
const MAX_BAND_HZ = 7000;
/** Half an octave apart weighs as much as a clear change of timbre */
const PITCH_WEIGHT = 2.5;

/** In-place radix-2 FFT of a real frame; returns the power of the first half. */
function powerSpectrum(frame: Float32Array): Float32Array {
  const n = frame.length;
  const re = Float32Array.from(frame);
  const im = new Float32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const a = start + k;
        const b = a + size / 2;
        const cos = Math.cos(step * k);
        const sin = Math.sin(step * k);
        const tr = (re[b] ?? 0) * cos - (im[b] ?? 0) * sin;
        const ti = (re[b] ?? 0) * sin + (im[b] ?? 0) * cos;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
      }
    }
  }
  const power = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) power[i] = (re[i] ?? 0) ** 2 + (im[i] ?? 0) ** 2;
  return power;
}

/** Band edges spaced on the mel scale, as FFT bin indexes */
function bandEdges(rate: number): number[] {
  const mel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
  const hz = (m: number): number => 700 * (10 ** (m / 2595) - 1);
  const low = mel(MIN_BAND_HZ);
  const high = mel(MAX_BAND_HZ);
  return Array.from({ length: BAND_COUNT + 1 }, (_, i) =>
    Math.round((hz(low + ((high - low) * i) / BAND_COUNT) * FRAME) / rate),
  );
}

/**
 * Pitch of a frame by normalised cross-correlation (each lag is scored against the
 * energy of the samples it actually overlaps, so long lags are not penalised), or
 * null when the frame is not voiced. Of the lags scoring near the best, the shortest
 * wins: a multiple of the period also correlates and would read an octave too low.
 */
function framePitch(frame: Float32Array, rate: number): number | null {
  const minLag = Math.floor(rate / MAX_PITCH_HZ);
  const maxLag = Math.ceil(rate / MIN_PITCH_HZ);
  const squares = new Float64Array(frame.length + 1);
  for (let i = 0; i < frame.length; i++) squares[i + 1] = (squares[i] ?? 0) + (frame[i] ?? 0) ** 2;
  const scores: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const span = frame.length - lag;
    let sum = 0;
    for (let i = 0; i < span; i++) sum += (frame[i] ?? 0) * (frame[i + lag] ?? 0);
    const head = squares[span] ?? 0;
    const tail = (squares[frame.length] ?? 0) - (squares[lag] ?? 0);
    scores.push(head > 0 && tail > 0 ? sum / Math.sqrt(head * tail) : 0);
  }
  const best = Math.max(...scores);
  if (best < VOICED_CORRELATION) return null;
  const index = scores.findIndex(
    (score, i) =>
      score >= best * NEAR_BEST && score >= (scores[i - 1] ?? 0) && score >= (scores[i + 1] ?? 0),
  );
  return index < 0 ? null : rate / (minLag + index);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** How different two prints are: timbre (log energy) plus pitch (octaves, weighted). */
export function voiceDistance(a: Voiceprint, b: Voiceprint): number {
  let sum = 0;
  for (let i = 0; i < BAND_COUNT; i++) sum += ((a.bands[i] ?? 0) - (b.bands[i] ?? 0)) ** 2;
  const timbre = Math.sqrt(sum / BAND_COUNT);
  const pitch = a.pitch && b.pitch ? Math.abs(Math.log2(a.pitch / b.pitch)) : 0;
  return timbre + PITCH_WEIGHT * pitch;
}

export function createVoiceprintMeter(rate: number): VoiceprintMeter {
  const edges = bandEdges(rate);
  const hann = Float32Array.from(
    { length: FRAME },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)),
  );
  let buffer = new Float32Array(0);
  let bandSums = new Float64Array(BAND_COUNT);
  let frames = 0;
  let pitches: number[] = [];

  function analyse(frame: Float32Array): void {
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    if (Math.sqrt(energy / frame.length) < SPEECH_RMS) return;
    const pitch = framePitch(frame, rate);
    if (pitch) pitches.push(pitch);
    const power = powerSpectrum(frame.map((sample, i) => sample * (hann[i] ?? 0)));
    for (let band = 0; band < BAND_COUNT; band++) {
      let sum = 1e-9;
      for (let bin = edges[band] ?? 0; bin < (edges[band + 1] ?? 0); bin++) sum += power[bin] ?? 0;
      bandSums[band] = (bandSums[band] ?? 0) + Math.log(sum);
    }
    frames++;
  }

  function add(pcm: Int16Array): void {
    const next = new Float32Array(buffer.length + pcm.length);
    next.set(buffer);
    for (let i = 0; i < pcm.length; i++) next[buffer.length + i] = (pcm[i] ?? 0) / 32768;
    let offset = 0;
    for (; offset + FRAME <= next.length; offset += FRAME) {
      analyse(next.subarray(offset, offset + FRAME));
    }
    buffer = next.slice(offset);
  }

  function reset(): void {
    buffer = new Float32Array(0);
    bandSums = new Float64Array(BAND_COUNT);
    frames = 0;
    pitches = [];
  }

  function take(): Voiceprint | null {
    const speechMs = (frames * FRAME * 1000) / rate;
    if (speechMs < MIN_SPEECH_MS) {
      reset();
      return null;
    }
    const means = Array.from(bandSums, (sum) => sum / frames);
    const loudness = means.reduce((total, value) => total + value, 0) / BAND_COUNT;
    const print: Voiceprint = {
      pitch: median(pitches),
      bands: Float32Array.from(means, (value) => value - loudness),
      speechMs,
    };
    reset();
    return print;
  }

  return { add, take, reset };
}
