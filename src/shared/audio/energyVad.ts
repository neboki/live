// Energy-based end-of-sentence detector.
//
// It exists because the live transcription model (the one that streams partial
// text while people speak) doesn't accept server-side VAD, so sentences are
// closed here. Measured values:
// - 500 ms of silence closes a short sentence. 400 ms gained nothing measurable and
//   cut sentences at natural 100–250 ms pauses.
// - The longer a sentence runs, the shorter the pause that closes it: past 1.5 s a
//   300 ms pause is enough, past 2.5 s a 180 ms breath between phrases. Waiting for a
//   real full stop made people talking non-stop (videos, streams) show nothing for
//   up to 8 s and then a whole block at once; a phrase-sized piece now reaches the
//   translator every few seconds, and the previous lines give it the context.
// - 4 s caps a sentence, so even speech without any breath (or over music, which never
//   goes quiet) still gets translated. With 6 s and 3.5 s, captions of a video came
//   five to eight seconds after the words: too late to follow (2026-11-11).

import { rms } from './pcm';

export interface EnergyVad {
  /** Feeds a chunk (sent BEFORE asking) and says whether it closes the sentence. */
  feed: (pcm: Int16Array, rate: number) => boolean;
  /** Forced close when stopping: true if a sentence was still open. */
  flush: () => boolean;
  /** True while a sentence has speech and has not been closed yet. */
  isOpen: () => boolean;
}

/** Normalised RMS below which a chunk counts as silence (laptop mic noise is ~0.002–0.005). */
const SPEECH_RMS = 0.01;
/** Pause that closes a sentence, by how long the sentence has run so far (ms) */
const SILENCE_STEPS: readonly { after: number; silence: number }[] = [
  { after: 2500, silence: 180 },
  { after: 1500, silence: 300 },
  { after: 0, silence: 500 },
];
const MAX_UTTERANCE_MS = 4000;

function silenceToClose(utteranceMs: number): number {
  return SILENCE_STEPS.find((step) => utteranceMs >= step.after)?.silence ?? 500;
}

export function createEnergyVad(): EnergyVad {
  let silentMs = 0;
  let utteranceMs = 0;
  let hadSpeech = false;

  function reset(): void {
    hadSpeech = false;
    silentMs = 0;
    utteranceMs = 0;
  }

  function feed(pcm: Int16Array, rate: number): boolean {
    if (!pcm.length || rate <= 0) return false;
    const durationMs = (pcm.length / rate) * 1000;
    utteranceMs += durationMs;
    if (rms(pcm) >= SPEECH_RMS) {
      silentMs = 0;
      hadSpeech = true;
    } else {
      silentMs += durationMs;
    }

    // Committing an empty buffer is an API error, so never close without speech
    if (!hadSpeech) {
      utteranceMs = 0;
      return false;
    }
    if (silentMs >= silenceToClose(utteranceMs) || utteranceMs >= MAX_UTTERANCE_MS) {
      reset();
      return true;
    }
    return false;
  }

  function flush(): boolean {
    const open = hadSpeech;
    reset();
    return open;
  }
  function isOpen(): boolean {
    return hadSpeech;
  }

  return { feed, flush, isOpen };
}
