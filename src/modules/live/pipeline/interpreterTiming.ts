// When the words of an interpreter line were spoken, for the picture played behind time.
//
// The interpreter's text arrives a second or more after the words: dating a line by
// its arrival puts its caption that late on the delayed picture. Instead, the audio
// sent tells when speech starts after a pause, and the first text after such a start
// both dates its line and measures how late the text runs. Text with no start of its
// own (speech that never paused) is dated back by that measured lateness.

/** Silence this long, then speech, is a start of speech */
export const ONSET_GAP_MS = 300;
/** Lateness of the text assumed until one is measured */
export const DEFAULT_TEXT_LAG_MS = 1500;
/** Text closer than this to a start is still about the speech before it */
export const MIN_TEXT_LAG_MS = 300;
/** Text further than this from a start is not taken as about it */
export const MAX_TEXT_LAG_MS = 6000;
/** Weight of each new measure in the running lateness */
const LAG_WEIGHT = 0.3;

export interface SpeechTiming {
  /** Epoch milliseconds when speech last started and no text has come for it yet */
  onset: number | null;
  /** Milliseconds of silence heard in a row, up to the latest chunk */
  quietMs: number;
  /** How late the text runs behind the words, in milliseconds */
  lagMs: number;
}

export function createSpeechTiming(): SpeechTiming {
  return { onset: null, quietMs: ONSET_GAP_MS, lagMs: DEFAULT_TEXT_LAG_MS };
}

/** A chunk of `chunkMs` captured just now, loud enough or not to be speech */
export function hearChunk(
  timing: SpeechTiming,
  speaking: boolean,
  chunkMs: number,
  on = Date.now(),
): void {
  if (speaking && timing.quietMs >= ONSET_GAP_MS) timing.onset = on - chunkMs;
  timing.quietMs = speaking ? 0 : timing.quietMs + chunkMs;
}

/**
 * Text arrived at `on`: when its words were spoken. The first text a while after a start
 * of speech belongs to it, and says how late the text runs; any other is dated back by that.
 */
export function spokenOn(timing: SpeechTiming, on = Date.now()): number {
  const { onset } = timing;
  if (onset !== null) {
    const lag = on - onset;
    if (lag >= MIN_TEXT_LAG_MS && lag <= MAX_TEXT_LAG_MS) {
      timing.onset = null;
      timing.lagMs += (lag - timing.lagMs) * LAG_WEIGHT;
      return onset;
    }
    if (lag > MAX_TEXT_LAG_MS) timing.onset = null;
  }
  return on - timing.lagMs;
}
