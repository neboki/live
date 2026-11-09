import type { Usage } from '../../types';
import {
  DELAY_FAMILY,
  MAX_TOPIC_CHARS,
  PROMPT_GLOSSARY_FAMILY,
  TRANSCRIPTION_DELAY,
} from '../config';

export interface RealtimeUsage {
  type?: string;
  input_tokens?: number;
  output_tokens?: number;
  seconds?: number;
}

/** The server events of a transcription session that we read. */
export interface RealtimeEvent {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  language?: string;
  /** gpt-transcribe: languages detected in the sentence, most likely first */
  languages?: unknown;
  usage?: RealtimeUsage;
  error?: { message?: string; code?: string; type?: string };
}

/** What the transcriber is told about the meeting */
export interface TranscriptionHints {
  keywords: string[];
  /** ISO 639-1 codes; empty: any language */
  languages: string[];
  topic: string;
}

export const DELTA = 'conversation.item.input_audio_transcription.delta';
export const COMPLETED = 'conversation.item.input_audio_transcription.completed';
export const FAILED = 'conversation.item.input_audio_transcription.failed';
export const COMMITTED = 'input_audio_buffer.committed';
/** Errors about one sentence: worth a log line, not worth stopping the session */
const RECOVERABLE_CODES = new Set(['input_audio_buffer_commit_empty']);
const RECOVERABLE_MESSAGE = /buffer too small/i;
/** Characters a keyword may not carry (the API rejects the whole session) */
const KEYWORD_FORBIDDEN = /[<>\r\n]/g;
const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z]{2})?$/;

/** True for errors about a single sentence, which the session survives. */
export function isRecoverable(event: RealtimeEvent): boolean {
  const code = event.error?.code ?? '';
  return RECOVERABLE_CODES.has(code) || RECOVERABLE_MESSAGE.test(event.error?.message ?? '');
}

/** Keywords the API accepts: one line each, without angle brackets. */
function cleanKeywords(keywords: string[]): string[] {
  return keywords.map((word) => word.replace(KEYWORD_FORBIDDEN, ' ').trim()).filter(Boolean);
}

/**
 * The transcription settings for each model family: gpt-4o models take the glossary
 * and the topic in one text prompt, newer ones take keywords, languages and a delay.
 */
function transcriptionFor(model: string, hints: TranscriptionHints): Record<string, unknown> {
  const topic = hints.topic.trim().slice(0, MAX_TOPIC_CHARS);
  const keywords = cleanKeywords(hints.keywords);
  if (PROMPT_GLOSSARY_FAMILY.test(model)) {
    const glossary = keywords.length ? `Glossary: ${keywords.join(', ')}` : '';
    const prompt = [topic, glossary].filter(Boolean).join('. ');
    return { model, ...(prompt ? { prompt } : {}) };
  }
  const languages = hints.languages
    .map((code) => code.toLowerCase())
    .filter((code) => LANGUAGE_CODE.test(code));
  return {
    model,
    ...(keywords.length ? { keywords } : {}),
    ...(topic ? { prompt: topic } : {}),
    ...(languages.length ? { languages } : {}),
    ...(DELAY_FAMILY.test(model) ? { delay: TRANSCRIPTION_DELAY } : {}),
  };
}

/** session.update for a transcription session with client-side VAD (no turn detection). */
export function sessionUpdate(
  model: string,
  rate: number,
  hints: TranscriptionHints,
): Record<string, unknown> {
  const transcription = transcriptionFor(model, hints);
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: { format: { type: 'audio/pcm', rate }, transcription, turn_detection: null },
      },
    },
  };
}

/** The language of a finished sentence: gpt-transcribe lists them, older models name one. */
export function languageOf(event: RealtimeEvent): string | undefined {
  if (Array.isArray(event.languages)) {
    const first: unknown = event.languages[0];
    if (typeof first === 'string' && first) return first;
    if (typeof first === 'object' && first !== null && 'language' in first) {
      const code: unknown = first.language;
      if (typeof code === 'string' && code) return code;
    }
  }
  return typeof event.language === 'string' && event.language ? event.language : undefined;
}

/**
 * Billing for one sentence: the tokens when the server reports them, and always the audio
 * duration (the server's, or else the seconds of audio sent since the last report), since
 * some models are priced per minute whatever the server counts. The price table decides
 * which of the two applies.
 */
export function toUsage(
  model: string,
  usage: RealtimeUsage | undefined,
  unbilledSeconds: number,
): Usage {
  const report: Usage = {
    model,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    audioSeconds: usage?.seconds ?? unbilledSeconds,
  };
  if (usage?.type === 'tokens' || typeof usage?.input_tokens === 'number') {
    report.inputTokens = usage.input_tokens ?? 0;
    report.outputTokens = usage.output_tokens ?? 0;
  }
  return report;
}
