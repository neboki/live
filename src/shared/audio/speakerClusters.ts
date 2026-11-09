// Groups sentences by voice as they come: each new voiceprint joins the closest
// known speaker, or starts a new one when it is clearly different from all of them.
// Online and on the device, so it adds no delay and no cost.

import { BAND_COUNT, type Voiceprint, voiceDistance } from './voiceprint';

export interface SpeakerClusters {
  /** Speaker index (0, 1, …) for a sentence, or null when it can't be told */
  assign: (print: Voiceprint | null) => number | null;
}

interface Speaker {
  print: Voiceprint;
  count: number;
}

/**
 * Closer than this to a known speaker: the same person. One voice drifts up to ~3.5 between
 * a flat sentence and an excited or questioning one, while two different voices sit at 4.3+
 * (see the spec): a tighter value split a lone YouTube speaker into two alternating voices.
 */
const SAME_SPEAKER = 3;
/** The person who spoke last keeps the turn a little longer than a stranger would get it */
const LAST_SPEAKER_BONUS = 1.3;
/** Too short to found a new speaker: it can only join a known one */
const MIN_NEW_SPEAKER_MS = 900;
const MAX_SPEAKERS = 6;
/** A speaker's print keeps learning, but never weighs a new sentence less than this */
const MIN_LEARNING_RATE = 0.15;

function blend(speaker: Speaker, print: Voiceprint): void {
  const rate = Math.max(1 / (speaker.count + 1), MIN_LEARNING_RATE);
  const bands = new Float32Array(BAND_COUNT);
  for (let i = 0; i < BAND_COUNT; i++) {
    bands[i] = (speaker.print.bands[i] ?? 0) * (1 - rate) + (print.bands[i] ?? 0) * rate;
  }
  const { pitch: old } = speaker.print;
  const pitch = old && print.pitch ? old * (1 - rate) + print.pitch * rate : (old ?? print.pitch);
  speaker.print = { pitch, bands, speechMs: speaker.print.speechMs + print.speechMs };
  speaker.count++;
}

export function createSpeakerClusters(): SpeakerClusters {
  const speakers: Speaker[] = [];
  let last: number | null = null;

  function assign(print: Voiceprint | null): number | null {
    // No print (too short, or nothing voiced): most likely whoever was talking
    if (!print) return last;
    let closest: number | null = null;
    let best = Infinity;
    speakers.forEach((speaker, index) => {
      const distance =
        voiceDistance(speaker.print, print) / (index === last ? LAST_SPEAKER_BONUS : 1);
      if (distance < best) {
        best = distance;
        closest = index;
      }
    });
    const canFound = print.speechMs >= MIN_NEW_SPEAKER_MS && speakers.length < MAX_SPEAKERS;
    if (closest !== null && (best < SAME_SPEAKER || !canFound)) {
      blend(speakers[closest] as Speaker, print);
      last = closest;
      return closest;
    }
    if (!canFound) return last;
    speakers.push({ print, count: 1 });
    last = speakers.length - 1;
    return last;
  }

  return { assign };
}
