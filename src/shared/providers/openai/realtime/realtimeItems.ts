import type { Voiceprint } from '@/shared/audio/voiceprint';
import type { FinalMeta, SttCallbacks } from '../../types';
import { endsSentence, hasWords, splitPoint } from './transcriptSplit';

/** One committed sentence: its text so far and, once done, its final text. */
interface ItemState {
  text: string;
  final: string | null;
  language?: string;
  voice?: Voiceprint;
  startedOn?: number;
  /** Date.now() when the server last said something about it, to give up on it in time */
  activeOn: number;
  /** The server has its audio: only its text is missing */
  committed: boolean;
  /** Characters of `text` already sent out as early pieces */
  sent: number;
  /** Date.now() when the first word not sent out yet arrived */
  pieceOn: number | null;
}

export interface TranscriptItemsOptions {
  /**
   * The model writes while people speak: each sentence goes out as soon as its text is
   * there, without waiting for the audio to be committed.
   */
  live?: boolean;
  /** How the sentence being spoken sounds so far, for the pieces that go out early */
  voiceSoFar?: () => Voiceprint | null;
}

/** A live model writes a word about this long after it was said (measured 0.6–0.9 s) */
export const TEXT_LAG_MS = 700;
/** No more words for this long after a finished sentence: nothing is coming to wait for */
export const SENTENCE_IDLE_MS = 600;
/** No more words for this long in the middle of a sentence: the speaker has stopped */
export const WORDS_IDLE_MS = 1500;

/** Sentences of one socket, keyed by the server's item_id. */
export interface TranscriptItems {
  /** The server committed a sentence: it holds its place in the output order. */
  committed(id: string, voice?: Voiceprint | null, startedOn?: number): void;
  /** Adds an incremental delta and shows it if it is the newest open sentence. */
  delta(id: string, text: string): void;
  /** Closes a sentence and sends out every final that is now in order. */
  completed(id: string, transcript: string, language?: string): void;
  /** Forgets a sentence the server could not transcribe. */
  failed(id: string): void;
  /** The socket is gone: open sentences are lost, finished ones still go out. */
  dropOpen(): void;
  /** True while a committed sentence has not been transcribed yet */
  hasOpen(): boolean;
  /** True while words heard have not been sent out as a final yet */
  hasPending(): boolean;
  /**
   * Live models only: sends out the words still waiting once no more have come for a
   * while. Speech over music keeps the audio open long after the speaker stopped, and
   * the last sentence must not wait for it.
   */
  settle(now?: number): void;
  /**
   * Closes, with the text it has so far, every sentence quiet for `maxAgeMs` or longer:
   * one the server never finishes must not hold back the ones after it. A sentence whose
   * audio is still open (`speaking`) is not given up on. Returns how many.
   */
  expire(maxAgeMs: number, now?: number, speaking?: boolean): number;
}

/** Ids of sentences given up on, remembered so their late events are ignored */
const MAX_EXPIRED_IDS = 50;

function metaOf(state: ItemState): FinalMeta | undefined {
  const meta: FinalMeta = {
    ...(state.language ? { language: state.language } : {}),
    ...(state.voice ? { voice: state.voice } : {}),
    ...(state.startedOn === undefined ? {} : { startedOn: state.startedOn }),
  };
  return Object.keys(meta).length ? meta : undefined;
}

