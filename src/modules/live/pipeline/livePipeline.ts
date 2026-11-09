import { isAbortError, logError, type AppError } from '@/shared/errors';
import { createSpeakerClusters } from '@/shared/audio/speakerClusters';
import { DRAIN_MS } from '@/shared/providers/openai/config';
import type { FinalMeta, SttCallbacks, TextContext, Usage } from '@/shared/providers/types';
import { routeError } from './errorRoute';
import { createExtras, MAX_UNSUMMARIZED } from './extras';
import {
  activityOf,
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
    const { targetLanguage, targetCode } = run.options;
    if (targetLanguage === null) {
      showAsHeard(run, sentence, '');
      return;
    }
    if (isSaidIn(sentence, targetCode, targetLanguage)) {
      showAsHeard(run, sentence, sentence.text);
      return;
    }
    const inFlight = { sentence, text: '' };
    run.inFlight = inFlight;
    let first = true;
    let done = false;
    overlay.startTranslation('', sentence.speaker);
    try {
      const { previous } = sentence;
      const request = { ...context(run, 'translation'), text: sentence.text, previous };
      await llm.translate(request, (chunk) => {
        if (!isLive(run)) return;
        if (first) overlay.setLatency(now() - sentence.heardAt);
        first = false;
        inFlight.text += chunk;
        overlay.appendTranslation(chunk);
        updateActivity(run);
      });
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
        // A cut-off translation is never marked done, so it is not read aloud
        if (done) overlay.finishTranslation();
        recordLine(run, sentence, inFlight.text.trim());
      }
    }
  }

  async function pump(run: Run): Promise<void> {
    run.translating = true;
    try {
      for (let next = takeNext(run.queue); next && isLive(run); next = takeNext(run.queue)) {
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

  function onFinal(run: Run, text: string, meta?: FinalMeta): void {
    if (!isLive(run) || run.drainEnded) return;
    const language = meta?.language;
    const speaker = overlay.options.speakers ? run.speakers.assign(meta?.voice ?? null) : null;
    if (language) overlay.setDetectedLanguage(language);
    const previous = run.lines.slice(-PREVIOUS_LINES);
    overlay.setSource(text, false);
    run.lines = [...run.lines, text].slice(-MAX_LINES);
    if (overlay.options.summary) {
      run.unsummarized = [...run.unsummarized, text].slice(-MAX_UNSUMMARIZED);
    }
    const seq = run.nextSeq++;
    const heardOn = Date.now();
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

  return { start, pushAudio, stop, abort, setTargetLanguage, resetConversation };
}
