import { isAbortError, logError, type AppError } from '@/shared/errors';
import { createSpeakerClusters } from '@/shared/audio/speakerClusters';
import { DRAIN_MS } from '@/shared/providers/openai/config';
import type { FinalMeta, SttCallbacks, TextContext, Usage } from '@/shared/providers/types';
import type { Voiceprint } from '@/shared/audio/voiceprint';
import { readLanguageTag, routeOf, speakerOf, speakerOfTag } from './conversation';
import { routeError } from './errorRoute';
import { introducedName } from './speakerNames';
import { createExtras, MAX_UNSUMMARIZED } from './extras';
import { isRetryable, TRANSLATE_ATTEMPTS, watchTranslation } from './translateWatchdog';
import {
  activityOf,
  captionDueFrom,
  createRun,
  isSaidIn,
  keywordsFrom,
  settleLine,
  takeNext,
  textContext,
  type Run,
  type Sentence,
} from './run';
import type { LivePipeline, PipelineDeps, PipelineOptions, TextRole } from './types';

export type * from './types';

const MAX_LINES = 200;
const MAX_PENDING_CHUNKS = 50;
/** Sentences waiting for translation (they go out together); beyond this the oldest are dropped */
const MAX_QUEUED = 6;
/** After the transcriber's drain, how long the last translations may still take */
export const TRANSLATE_GRACE_MS = 5000;
const PREVIOUS_LINES = 3;
const RECONNECTING_KEY = 'live.reconnecting';

/**
 * Audio → transcription → translation, plus the optional summary and reply
 * suggestions. Translations run one at a time, in order; sentences heard while
 * one is translating are joined into the next request. The extras run on the
 * side and never block the captions.
 */
