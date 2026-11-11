// Types for the record of the current session (what was heard, translated and spent).

import type { Usage } from '@/shared/providers/types';

export type { Usage };

export interface SessionPair {
  from: string;
  to: string;
}

export interface SessionLine {
  /** Epoch milliseconds when the sentence was heard in full */
  at: number;
  /** Epoch milliseconds when the speaker began it, when known */
  from?: number;
  /** What was heard */
  source: string;
  /** Detected language of the source, when the transcriber reports it */
  language?: string;
  translation: string;
  /** Who said it (0, 1, …), when speakers are told apart */
  speaker?: number;
}

export interface SessionBegin {
  pair: SessionPair;
  startedAt: number;
  glossary?: string;
}

/** USD per 1M tokens, plus USD per minute for audio-billed models */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  audioPerMinute?: number;
  /** USD per 1M characters of text, for voices billed that way (ElevenLabs) */
  perMillionCharacters?: number;
  /** The per-minute price only applies when the API reported no tokens for the audio */
  minutesUnlessTokens?: boolean;
}

export type PriceTable = Readonly<Record<string, ModelPrice>>;

/** Everything toMarkdown needs, decoupled from the Pinia store */
export interface SessionSnapshot {
  startedAt: number | null;
  endedAt: number | null;
  pair: SessionPair;
  lines: readonly SessionLine[];
  summary: readonly string[];
  glossary: string;
  usage: readonly Usage[];
}

/** Translated labels for the exported Markdown */
export interface MarkdownLabels {
  title: string;
  date: string;
  pair: string;
  duration: string;
  cost: string;
  /** Shown instead of the figure when a model in use has no known price */
  costUnknown: string;
  transcript: string;
  summary: string;
  glossary: string;
}
