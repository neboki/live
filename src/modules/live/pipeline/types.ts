import type { useOverlayStore } from '@/modules/overlay';
import type { AppError } from '@/shared/errors';
import type { LlmProvider, SttProvider, Usage } from '@/shared/providers/types';

export type OverlayStore = ReturnType<typeof useOverlayStore>;

/** Each kind of call can use its own model */
export type ModelRole = 'transcription' | 'translation' | 'summary' | 'suggestions';
export type TextRole = Exclude<ModelRole, 'transcription'>;

/** A heard sentence and its translation, as the session record keeps it */
export interface RecordedLine {
  at: number;
  /** Epoch milliseconds when the speaker began it; `at` is when it was heard in full */
  from?: number;
  source: string;
  language?: string;
  translation: string;
  /** Who said it (0, 1, …), when speakers are told apart */
  speaker?: number;
}

/** What the pipeline writes to the session record (the export and the cost) */
export interface SessionSink {
  addLine: (line: RecordedLine) => void;
  setSummary: (points: string[]) => void;
  addUsage: (usage: Usage) => void;
}

export interface PipelineDeps {
  stt: SttProvider;
  llm: LlmProvider;
  overlay: OverlayStore;
  record?: SessionSink;
  now?: () => number;
}

/** The other person in a two-way conversation */
export interface Partner {
  /** English name of their language, e.g. "English" */
  language: string;
  /** ISO 639-1 code, e.g. "en" */
  code: string;
  /** Read at each sentence: false when that person asked not to get translations */
  toUser: () => boolean;
  toPartner: () => boolean;
}

export interface PipelineOptions {
  /**
   * A two-way conversation: the user speaks the target language, the other person this
   * one. Each sentence is translated into the other's language; who said it is told by
   * the language the transcriber hears (see conversation.ts).
   */
  partner?: Partner;
  apiKey: string;
  /** Azure OpenAI resource URL; absent means OpenAI itself */
  endpoint?: string;
  /** English name of the language the user reads, e.g. "Spanish"; null only transcribes */
  targetLanguage: string | null;
  /** ISO 639-1 code of the same language ("es"): what is already said in it is not translated */
  targetCode?: string;
  /** Model overrides; the provider defaults apply to the missing ones */
  models?: Partial<Record<ModelRole, string>>;
  /** ISO 639-1 codes of the languages expected in the meeting; empty: any */
  languages?: string[];
  /** What the meeting is about, to help the transcriber */
  topic?: string;
  /** Something that stops the session (bad key, no credit, lost connection) */
  onFatal: (error: AppError) => void;
  /** Something worth telling the user that doesn't stop the session (rate limit, outage) */
  onNotice?: (error: AppError) => void;
}

export interface LivePipeline {
  start: (options: PipelineOptions) => Promise<AppError | null>;
  pushAudio: (pcm: Int16Array) => void;
  /** Graceful: waits a moment for the last sentence and its translation */
  stop: () => void;
  /** Immediate: cancels everything in flight */
  abort: () => void;
  /** From the next sentence on, translate into this language (e.g. "French"; null: don't) */
  setTargetLanguage: (language: string | null, code?: string) => void;
  /** Starts the conversation over: forgets the voices heard and the earlier lines */
  resetConversation: () => void;
}
