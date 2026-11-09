import type { CaptionActivity } from '@/modules/overlay';
import { createSpeakerClusters, type SpeakerClusters } from '@/shared/audio/speakerClusters';
import type { SttActivity, SttSession, TextContext, Usage } from '@/shared/providers/types';
import type { PipelineOptions, RecordedLine, TextRole } from './types';

/** What the summary and suggestions are written in when nothing is translated */
const SAME_LANGUAGE = 'the language of the transcript';

/** A finished sentence waiting for its translation */
export interface Sentence {
  /** Order in which it was heard; the record keeps this order */
  seq: number;
  text: string;
  previous: string[];
  /** now() when heard, for the latency */
  heardAt: number;
  /** Epoch milliseconds when heard, for the record */
  heardOn: number;
  /** Epoch milliseconds when the speaker began it, for captions shown behind time */
  from?: number;
  language?: string;
  /** Who said it, when speakers are told apart */
  speaker: number | null;
  /** Sentences heard while the translator was busy, translated together with this one */
  absorbed?: Sentence[];
}

/** The sentence being translated and the text streamed so far */
export interface InFlight {
  sentence: Sentence;
  text: string;
}

/** Everything that belongs to one start(); results from an older run are ignored. */
export interface Run {
  options: PipelineOptions;
  /** Aborted when the run ends: cancels every call still in flight */
  controller: AbortController;
  session: SttSession | null;
  /** Audio captured before the transcriber is connected */
  pending: Int16Array[];
  /** Stopped by the user: still translating the last sentence, no new audio */
  draining: boolean;
  /** The transcriber is done too: no new sentences, end once the queue is empty */
  drainEnded: boolean;
  drainTimer: ReturnType<typeof setTimeout> | null;
  lines: string[];
  unsummarized: string[];
  summarizing: boolean;
  /** Date.now() before which no new summary is tried, after a failure */
  summaryRetryAt: number;
  /** How long the next failure waits: doubles each time, back to the start on success */
  summaryBackoffMs: number;
  queue: Sentence[];
  translating: boolean;
  inFlight: InFlight | null;
  /** Sequence number for the next sentence heard */
  nextSeq: number;
  /** Sequence number of the next line to write to the record */
  recorded: number;
  /** Lines finished out of order, waiting for an earlier one; null: merged into another */
  settled: Map<number, RecordedLine | null>;
  /** Only the newest suggestion request may set the chips */
  suggestSeq: number;
  /** Lines heard since the last questions about a talk were asked for */
  sinceQuestions: number;
  /** Questions about a talk are on their way: no second request meanwhile */
  asking: boolean;
  /** Questions about this talk offered so far (the latest few), so they are not offered again */
  asked: string[];
  /** A notice is showing; the next good translation clears it */
  noticeShown: boolean;
  /** Last activity the transcriber reported */
  sttActivity: SttActivity;
  /** Epoch milliseconds when the transcriber last heard speech begin */
  speechStartedOn: number | null;
  /** Epoch milliseconds when the latest sentence was heard in full */
  lastHeardOn: number | null;
  /** Voices heard so far in this run */
  speakers: SpeakerClusters;
}

/**
 * The next thing to translate: the oldest sentence, joined with every one the same
 * speaker said since. When the translator falls behind, one request catches up with all of them
 * instead of making the user wait for each in turn (or dropping some).
 */
export function takeNext(queue: Sentence[]): Sentence | undefined {
  const first = queue.shift();
  if (!first || !queue.length) return first;
  // Only the same person's words are joined: a change of speaker starts a new line
  const turn = queue.findIndex((next) => next.speaker !== first.speaker);
  const absorbed = queue.splice(0, turn < 0 ? queue.length : turn);
  if (!absorbed.length) return first;
  return {
    ...first,
    text: [first, ...absorbed].map((part) => part.text).join(' '),
    language: absorbed.at(-1)?.language ?? first.language,
    absorbed,
  };
}

/**
 * What the captions should say is on its way before any text shows: someone is
 * speaking, or a sentence is being transcribed or translated (until its first words).
 */
