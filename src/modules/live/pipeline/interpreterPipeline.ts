import { isSilent, rms } from '@/shared/audio/pcm';
import { createPcmPlayer, type PcmPlayer } from '@/shared/audio/pcmPlayer';
import { isAbortError, logError, type AppError } from '@/shared/errors';
import {
  INPUT_SAMPLE_RATE,
  INTERPRETER_IDLE_HOLD_MS,
  INTERPRETER_RESUME_PREROLL_MS,
  INTERPRETER_SPEECH_RMS,
} from '@/shared/providers/openai/config';
import { INTERPRETER_DRAIN_MS } from '@/shared/providers/openai/realtime/realtimeTranslate';
import type {
  InterpreterCallbacks,
  InterpreterProvider,
  TextContext,
} from '@/shared/providers/types';
import { routeError } from './errorRoute';
import { createExtras, MAX_UNSUMMARIZED } from './extras';
import {
  closeDelay,
  createTurn,
  endsSentence,
  joinText,
  splitSource,
  type Turn,
} from './interpreterLines';
import { hearChunk, spokenOn } from './interpreterTiming';
import { type Run, textContext } from './run';
import type { LivePipeline, PipelineDeps, PipelineOptions, TextRole } from './types';

export interface InterpreterDeps extends Omit<PipelineDeps, 'stt'> {
  interpreter: InterpreterProvider;
  /** Plays the translated voice; a Web Audio player by default */
  player?: PcmPlayer;
}

const MAX_LINES = 200;
/**
 * 100 ms chunks kept until the interpreter is connected, then sent in one go. It hears
 * them late and says them late, so only a moment is kept: an interpreter who joins late
 * skips what was said rather than lag behind for the rest of the meeting.
 */
const MAX_PENDING_CHUNKS = 20;
const RECONNECTING_KEY = 'live.reconnecting';

/**
 * Audio → interpreter (gpt-realtime-translate) → captions and translated voice, with
 * the summary and suggestions written from the original text as in the chained pipeline.
 * The interpreter has no sentence ends: a line closes at a sentence end or a pause.
 */