/** Tracks deltas and completions per item, so finals go out in commit order. */
export function createTranscriptItems(
  callbacks: Pick<SttCallbacks, 'onPartial' | 'onFinal'>,
  options: TranscriptItemsOptions = {},
): TranscriptItems {
  const items = new Map<string, ItemState>();
  const expired = new Set<string>();

  function item(id: string): ItemState {
    let state = items.get(id);
    if (!state) {
      state = {
        text: '',
        final: null,
        activeOn: Date.now(),
        committed: false,
        sent: 0,
        pieceOn: null,
      };
      items.set(id, state);
    }
    return state;
  }

  function newestOpen(): ItemState | undefined {
    return [...items.values()].filter((state) => state.final === null).at(-1);
  }

  /** The words of a sentence not sent out yet */
  function pending(state: ItemState): string {
    return state.text.slice(state.sent);
  }

  /** What the final of a sentence carries; once pieces of it went out, when the rest began */
  function finalMeta(state: ItemState): FinalMeta | undefined {
    if (state.sent === 0 || state.pieceOn === null) return metaOf(state);
    return metaOf({ ...state, startedOn: state.pieceOn - TEXT_LAG_MS });
  }

  /** A slow sentence holds back the ones after it. */
  function emitReady(): void {
    for (const [id, state] of items) {
      if (state.final === null) break;
      items.delete(id);
      if (state.final) callbacks.onFinal(state.final, finalMeta(state));
    }
  }

  /** The oldest sentence, when it is still open: the only one whose words may go out early */
  function firstOpen(): ItemState | undefined {
    const first = items.values().next().value;
    return first?.final === null ? first : undefined;
  }

  /** Sends out the first `length` characters still waiting, as a sentence of its own. */
  function sendPiece(state: ItemState, length: number): void {
    const piece = pending(state).slice(0, length).trim();
    // Once its audio is closed the sentence has its own print; until then, the voice so far
    const voice = state.committed ? state.voice : options.voiceSoFar?.();
    const startedOn = (state.pieceOn ?? Date.now()) - TEXT_LAG_MS;
    state.sent += length;
    // What is left began now: its first word has just arrived (or will)
    state.pieceOn = pending(state).trim() ? Date.now() : null;
    // The full stop of a sentence that already went out is not a sentence of its own
    if (hasWords(piece)) callbacks.onFinal(piece, { ...(voice ? { voice } : {}), startedOn });
  }

  /** Sends out every sentence the oldest open one already holds in full. */
  function sendFinished(): void {
    if (!options.live) return;
    const state = firstOpen();
    if (!state) return;
    for (let cut = splitPoint(pending(state)); cut > 0; cut = splitPoint(pending(state))) {
      sendPiece(state, cut);
    }
    // Its audio is closed, so after a sentence end nothing follows but the next one:
    // no need to wait for the server to close the sentence too (about 0.3 s later)
    const waiting = pending(state);
    if (state.committed && endsSentence(waiting)) sendPiece(state, waiting.length);
  }

  function showPartial(): void {
    const open = newestOpen();
    if (open) callbacks.onPartial(pending(open).trim());
  }

  function committed(id: string, voice?: Voiceprint | null, startedOn?: number): void {
    if (expired.has(id)) return;
    const state = item(id);
    state.committed = true;
    state.activeOn = Date.now();
    if (voice) state.voice = voice;
    if (startedOn !== undefined) state.startedOn = startedOn;
  }

  function delta(id: string, text: string): void {
    if (expired.has(id)) return;
    const state = item(id);
    state.text += text;
    state.activeOn = Date.now();
    if (state.pieceOn === null && pending(state).trim()) state.pieceOn = state.activeOn;
    sendFinished();
    if (newestOpen() === state) showPartial();
  }

  /**
   * What the closing transcript adds to the pieces already sent out. It normally starts
   * with them; when the server reworded it, the words streamed since are what is left,
   * so nothing is said twice.
   */
  function restOf(state: ItemState, transcript: string): string {
    if (state.sent === 0) return transcript;
    const head = state.text.slice(0, state.sent).trim();
    const rest = transcript.startsWith(head) ? transcript.slice(head.length) : pending(state);
    return hasWords(rest) ? rest : '';
  }

  function completed(id: string, transcript: string, language?: string): void {
    // Already shown with what it had: a late final would say it twice
    if (expired.delete(id)) return;
    const state = item(id);
    // Silence over background noise can close an empty sentence
    state.final = restOf(state, transcript.trim()).trim();
    if (language) state.language = language;
    emitReady();
    // The sentence after it may have whole sentences waiting for their turn
    sendFinished();
    showPartial();
  }

  function failed(id: string): void {
    expired.delete(id);
    items.delete(id);
    emitReady();
  }

  function dropOpen(): void {
    for (const state of items.values()) if (state.final === null) state.final = '';
    emitReady();
    items.clear();
    expired.clear();
  }

  function hasOpen(): boolean {
    return [...items.values()].some((state) => state.final === null);
  }

  function hasPending(): boolean {
    return [...items.values()].some((state) => state.final === null && pending(state).trim());
  }

  function settle(now = Date.now()): void {
    if (!options.live) return;
    const state = firstOpen();
    if (!state) return;
    const waiting = pending(state);
    if (!hasWords(waiting)) return;
    const idleMs = now - state.activeOn;
    if (idleMs >= (endsSentence(waiting) ? SENTENCE_IDLE_MS : WORDS_IDLE_MS)) {
      sendPiece(state, waiting.length);
      showPartial();
    }
  }

  function expire(maxAgeMs: number, now = Date.now(), speaking = false): number {
    let count = 0;
    for (const [id, state] of items) {
      if (state.final !== null || now - state.activeOn < maxAgeMs) continue;
      // Its audio is still going in: quiet for now (music, a long pause), not lost
      if (speaking && !state.committed) continue;
      state.final = pending(state).trim();
      expired.add(id);
      count++;
    }
    while (expired.size > MAX_EXPIRED_IDS) {
      const oldest = expired.values().next().value;
      if (oldest === undefined) break;
      expired.delete(oldest);
    }
    if (count) emitReady();
    return count;
  }

  return { committed, delta, completed, failed, dropOpen, hasOpen, hasPending, settle, expire };
}
