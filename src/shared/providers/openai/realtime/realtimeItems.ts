import type { Voiceprint } from '@/shared/audio/voiceprint';
import type { FinalMeta, SttCallbacks } from '../../types';

/** One committed sentence: its text so far and, once done, its final text. */
interface ItemState {
  text: string;
  final: string | null;
  language?: string;
  voice?: Voiceprint;
  startedOn?: number;
  /** Date.now() when the server first mentioned it, to give up on it in time */
  seenOn: number;
}

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
  /**
   * Closes, with the text it has so far, every sentence open for `maxAgeMs` or longer:
   * one the server never finishes must not hold back the ones after it. Returns how many.
   */
  expire(maxAgeMs: number, now?: number): number;
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
): TranscriptItems {
  const items = new Map<string, ItemState>();
  const expired = new Set<string>();

  function item(id: string): ItemState {
    let state = items.get(id);
    if (!state) {
      state = { text: '', final: null, seenOn: Date.now() };
      items.set(id, state);
    }
    return state;
  }

  function newestOpen(): ItemState | undefined {
    return [...items.values()].filter((state) => state.final === null).at(-1);
  }

  /** A slow sentence holds back the ones after it. */
  function emitReady(): void {
    for (const [id, state] of items) {
      if (state.final === null) break;
      items.delete(id);
      if (state.final) callbacks.onFinal(state.final, metaOf(state));
    }
  }

  function committed(id: string, voice?: Voiceprint | null, startedOn?: number): void {
    if (expired.has(id)) return;
    const state = item(id);
    if (voice) state.voice = voice;
    if (startedOn !== undefined) state.startedOn = startedOn;
  }

  function delta(id: string, text: string): void {
    if (expired.has(id)) return;
    const state = item(id);
    state.text += text;
    if (newestOpen() === state) callbacks.onPartial(state.text);
  }

  function completed(id: string, transcript: string, language?: string): void {
    // Already shown with what it had: a late final would say it twice
    if (expired.delete(id)) return;
    const state = item(id);
    // Silence over background noise can close an empty sentence
    state.final = transcript.trim();
    if (language) state.language = language;
    const open = newestOpen();
    if (open) callbacks.onPartial(open.text);
    emitReady();
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

  function expire(maxAgeMs: number, now = Date.now()): number {
    let count = 0;
    for (const [id, state] of items) {
      if (state.final !== null || now - state.seenOn < maxAgeMs) continue;
      state.final = state.text.trim();
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

  return { committed, delta, completed, failed, dropOpen, hasOpen, expire };
}