export function createInterpreterPipeline({
  interpreter,
  llm,
  overlay,
  record,
  player = createPcmPlayer(() => overlay.voiceVolume),
  now = () => performance.now(),
}: InterpreterDeps): LivePipeline {
  let current: Turn | null = null;

  const isLive = (run: Run): boolean => current?.run === run;

  function context(run: Run, role: TextRole): TextContext {
    return textContext(run, role, overlay.glossary, (usage) => {
      if (isLive(run)) record?.addUsage(usage);
    });
  }

  function route(run: Run, error: AppError): void {
    if (!isLive(run)) return;
    const kind = routeError(error);
    if (kind === 'fatal' && !run.draining) run.options.onFatal(error);
    if (kind === 'notice') run.options.onNotice?.(error);
  }

  function handleError(run: Run, label: string, err: unknown): void {
    if (!isAbortError(err)) route(run, logError(label, err));
  }

  const { summarize, suggest } = createExtras({
    llm,
    overlay,
    record,
    isLive,
    context,
    handleError,
  });

  function schedule(turn: Turn, text: string): void {
    if (turn.closeTimer) clearTimeout(turn.closeTimer);
    const delay = closeDelay(text);
    if (delay === 0) closeLine(turn);
    else turn.closeTimer = setTimeout(() => current === turn && closeLine(turn), delay);
  }

  /** The line on screen is finished: it goes to the record, the summary and suggestions. */
  function closeLine(turn: Turn): void {
    if (turn.closeTimer) clearTimeout(turn.closeTimer);
    turn.closeTimer = null;
    const { run } = turn;
    const translating = run.options.targetLanguage !== null;
    if (translating && !turn.open) return;
    const split = splitSource(turn.source);
    const source = split.done || split.rest;
    turn.source = split.done ? split.rest : '';
    const from = turn.heardOn;
    turn.heardAt = turn.source ? now() : null;
    // What is left began after the last sentence end, not now: its text came in since
    turn.heardOn = turn.source ? (turn.restOn ?? Date.now() - turn.timing.lagMs) : null;
    turn.restOn = null;
    if (!source && !turn.translation.trim()) return;
    if (!translating) overlay.startTranslation(source);
    overlay.finishTranslation();
    overlay.setSource(turn.source || source, turn.source !== '');
    overlay.setActivity(null);
    const translation = translating ? turn.translation.trim() : '';
    turn.translation = '';
    turn.open = false;
    const at = Date.now();
    record?.addLine({
      at,
      source,
      translation,
      ...(from === null ? {} : { from: Math.min(from, at) }),
    });
    if (!source) return;
    run.lines = [...run.lines, source].slice(-MAX_LINES);
    if (overlay.options.summary) {
      run.unsummarized = [...run.unsummarized, source].slice(-MAX_UNSUMMARIZED);
    }
    if (run.draining) return;
    void summarize(run);
    void suggest(run, source);
  }

  function onSource(turn: Turn, delta: string): void {
    if (current !== turn) return;
    // Dated by when it was said, not by when its text arrived (seconds later)
    const spoken = spokenOn(turn.timing);
    if (!turn.source) {
      turn.heardAt = now();
      turn.heardOn = spoken;
    } else if (endsSentence(turn.source)) {
      turn.restOn = spoken;
    }
    turn.source = joinText(turn.source, delta);
    overlay.setSource(turn.source.trim(), true);
    if (!turn.open) overlay.setActivity('hearing');
    // Only transcribing: the original text is the caption, so it decides where lines end
    if (turn.run.options.targetLanguage === null) schedule(turn, turn.source);
  }

  function onTranslation(turn: Turn, delta: string): void {
    if (current !== turn || turn.run.options.targetLanguage === null) return;
    if (!turn.open) {
      overlay.startTranslation('', null);
      if (turn.heardAt !== null) overlay.setLatency(now() - turn.heardAt);
      overlay.setActivity(null);
      turn.open = true;
    }
    turn.translation += delta;
    overlay.appendTranslation(delta);
    schedule(turn, turn.translation);
  }

  function onAudio(turn: Turn, pcm: Int16Array): void {
    // Only transcribing: the interpreter still speaks, but nobody asked for it
    if (current !== turn || turn.run.options.targetLanguage === null) return;
    // Stopped by the user: the last captions may still arrive, but the voice ends now
    if (turn.run.draining) return;
    // The padding between sentences arrives faster than real time: queuing it would lag
    if (isSilent(pcm)) return;
    if (overlay.options.voice && !overlay.paused) player.play(pcm);
    else player.stop();
  }

  function callbacks(turn: Turn): InterpreterCallbacks {
    const { run } = turn;
    return {
      onSource: (delta) => onSource(turn, delta),
      onTranslation: (delta) => onTranslation(turn, delta),
      onAudio: (pcm) => onAudio(turn, pcm),
      onError: (error) => {
        if (isLive(run) && !run.draining) route(run, error);
        else logError('Interpreter error after stopping', error);
      },
      onStatus: (status) =>
        isLive(run) && overlay.setNotice(status === 'reconnecting' ? RECONNECTING_KEY : null),
      onUsage: (usage) => isLive(run) && record?.addUsage(usage),
    };
  }

  async function start(options: PipelineOptions): Promise<AppError | null> {
    abort();
    const turn = createTurn(options);
    current = turn;
    overlay.selfVoiced = true;
    try {
      const session = await interpreter.connect(
        {
          apiKey: options.apiKey,
          endpoint: options.endpoint,
          language: options.targetCode ?? 'en',
        },
        callbacks(turn),
      );
      if (current !== turn || turn.run.draining) {
        session.close();
        return null;
      }
      turn.session = session;
      turn.run.pending.forEach((pcm) => session.append(pcm));
      turn.run.pending = [];
      return null;
    } catch (err) {
      if (current !== turn) return null;
      abort();
      return logError('Could not start the interpreter', err);
    }
  }

  /**
   * Sends the chunk, unless a long silence is under way: then it is held (only the last
   * moment is kept) and sent, with that moment first, as soon as someone speaks again.
   */
  function sendOrHold(turn: Turn, session: NonNullable<Turn['session']>, pcm: Int16Array): void {
    const ms = (pcm.length / INPUT_SAMPLE_RATE) * 1000;
    const speaking = rms(pcm) >= INTERPRETER_SPEECH_RMS;
    hearChunk(turn.timing, speaking, ms);
    turn.quietMs = speaking ? 0 : turn.quietMs + ms;
    if (speaking && turn.holding) {
      turn.holding.forEach((held) => session.append(held));
      turn.holding = null;
    }
    if (!turn.holding && turn.quietMs >= INTERPRETER_IDLE_HOLD_MS) turn.holding = [];
    if (!turn.holding) {
      session.append(pcm);
      return;
    }
    turn.holding.push(pcm);
    let kept = turn.holding.reduce((total, held) => total + held.length, 0);
    const limit = (INPUT_SAMPLE_RATE * INTERPRETER_RESUME_PREROLL_MS) / 1000;
    while (kept > limit && turn.holding.length > 1) kept -= turn.holding.shift()?.length ?? 0;
  }

  function pushAudio(pcm: Int16Array): void {
    const turn = current;
    if (!turn || turn.run.draining || overlay.paused) return;
    if (turn.session) {
      sendOrHold(turn, turn.session, pcm);
      return;
    }
    turn.run.pending.push(pcm);
    if (turn.run.pending.length > MAX_PENDING_CHUNKS) turn.run.pending.shift();
  }

  /** Graceful: the interpreter finishes what it heard, then the last line closes. */
  function stop(): void {
    const turn = current;
    if (!turn || turn.run.draining) return;
    turn.run.draining = true;
    player.stop();
    turn.session?.close();
    turn.session = null;
    turn.run.drainTimer = setTimeout(() => current === turn && abort(), INTERPRETER_DRAIN_MS);
  }

  function abort(): void {
    const turn = current;
    if (!turn) return;
    // The line goes to the record, but no summary or suggestion is asked for a run that ends
    turn.run.draining = true;
    closeLine(turn);
    current = null;
    overlay.selfVoiced = false;
    overlay.setActivity(null);
    if (turn.run.drainTimer) clearTimeout(turn.run.drainTimer);
    turn.run.controller.abort();
    turn.session?.close();
    turn.session = null;
    player.stop();
  }

  function setTargetLanguage(language: string | null, code?: string): void {
    if (!current) return;
    current.run.options = { ...current.run.options, targetLanguage: language, targetCode: code };
    if (language === null) player.stop();
    else if (code) current.session?.setLanguage(code);
  }

  function resetConversation(): void {
    if (!current) return;
    current.run.lines = [];
    current.run.unsummarized = [];
    current.run.sinceQuestions = 0;
    current.run.asked = [];
  }

  return {
    start,
    pushAudio,
    stop,
    abort,
    setTargetLanguage,
    resetConversation,
    // Its lines are written as people talk and recorded as they close
    captionComing: () => null,
  };
}