export function createLivePipeline({
  stt,
  llm,
  overlay,
  record,
  now = () => performance.now(),
}: PipelineDeps): LivePipeline {
  let current: Run | null = null;

  const isLive = (run: Run): boolean => run === current;

  function addUsage(run: Run, usage: Usage): void {
    if (isLive(run)) record?.addUsage(usage);
  }

  function context(run: Run, role: TextRole): TextContext {
    return textContext(run, role, overlay.glossary, (usage) => addUsage(run, usage));
  }

  /** Tells the session whether it can go on: stop, show a notice, or only log. */
  function route(run: Run, error: AppError): void {
    if (!isLive(run)) return;
    const kind = routeError(error);
    if (kind === 'fatal' && !run.draining) run.options.onFatal(error);
    if (kind === 'notice') {
      run.noticeShown = true;
      run.options.onNotice?.(error);
    }
  }

  function handleError(run: Run, label: string, err: unknown): void {
    if (isAbortError(err)) return;
    route(run, logError(label, err));
  }

  function updateActivity(run: Run): void {
    if (isLive(run)) overlay.setActivity(activityOf(run));
  }

  /** Lines reach the record in the order they were heard, even when one was dropped. */
  function recordLine(run: Run, sentence: Sentence, translation: string): void {
    settleLine(run, sentence, translation).forEach((line) => record?.addLine(line));
  }

  /**
   * Nothing to translate: the sentence goes on screen as it was heard. `translation` is
   * what the record keeps (empty when only transcribing, the sentence itself when it was
   * already said in the target language).
   */
  function showAsHeard(run: Run, sentence: Sentence, translation: string): void {
    overlay.startTranslation(sentence.text, sentence.speaker);
    overlay.setLatency(now() - sentence.heardAt);
    overlay.finishTranslation();
    recordLine(run, sentence, translation);
    updateActivity(run);
  }

  async function translate(run: Run, sentence: Sentence): Promise<void> {
    const { targetLanguage, targetCode, partner } = run.options;
    if (targetLanguage === null) {
      showAsHeard(run, sentence, '');
      return;
    }
    // A conversation translates each way; a direction its listener turned off is not
    const into = partner ? routeOf(sentence.speaker, targetLanguage, partner) : targetLanguage;
    if (into === null) {
      showAsHeard(run, sentence, '');
      return;
    }
    if (!partner && isSaidIn(sentence, targetCode, targetLanguage)) {
      showAsHeard(run, sentence, sentence.text);
      return;
    }
    const inFlight = { sentence, text: '' };
    run.inFlight = inFlight;
    let first = true;
    let done = false;
    // Nobody could tell who said it: the translator names the language before its
    // translation, and the line goes on screen once that says who it was for
    const placing = partner && sentence.speaker === null ? { raw: '', placed: false } : null;
    /** The listener of the line turned translations off: it is not shown or kept */
    let unwanted = false;
    const place = (code: string | null): void => {
      if (!placing || placing.placed) return;
      placing.placed = true;
      if (partner && targetCode) {
        const user = { code: targetCode, language: targetLanguage };
        sentence.speaker = speakerOfTag(code, user, partner);
        if (code && !sentence.language) sentence.language = code;
        unwanted =
          sentence.speaker !== null && routeOf(sentence.speaker, targetLanguage, partner) === null;
      }
      overlay.startTranslation('', sentence.speaker);
    };
    if (!placing) overlay.startTranslation('', sentence.speaker);
    try {
      const { previous } = sentence;
      const request = {
        ...context(run, 'translation'),
        targetLanguage: into,
        text: sentence.text,
        previous,
      };
      const onChunk = (chunk: string): void => {
        if (!isLive(run)) return;
        let text = chunk;
        if (placing && !placing.placed) {
          placing.raw += chunk;
          const tag = readLanguageTag(placing.raw);
          if (!tag) return;
          place(tag.code);
          text = tag.rest;
        }
        if (unwanted || !text) return;
        if (first) overlay.setLatency(now() - sentence.heardAt);
        first = false;
        inFlight.text += text;
        overlay.appendTranslation(text);
        updateActivity(run);
      };
      // A stuck call would hold every sentence after it: it gets a deadline and,
      // when nothing came out of it yet, one more try
      for (let attempt = 1; ; attempt++) {
        if (placing && !placing.placed) placing.raw = '';
        try {
          await watchTranslation(
            (signal, onDelta) => llm.translate({ ...request, signal }, onDelta),
            run.controller.signal,
            onChunk,
          );
          break;
        } catch (err) {
          const again =
            attempt < TRANSLATE_ATTEMPTS && !inFlight.text && isLive(run) && isRetryable(err);
          if (!again) throw err;
          logError('Translation retried', err);
        }
      }
      // A whole answer that looked like the start of a tag: it was the translation
      if (placing && !placing.placed && placing.raw.trim()) {
        const raw = placing.raw;
        place(null);
        onChunk(raw);
      }
      done = true;
      if (isLive(run) && run.noticeShown) {
        run.noticeShown = false;
        overlay.setNotice(null);
      }
    } catch (err) {
      handleError(run, 'Translation failed', err);
    } finally {
      if (run.inFlight === inFlight) run.inFlight = null;
      updateActivity(run);
      if (isLive(run)) {
        // A failed call never said who it was for: its line still takes its place
        if (placing && !placing.placed) place(null);
        // A cut-off translation is never marked done, so it is not read aloud
        if (done) overlay.finishTranslation();
        recordLine(run, sentence, inFlight.text.trim());
      }
    }
  }

  async function pump(run: Run): Promise<void> {
    run.translating = true;
    try {
      const joinUnknown = !run.options.partner;
      for (
        let next = takeNext(run.queue, joinUnknown);
        next && isLive(run);
        next = takeNext(run.queue, joinUnknown)
      ) {
        await translate(run, next);
      }
    } finally {
      run.translating = false;
      if (run.drainEnded && isLive(run)) abort();
    }
  }

  function enqueue(run: Run, sentence: Sentence): void {
    run.queue.push(sentence);
    while (run.queue.length > MAX_QUEUED) {
      const dropped = run.queue.shift();
      if (dropped) recordLine(run, dropped, '');
    }
    if (!run.translating) void pump(run);
    updateActivity(run);
  }

  const { summarize, suggest } = createExtras({
    llm,
    overlay,
    record,
    isLive,
    context,
    handleError,
  });

  /** In a conversation the language says who spoke; otherwise the voice, when asked for. */
  function speakerFor(
    run: Run,
    language: string | undefined,
    voice: Voiceprint | null,
    text: string,
  ): number | null {
    const { partner, targetCode, targetLanguage } = run.options;
    if (partner && targetCode && targetLanguage) {
      return speakerOf(language, { code: targetCode, language: targetLanguage }, partner, text);
    }
    return overlay.options.speakers ? run.speakers.assign(voice) : null;
  }

  /** "Soy Ana": the voice that said it is Ana, unless the user already named it. */
  function nameSpeaker(speaker: number | null, text: string): void {
    if (speaker === null || overlay.speakerNames[speaker]) return;
    const name = introducedName(text);
    if (name) overlay.setSpeakerName(speaker, name);
  }

  function onFinal(run: Run, text: string, meta?: FinalMeta): void {
    if (!isLive(run) || run.drainEnded) return;
    const language = meta?.language;
    const speaker = speakerFor(run, language, meta?.voice ?? null, text);
    if (language) overlay.setDetectedLanguage(language);
    nameSpeaker(speaker, text);
    const previous = run.lines.slice(-PREVIOUS_LINES);
    overlay.setSource(text, false);
    run.lines = [...run.lines, text].slice(-MAX_LINES);
    if (overlay.options.summary) {
      run.unsummarized = [...run.unsummarized, text].slice(-MAX_UNSUMMARIZED);
    }
    const seq = run.nextSeq++;
    const heardOn = Date.now();
    run.lastHeardOn = heardOn;
    // The transcriber says when this very sentence began; the gate only knows the latest
    const from = meta?.startedOn ?? run.speechStartedOn;
    const heard = {
      heardAt: now(),
      heardOn,
      ...(from === null ? {} : { from: Math.min(from, heardOn) }),
    };
    enqueue(run, { seq, text, previous, ...heard, language, speaker });
    if (run.draining) return;
    void summarize(run);
    void suggest(run, text);
  }

  function callbacks(run: Run): SttCallbacks {
    return {
      onPartial: (text) => isLive(run) && overlay.setSource(text, true),
      onFinal: (text, meta) => onFinal(run, text, meta),
      // Already logged by the transcriber; a rate limit or outage there only shows a notice
      onError: (error) => {
        if (isLive(run) && !run.draining) route(run, error);
        else logError('Transcription error after stopping', error);
      },
      onStatus: (status) =>
        isLive(run) && overlay.setNotice(status === 'reconnecting' ? RECONNECTING_KEY : null),
      onActivity: (activity) => {
        if (activity === 'speech' && run.sttActivity !== 'speech') run.speechStartedOn = Date.now();
        run.sttActivity = activity;
        updateActivity(run);
      },
      onUsage: (usage) => addUsage(run, usage),
    };
  }

  async function start(next: PipelineOptions): Promise<AppError | null> {
    abort();
    const run = createRun(next);
    current = run;
    try {
      const keywords = keywordsFrom(overlay.glossary);
      const sttOptions = {
        apiKey: next.apiKey,
        endpoint: next.endpoint,
        keywords,
        languages: next.languages,
        topic: next.topic,
        model: next.models?.transcription,
      };
      const opened = await stt.connect(sttOptions, callbacks(run));
      if (!isLive(run) || run.draining) {
        opened.close();
        return null;
      }
      run.session = opened;
      run.pending.forEach((pcm) => opened.append(pcm));
      run.pending = [];
      return null;
    } catch (err) {
      if (!isLive(run)) return null;
      abort();
      return logError('Could not start transcription', err);
    }
  }

  function pushAudio(pcm: Int16Array): void {
    const run = current;
    if (!run || run.draining || overlay.paused) return;
    if (run.session) {
      run.session.append(pcm);
      return;
    }
    run.pending.push(pcm);
    if (run.pending.length > MAX_PENDING_CHUNKS) run.pending.shift();
  }

  /** The transcriber has had its last word: end once the last translation is done. */
  function endDrain(run: Run): void {
    if (!isLive(run)) return;
    run.drainEnded = true;
    if (!run.translating) abort();
    else run.drainTimer = setTimeout(() => isLive(run) && abort(), TRANSLATE_GRACE_MS);
  }

  function stop(): void {
    const run = current;
    if (!run || run.draining) return;
    run.draining = true;
    run.session?.close();
    run.session = null;
    run.pending = [];
    run.drainTimer = setTimeout(() => endDrain(run), DRAIN_MS);
  }

  function abort(): void {
    const run = current;
    if (!run) return;
    current = null;
    overlay.setActivity(null);
    if (run.drainTimer) clearTimeout(run.drainTimer);
    run.controller.abort();
    run.session?.close();
    run.session = null;
    run.pending = [];
    // Sentences already heard stay in the record, with what was translated of them
    if (run.inFlight) recordLine(run, run.inFlight.sentence, run.inFlight.text.trim());
    run.queue.forEach((sentence) => recordLine(run, sentence, ''));
    run.queue = [];
  }

  function setTargetLanguage(language: string | null, code?: string): void {
    if (current)
      current.options = { ...current.options, targetLanguage: language, targetCode: code };
  }

  function resetConversation(): void {
    if (!current) return;
    current.speakers = createSpeakerClusters();
    current.lines = [];
    current.unsummarized = [];
    current.sinceQuestions = 0;
    current.asked = [];
  }

  return {
    start,
    pushAudio,
    stop,
    abort,
    setTargetLanguage,
    resetConversation,
    captionDueFrom: () => (current ? captionDueFrom(current) : null),
  };
}