export function activityOf(run: Run): CaptionActivity | null {
  if (run.sttActivity === 'speech') return 'hearing';
  const waitingForText = run.queue.length > 0 || (run.inFlight !== null && !run.inFlight.text);
  return run.sttActivity === 'transcribing' || waitingForText ? 'translating' : null;
}

/**
 * Epoch milliseconds where the oldest speech without a caption yet began: a sentence
 * waiting for its translation, or one still being said or transcribed. Null when every
 * sentence heard has its caption. A picture shown behind time can wait there for it.
 */
export function captionDueFrom(run: Run): number | null {
  const waiting = [...(run.inFlight ? [run.inFlight.sentence] : []), ...run.queue];
  const starts = waiting.map((sentence) => sentence.from ?? sentence.heardOn);
  if (run.sttActivity !== 'idle' && run.speechStartedOn !== null) {
    // Still being said: it began when the speech did, or right after the last sentence
    starts.push(Math.max(run.speechStartedOn, run.lastHeardOn ?? 0));
  }
  return starts.length ? Math.min(...starts) : null;
}

export function createRun(options: PipelineOptions): Run {
  return {
    options,
    controller: new AbortController(),
    session: null,
    pending: [],
    draining: false,
    drainEnded: false,
    drainTimer: null,
    lines: [],
    unsummarized: [],
    summarizing: false,
    summaryRetryAt: 0,
    summaryBackoffMs: 0,
    queue: [],
    translating: false,
    inFlight: null,
    nextSeq: 0,
    recorded: 0,
    settled: new Map(),
    suggestSeq: 0,
    sinceQuestions: 0,
    asking: false,
    asked: [],
    noticeShown: false,
    sttActivity: 'idle',
    speechStartedOn: null,
    lastHeardOn: null,
    speakers: createSpeakerClusters(),
  };
}

/**
 * Stores a sentence's final translation and returns the lines that can now be written,
 * in the order they were heard. A sentence settled twice is ignored.
 */
export function settleLine(run: Run, sentence: Sentence, translation: string): RecordedLine[] {
  if (sentence.seq < run.recorded || run.settled.has(sentence.seq)) return [];
  const { text: source, language, heardOn: at, from, speaker } = sentence;
  run.settled.set(sentence.seq, {
    at,
    ...(from === undefined ? {} : { from }),
    source,
    language,
    translation,
    ...(speaker === null ? {} : { speaker }),
  });
  // Merged sentences are one line, written where the first of them was heard
  sentence.absorbed?.forEach((part) => run.settled.set(part.seq, null));
  const ready: RecordedLine[] = [];
  for (
    let line = run.settled.get(run.recorded);
    line !== undefined;
    line = run.settled.get(run.recorded)
  ) {
    if (line) ready.push(line);
    run.settled.delete(run.recorded);
    run.recorded++;
  }
  return ready;
}

/** "en", "en-US" or "English" all match "en" / "English". */
function sameLanguage(detected: string, code: string, name: string): boolean {
  const spoken = detected.trim().toLowerCase();
  const base = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0] ?? '';
  return base(spoken) === base(code) || spoken === name.toLowerCase();
}

/**
 * The transcriber says the sentence (and every one joined to it) is already in the
 * target language, so there is nothing to translate. Unknown languages are translated.
 */
export function isSaidIn(sentence: Sentence, code: string | undefined, name: string): boolean {
  if (!code) return false;
  const parts = [sentence, ...(sentence.absorbed ?? [])];
  return parts.every(
    (part) => part.language !== undefined && sameLanguage(part.language, code, name),
  );
}

/** What a text call of this run (translation, summary, suggestions) is given */
export function textContext(
  run: Run,
  role: TextRole,
  glossary: string,
  onUsage: (usage: Usage) => void,
): TextContext {
  return {
    apiKey: run.options.apiKey,
    endpoint: run.options.endpoint,
    targetLanguage: run.options.targetLanguage ?? SAME_LANGUAGE,
    glossary,
    model: run.options.models?.[role],
    signal: run.controller.signal,
    onUsage,
  };
}

/** One glossary term per line → transcription keywords. */
export function keywordsFrom(glossary: string): string[] {
  return glossary
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
