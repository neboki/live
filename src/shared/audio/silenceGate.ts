// Keeps silence off the wire, so it is neither sent nor billed.
//
// While no sentence is open, silent chunks are held in a short rolling pre-roll
// instead of being sent. When speech starts, the pre-roll goes out first, so the
// first syllable (often quieter than the speech threshold) is not clipped. While
// a sentence is open everything is sent, the trailing silence included, until the
// VAD closes it; then the gate holds silence again. Billed audio is therefore about
// the speech time plus a short pre-roll and the 500 ms tail of each sentence.

import { type EnergyVad, createEnergyVad } from './energyVad';

export interface GateStep {
  /** Audio to send now, in order (pre-roll first); empty while the gate holds silence */
  audio: Int16Array[];
  /** True when this chunk closes the sentence: commit after sending `audio` */
  commit: boolean;
}

export interface SilenceGateOptions {
  /** Silence kept before speech starts */
  preRollMs?: number;
  /** Sentence detector; a fresh energy VAD by default */
  vad?: EnergyVad;
}

export interface SilenceGate {
  /** Feeds one captured chunk and says what to send and whether to commit. */
  push: (pcm: Int16Array) => GateStep;
  /** Stop: drops the held pre-roll and says whether a sentence was still open. */
  flush: () => boolean;
  /** True while no sentence is open, i.e. silence is being held back */
  isIdle: () => boolean;
}

export const PRE_ROLL_MS = 300;

export function createSilenceGate(rate: number, options: SilenceGateOptions = {}): SilenceGate {
  const vad = options.vad ?? createEnergyVad();
  const maxPreRoll = Math.max(0, Math.round((rate * (options.preRollMs ?? PRE_ROLL_MS)) / 1000));
  let preRoll: Int16Array[] = [];
  let preRollSamples = 0;

  function hold(pcm: Int16Array): void {
    preRoll.push(pcm);
    preRollSamples += pcm.length;
    // Keep only the newest samples; the oldest chunk may be cut to fit exactly
    while (preRollSamples > maxPreRoll) {
      const oldest = preRoll[0];
      if (!oldest) break;
      const excess = preRollSamples - maxPreRoll;
      if (excess >= oldest.length) {
        preRoll.shift();
        preRollSamples -= oldest.length;
      } else {
        preRoll[0] = oldest.subarray(excess);
        preRollSamples -= excess;
      }
    }
  }

  function release(pcm: Int16Array): Int16Array[] {
    const audio = [...preRoll, pcm];
    preRoll = [];
    preRollSamples = 0;
    return audio;
  }

  function push(pcm: Int16Array): GateStep {
    if (!pcm.length) return { audio: [], commit: false };
    const commit = vad.feed(pcm, rate);
    // A closing chunk belongs to the sentence (its tail); an idle silent one is held
    if (commit || vad.isOpen()) return { audio: release(pcm), commit };
    hold(pcm);
    return { audio: [], commit: false };
  }

  function flush(): boolean {
    preRoll = [];
    preRollSamples = 0;
    return vad.flush();
  }

  function isIdle(): boolean {
    return !vad.isOpen();
  }

  return { push, flush, isIdle };
}
