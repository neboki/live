// Runs on the audio thread. Mixes the shared audio down to mono and posts it
// to the page in ~100 ms chunks; resampling happens on the main thread.

// AudioWorkletGlobalScope isn't part of lib.dom
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

const CHUNK_SECONDS = 0.1;
const RENDER_QUANTUM = 128;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  // Kept apart: once posted, the buffer is transferred and its length reads 0
  private readonly chunkLength = Math.round(sampleRate * CHUNK_SECONDS);
  private buffer = new Float32Array(this.chunkLength);
  private filled = 0;

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0] ?? [];
    // An inactive source delivers no channels: count it as silence, so the
    // sentence still closes and the level drops instead of freezing
    const frames = channels[0]?.length ?? RENDER_QUANTUM;

    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i] ?? 0;
      this.buffer[this.filled++] = channels.length ? sum / channels.length : 0;

      if (this.filled === this.chunkLength) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(this.chunkLength);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);

export {};
