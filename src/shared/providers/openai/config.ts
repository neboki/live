// Endpoints, models and limits for OpenAI. The model choices were measured for live
// captioning.

import { TARGET_SAMPLE_RATE } from '@/shared/audio/pcm';

export const OPENAI_API = 'https://api.openai.com/v1';
/** The key never goes here: it travels in the WebSocket subprotocol */
export const REALTIME_URL = 'wss://api.openai.com/v1/realtime';
export const REALTIME_TRANSCRIPTION_URL = `${REALTIME_URL}?intent=transcription`;

/**
 * OpenAI's voice: the replacement OpenAI names for its retired speech models (ADR 0010).
 * It only runs in a Realtime session, asked to say each sentence word for word.
 */
export const VOICE_MODEL = 'gpt-realtime-2.1-mini';
/** marin and cedar sound best, per OpenAI */
export const VOICE_DEFAULT = 'marin';
/** The voices of the Realtime models, best first */
export const VOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
] as const;
/** Give up on a sentence whose voice has not finished after this long */
export const VOICE_TIMEOUT_MS = 20_000;

/**
 * The free demo's server (functions/, behind Firebase Hosting), or '' where the build has
 * none (local builds). It hands out a short-lived transcription key and passes the
 * translation on with its own key, so a visitor can try the app without one.
 */
export const DEMO_API: string = import.meta.env.VITE_DEMO_API ?? '';

export type QualityTier = 'low' | 'medium' | 'premium' | 'interpreter';

export interface TierModels {
  transcription: string;
  translation: string;
  summary: string;
  suggestions: string;
}

export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'premium', 'interpreter'];

/** Speech translation model: hears, translates and speaks in one session */
export const INTERPRETER_MODEL = 'gpt-realtime-translate';
/** Writes the original text in an interpreter session; the cheapest that works there */
export const INTERPRETER_SOURCE_MODEL = 'gpt-transcribe';
export const REALTIME_TRANSLATION_URL = `wss://api.openai.com/v1/realtime/translations?model=${INTERPRETER_MODEL}`;

/**
 * The quality tiers of docs/adr/0003-pricing-and-model-tiers.md, plus the interpreter of
 * docs/adr/0005-openai-audio-guide.md. The transcription models need client-side VAD;
 * gpt-transcribe writes a sentence only once it is committed (no partial text).
 */
export const TIER_MODELS: Readonly<Record<QualityTier, Readonly<TierModels>>> = {
  /** Fast and cheap; with reasoning off luna translates a sentence in well under a second */
  low: {
    transcription: 'gpt-transcribe',
    translation: 'gpt-6-luna',
    summary: 'gpt-6-luna',
    suggestions: 'gpt-6-luna',
  },
  /** Better transcription, same cheap translator */
  medium: {
    transcription: 'gpt-live-transcribe',
    translation: 'gpt-6-luna',
    summary: 'gpt-6-luna',
    suggestions: 'gpt-6-luna',
  },
  /** gpt-6-astra is left out on purpose: about five times the cost of sol */
  premium: {
    transcription: 'gpt-live-transcribe',
    translation: 'gpt-6.1-sol',
    summary: 'gpt-6.1-sol',
    suggestions: 'gpt-6.1-sol',
  },
  /** Translated while people speak, in its own voice; luna only for the extras */
  interpreter: {
    transcription: INTERPRETER_MODEL,
    translation: INTERPRETER_MODEL,
    summary: 'gpt-6-luna',
    suggestions: 'gpt-6-luna',
  },
};

/**
 * Estimated USD per hour of meeting for each tier, from ADR 0003 (prices as of 2026-10-20).
 */
export const TIER_COST_PER_HOUR: Readonly<Record<QualityTier, number>> = {
  low: 0.24,
  medium: 0.79,
  premium: 2.15,
  /** The whole hour is billed: the interpreter and its transcript hear the silences too */
  interpreter: 2.34,
};

export const DEFAULT_TIER: QualityTier = 'medium';
export const MODELS: Readonly<TierModels> = TIER_MODELS[DEFAULT_TIER];

/** Transcription models that take the glossary as a text `prompt`, not as `keywords` */
export const PROMPT_GLOSSARY_FAMILY = /^gpt-4o/;
/** Transcription models that take `delay`: how long to wait for context before writing */
export const DELAY_FAMILY = /^gpt-live-transcribe/;
/** Captions favour speed: partial text early, the final sentence still has its context */
export const TRANSCRIPTION_DELAY = 'low';
/** Longest meeting topic sent as the transcription `prompt`; too long a prompt is rejected */
export const MAX_TOPIC_CHARS = 300;

/** Models that accept `reasoning_effort`. Never send it to 4.x models. */
export const REASONING_FAMILY = /^(gpt-[56]|o\d)/;
/** Reasoning models that reject effort `none` (measured 2026-10-20); they get `low` */
export const NO_EFFORT_NONE_FAMILY = /^(gpt-6\.1-sol|gpt-6-astra)/;

/** Transcription input format; 16 kHz is rejected by the API */
export const INPUT_SAMPLE_RATE = TARGET_SAMPLE_RATE;
export const FLUSH_MS = 100;
/** Time to wait for the last transcript after stopping */
export const DRAIN_MS = 1500;
/**
 * A closed sentence normally comes back transcribed in about a second. Past this, the
 * server has lost it: it is shown with what it has, so the sentences after it go on.
 * Every sentence after a lost one waits this long, so it is kept short.
 */
export const SENTENCE_TIMEOUT_MS = 5000;
export const MAX_KEYWORDS = 50;

/** Give up opening the transcription socket after this long */
export const CONNECT_TIMEOUT_MS = 10_000;
/** Waits between reconnect attempts after the socket drops; a little jitter is added */
export const BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const;
export const BACKOFF_JITTER_MS = 250;
/** Total time spent reconnecting before telling the user the connection is lost */
export const RECONNECT_BUDGET_MS = 30_000;
/** A reopened socket must stay up this long before the backoff and the budget start over */
export const STABLE_CONNECTION_MS = 10_000;
/** Audio kept while reconnecting; older audio is dropped */
export const MAX_BUFFERED_SECONDS = 10;
/**
 * Audio the interpreter keeps while reconnecting. It hears a replayed backlog late and
 * says it late, so like an interpreter back from a drop it skips most of what it missed.
 */
export const INTERPRETER_BACKLOG_SECONDS = 2;
/**
 * The interpreter is billed for every second it is sent. After this long without anyone
 * speaking (well past the end of any sentence) the audio is held back until speech returns,
 * so a long silence costs nothing. Short pauses still reach it, as it needs them to close
 * a sentence (ADR 0005).
 */
export const INTERPRETER_IDLE_HOLD_MS = 20_000;
/** Audio kept while holding, sent first when speech returns so no syllable is lost */
export const INTERPRETER_RESUME_PREROLL_MS = 1000;
/** Below this level (normalised RMS) a chunk counts as silence; same as the transcription VAD */
export const INTERPRETER_SPEECH_RMS = 0.01;

export const TOKENS = {
  translation: 400,
  summary: 600,
  suggestions: 400,
} as const;
