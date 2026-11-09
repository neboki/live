// The interpreter streams text with no sentence ends: these helpers decide where a
// caption line closes and which part of the original text belongs to it.

import type { InterpreterSession } from '@/shared/providers/types';
import { createRun, type Run } from './run';
import type { PipelineOptions } from './types';

/** One start() of the interpreter: what it heard and translated since the last line */
export interface Turn {
  run: Run;
  session: InterpreterSession | null;
  source: string;
  translation: string;
  /** A caption line is on screen and still growing */
  open: boolean;
  /** now() when the original text of the current line started */
  heardAt: number | null;
  /** Epoch milliseconds of the same moment, for the record */
  heardOn: number | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  /** Milliseconds of silence heard in a row */
  quietMs: number;
  /** Long silence: audio is kept here, newest last, instead of being sent (and billed) */
  holding: Int16Array[] | null;
}

export interface SourceSplit {
  /** Whole sentences heard so far: they go with the line that closes */
  done: string;
  /** The sentence still being spoken: it starts the next line */
  rest: string;
}

/** A sentence end, maybe followed by closing quotes or brackets */
const SENTENCE_END = /[.!?…。！？]["'”’»)\]]*\s*$/;
const LAST_SENTENCE_END = /^([\s\S]*[.!?…。！？]["'”’»)\]]*)(\s[\s\S]*)?$/;
/** Close the line this long after a sentence end, unless more text arrives */
export const CLOSE_AFTER_END_MS = 600;
/** Close the line after this long without new text, sentence end or not */
export const CLOSE_AFTER_IDLE_MS = 2500;
/** A line this long closes at its next sentence end right away */
export const MAX_LINE_CHARS = 240;

export function createTurn(options: PipelineOptions): Turn {
  return {
    run: createRun(options),
    session: null,
    source: '',
    translation: '',
    open: false,
    heardAt: null,
    heardOn: null,
    closeTimer: null,
    quietMs: 0,
    holding: null,
  };
}

export function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text);
}

/** Appends a delta; gpt-transcribe starts each sentence with no space after the last one. */
export function joinText(text: string, delta: string): string {
  const glued = /\S$/.test(text) && endsSentence(text) && /^[^\s.,;:!?…]/.test(delta);
  return glued ? `${text} ${delta}` : text + delta;
}

/** Splits the original text at its last sentence end. With none, nothing is done yet. */
export function splitSource(text: string): SourceSplit {
  const match = LAST_SENTENCE_END.exec(text);
  if (!match) return { done: '', rest: text.trim() };
  return { done: (match[1] ?? '').trim(), rest: (match[2] ?? '').trim() };
}

/** How long to wait before closing a line that reads `text`; 0 closes it now. */
export function closeDelay(text: string): number {
  if (!endsSentence(text)) return CLOSE_AFTER_IDLE_MS;
  return text.length >= MAX_LINE_CHARS ? 0 : CLOSE_AFTER_END_MS;
}
