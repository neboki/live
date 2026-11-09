// Provider-agnostic contracts. The UI and the live pipeline only know these;
// adding another vendor means writing new implementations, not touching callers.

import type { Voiceprint } from '@/shared/audio/voiceprint';
import type { AppError } from '@/shared/errors';

/** What one call (or a stretch of transcription) consumed, for the cost estimate. */
export interface Usage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  /** Transcription billed by duration instead of tokens */
  audioSeconds?: number;
}

export type SttStatus = 'connected' | 'reconnecting';

/** What the transcriber is busy with: someone speaking, a sentence being written, or nothing */
export type SttActivity = 'speech' | 'transcribing' | 'idle';

export interface FinalMeta {
  /** Language code detected by the transcriber, when it reports one */
  language?: string;
  /** How the sentence sounded, to tell speakers apart; absent when too short */
  voice?: Voiceprint;
  /** Epoch milliseconds when the sentence began, as the silence gate heard it */
  startedOn?: number;
}

export interface SttOptions {
  apiKey: string;
  /** Azure OpenAI resource URL; absent means OpenAI itself */
  endpoint?: string;
  /** Names and terms the transcriber should spell right */
  keywords: string[];
  /** ISO 639-1 codes of the languages expected in the meeting; empty: any */
  languages?: string[];
  /** What the meeting is about, in a few words, to help with context */
  topic?: string;
  /** Overrides the default transcription model */
  model?: string;
}

export interface SttCallbacks {
  /** The sentence being spoken, rewritten as it grows */
  onPartial: (text: string) => void;
  /** A finished sentence */
  onFinal: (text: string, meta?: FinalMeta) => void;
  /** The session can't continue, or something the user should know about */
  onError: (error: AppError) => void;
  /** The connection dropped and is being reopened, or is back */
  onStatus?: (status: SttStatus) => void;
  /** Changes of activity, so the captions can show that something is on its way */
  onActivity?: (activity: SttActivity) => void;
  onUsage?: (usage: Usage) => void;
}

export interface SttSession {
  /** PCM16 mono at 24 kHz */
  append: (pcm: Int16Array) => void;
  close: () => void;
}

export interface SttProvider {
  connect: (options: SttOptions, callbacks: SttCallbacks) => Promise<SttSession>;
}

export interface InterpreterOptions {
  apiKey: string;
  /** Azure OpenAI resource URL; absent means OpenAI itself */
  endpoint?: string;
  /** ISO 639-1 code of the language to translate into */
  language: string;
}

/** A speech translation session: text and voice come as streams, with no sentence ends. */
export interface InterpreterCallbacks {
  /** More of what is being said, in the original language */
  onSource: (delta: string) => void;
  /** More of the translation */
  onTranslation: (delta: string) => void;
  /** Translated speech, PCM16 mono at 24 kHz */
  onAudio: (pcm: Int16Array) => void;
  onError: (error: AppError) => void;
  onStatus?: (status: SttStatus) => void;
  onUsage?: (usage: Usage) => void;
}

export interface InterpreterSession {
  /** PCM16 mono at 24 kHz, silence included: the interpreter needs it to keep pace */
  append: (pcm: Int16Array) => void;
  /** Translates into another language from now on */
  setLanguage: (code: string) => void;
  /** Lets the last words drain, then closes */
  close: () => void;
}

export interface InterpreterProvider {
  connect: (
    options: InterpreterOptions,
    callbacks: InterpreterCallbacks,
  ) => Promise<InterpreterSession>;
}

export interface TextContext {
  apiKey: string;
  /** Azure OpenAI resource URL; absent means OpenAI itself */
  endpoint?: string;
  /** Language the user reads, as an English name ("Spanish") */
  targetLanguage: string;
  /** User-provided names and terms, one per line */
  glossary: string;
  /** Overrides the default model for this kind of call */
  model?: string;
  /** Cancels the request; an aborted call rejects with an AbortError */
  signal?: AbortSignal;
  onUsage?: (usage: Usage) => void;
}

export interface TranslateRequest extends TextContext {
  text: string;
  /** A few earlier sentences, only to disambiguate */
  previous: string[];
}

/**
 * What is being listened to: a conversation the user takes part in, or a talk, class or
 * video they follow. It decides what the summary keeps and what the suggestions are.
 */
export type ListeningMode = 'conversation' | 'talk';

export interface SummaryRequest extends TextContext {
  summary: string[];
  newLines: string[];
  /** Absent: a conversation */
  mode?: ListeningMode;
}

export interface SuggestRequest extends TextContext {
  /** What was said before `lastLine` */
  context: string[];
  lastLine: string;
  /** Key points so far: what the recent lines leave out */
  summary?: string[];
  /**
   * A conversation gets replies to what was just asked; a talk gets questions the
   * listener could ask about it. Absent: a conversation
   */
  mode?: ListeningMode;
  /** Questions already offered, so a talk doesn't get the same ones again */
  asked?: string[];
}

/** A reply (in a talk, a question) the user could say: `mine` in their language, `theirs` in the speaker's */
export interface ReplySuggestion {
  mine: string;
  theirs: string;
}

export interface LlmProvider {
  translate: (request: TranslateRequest, onDelta: (chunk: string) => void) => Promise<void>;
  summarize: (request: SummaryRequest) => Promise<string[]>;
  suggest: (request: SuggestRequest) => Promise<ReplySuggestion[]>;
}
