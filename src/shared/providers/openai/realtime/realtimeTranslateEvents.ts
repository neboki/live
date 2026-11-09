// The events of a speech translation session, and the bookkeeping of its audio: what
// waits while reconnecting and what has been billed.

import { mergePcm } from '@/shared/audio/pcm';
import type { Usage } from '../../types';
import {
  INPUT_SAMPLE_RATE,
  INTERPRETER_MODEL,
  INTERPRETER_SOURCE_MODEL,
  MAX_BUFFERED_SECONDS,
} from '../config';

export interface TranslationEvent {
  type: string;
  delta?: string;
  error?: { message?: string; code?: string; type?: string };
}

export interface AudioBacklog {
  /** Keeps a chunk; beyond the backlog size the oldest is dropped */
  hold: (pcm: Int16Array) => void;
  /** Everything held, as one chunk, or null when empty */
  take: () => Int16Array | null;
  isEmpty: () => boolean;
}

export interface UsageMeter {
  add: (samples: number) => void;
  /** Reports what was sent since the last report; `force` reports any amount */
  report: (force?: boolean) => void;
}

export const SOURCE_DELTA = 'session.input_transcript.delta';
export const TRANSLATION_DELTA = 'session.output_transcript.delta';
export const AUDIO_DELTA = 'session.output_audio.delta';
export const CLOSED = 'session.closed';
/** How long the last words may take to drain after session.close */
export const INTERPRETER_DRAIN_MS = 4000;
/** Billed audio is reported in stretches of this length, so the cost moves while it runs */
const USAGE_EVERY_SECONDS = 15;

/**
 * session.update with the language to translate into. The original transcript only
 * comes when an input transcription model is set (measured 2026-10-22).
 */
export function languageUpdate(code: string): Record<string, unknown> {
  return {
    type: 'session.update',
    session: {
      audio: {
        input: { transcription: { model: INTERPRETER_SOURCE_MODEL } },
        output: { language: code },
      },
    },
  };
}

/** `maxSeconds` of the newest audio are kept; MAX_BUFFERED_SECONDS by default */
export function createAudioBacklog(maxSeconds = MAX_BUFFERED_SECONDS): AudioBacklog {
  const maxSamples = INPUT_SAMPLE_RATE * maxSeconds;
  let chunks: Int16Array[] = [];
  let samples = 0;
  return {
    hold: (pcm) => {
      chunks.push(pcm);
      samples += pcm.length;
      while (samples > maxSamples && chunks.length > 1) {
        samples -= chunks.shift()?.length ?? 0;
      }
    },
    take: () => {
      if (!chunks.length) return null;
      const merged = mergePcm(chunks);
      chunks = [];
      samples = 0;
      return merged;
    },
    isEmpty: () => chunks.length === 0,
  };
}

/** The interpreter bills every second of audio sent, silence included. */
export function createUsageMeter(onUsage?: (usage: Usage) => void): UsageMeter {
  let unbilled = 0;
  return {
    add: (samples) => {
      unbilled += samples;
    },
    report: (force = false) => {
      const seconds = unbilled / INPUT_SAMPLE_RATE;
      if (seconds <= 0 || (!force && seconds < USAGE_EVERY_SECONDS)) return;
      unbilled = 0;
      // Both the translation and the original transcript hear every second
      for (const model of [INTERPRETER_MODEL, INTERPRETER_SOURCE_MODEL]) {
        onUsage?.({
          model,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          audioSeconds: seconds,
        });
      }
    },
  };
}
