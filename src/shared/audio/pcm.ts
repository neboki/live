// Pure audio helpers: no browser APIs, so they're easy to test.

/** Sample rate expected by OpenAI's Realtime API for PCM16 input. */
export const TARGET_SAMPLE_RATE = 24_000;
/** Full scale of a signed 16-bit sample, used to normalise PCM16 to -1..1 */
const PCM16_SCALE = 32768;
/** Bytes encoded per String.fromCharCode call; spreading a large buffer at once overflows the stack */
const BASE64_SLICE = 0x8000;

/**
 * Streaming linear-interpolation resampler. It keeps its position between
 * chunks so there are no clicks at chunk boundaries. Good enough for speech;
 * it doesn't low-pass filter before downsampling.
 */
export class Resampler {
  private readonly step: number;
  private position = 0;
  private lastSample = 0;

  constructor(inputRate: number, outputRate: number = TARGET_SAMPLE_RATE) {
    if (inputRate <= 0 || outputRate <= 0) throw new RangeError('Sample rates must be positive');
    this.step = inputRate / outputRate;
  }

  process(input: Float32Array): Float32Array {
    const output: number[] = [];
    let t = this.position;
    // Position -1 refers to the last sample of the previous chunk
    while (t < input.length - 1) {
      const i = Math.floor(t);
      const a = i < 0 ? this.lastSample : (input[i] ?? 0);
      const b = input[i + 1] ?? 0;
      output.push(a + (b - a) * (t - i));
      t += this.step;
    }
    this.position = t - input.length;
    this.lastSample = input[input.length - 1] ?? this.lastSample;
    return Float32Array.from(output);
  }
}

export function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  input.forEach((sample, i) => {
    const s = Math.max(-1, Math.min(1, sample));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  });
  return output;
}

/**
 * Normalised RMS (0..1) of a float signal or of PCM16 samples, which are
 * scaled to -1..1 first so both kinds of input share the same thresholds.
 */
export function rms(input: Float32Array | Int16Array): number {
  if (!input.length) return 0;
  const scale = input instanceof Int16Array ? PCM16_SCALE : 1;
  let sum = 0;
  for (const value of input) {
    const sample = value / scale;
    sum += sample * sample;
  }
  return Math.sqrt(sum / input.length);
}

/** Maps loudness to 0..1 for the UI; normal speech lands around 0.3–0.9. */
export function levelFromRms(value: number): number {
  return Math.min(1, Math.sqrt(value) * 2.2);
}

export function mergePcm(chunks: Int16Array[]): Int16Array {
  const merged = new Int16Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** Base64 for the Realtime API, encoded in slices. */
export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_SLICE));
  }
  return btoa(binary);
}

/** True when every sample is zero: the padding the interpreter streams between sentences. */
export function isSilent(pcm: Int16Array): boolean {
  return pcm.every((sample) => sample === 0);
}

/** PCM16 from the Realtime API's base64 (little-endian, as every browser runs). */
export function base64ToPcm(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length - (binary.length % 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Joins streamed bytes into whole PCM16 samples: an odd byte at the end of one read is
 * the first byte of the next sample, so it waits for the next read.
 */
export function createPcmAssembler(): (bytes: Uint8Array) => Int16Array {
  let carry: Uint8Array | null = null;
  return (bytes) => {
    let joined = bytes;
    if (carry) {
      joined = new Uint8Array(carry.length + bytes.length);
      joined.set(carry);
      joined.set(bytes, carry.length);
    }
    const even = joined.length - (joined.length % 2);
    carry = even < joined.length ? joined.slice(even) : null;
    // slice copies into a fresh buffer, so the Int16 view starts aligned at 0
    return new Int16Array(joined.slice(0, even).buffer);
  };
}
