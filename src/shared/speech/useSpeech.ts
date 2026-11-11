import { AppError, logError } from '@/shared/errors';
import { createBrowserTts } from './browserTts';
import type { TtsProvider } from './types';

export interface Speech {
  /** Queues `text`; items play one after the other, oldest first. */
  speak: (text: string, lang: string) => void;
  /** Stops playback and empties the queue. */
  stop: () => void;
}

export interface SpeechOptions {
  /** The engine to use for the next item; the browser engine when omitted. */
  engine?: () => TtsProvider;
  /** Used when the engine fails; defaults to the browser engine. */
  fallback?: TtsProvider;
  /** Receives an i18n key when the engine fails and the fallback takes over. */
  onError?: (userMessageKey: string) => void;
  /** True while something is being read aloud, false once the queue is done or stopped */
  onBusy?: (busy: boolean) => void;
}

interface QueueItem {
  text: string;
  lang: string;
}

/** Pending items kept while one plays; the oldest is dropped beyond this. */
export const MAX_BACKLOG = 3;
/**
 * Sentences waiting in the same language are read as one clip: nothing is skipped and the
 * voice keeps one tone. Beyond this many characters waiting, the oldest text goes, so the
 * voice never lags far behind the conversation.
 */
export const MAX_PENDING_CHARS = 900;
const TTS_FAILED_KEY = 'errors.ttsFailed';
/** Voice errors that say why (a refused key, no credit left) keep their own message */
const TTS_KEY_PREFIX = 'errors.tts';

/** The last MAX_PENDING_CHARS of `text`, cut at a word so no half word is read */
function trimToRecent(text: string): string {
  if (text.length <= MAX_PENDING_CHARS) return text;
  const tail = text.slice(-MAX_PENDING_CHARS);
  const space = tail.indexOf(' ');
  return space >= 0 ? tail.slice(space + 1) : tail;
}

function noticeKey(err: unknown): string {
  return err instanceof AppError && err.userMessageKey.startsWith(TTS_KEY_PREFIX)
    ? err.userMessageKey
    : TTS_FAILED_KEY;
}

/**
 * A FIFO queue over the active TTS engine. After an engine error, the item and
 * the rest of the run use the fallback (browser) engine until stop() is called.
 */
export function useSpeech(options: SpeechOptions = {}): Speech {
  const fallback = options.fallback ?? createBrowserTts();
  const queue: QueueItem[] = [];
  let run = 0;
  let playing = false;
  let degraded = false;
  let controller: AbortController | null = null;
  let current: TtsProvider | null = null;
  /** Ends the wait for the audio to finish when a new item is queued meanwhile */
  let wake: (() => void) | null = null;

  function activeEngine(): TtsProvider {
    if (degraded) return fallback;
    return options.engine?.() ?? fallback;
  }

  async function play(item: QueueItem, myRun: number, signal: AbortSignal): Promise<void> {
    const engine = activeEngine();
    current = engine;
    try {
      await engine.speak(item.text, item.lang, signal);
    } catch (err) {
      if (signal.aborted || myRun !== run) return;
      if (engine === fallback) {
        logError('Speech synthesis failed', err);
        return;
      }
      logError('Voice engine failed, falling back to the browser voice', err);
      degraded = true;
      options.onError?.(noticeKey(err));
      current = fallback;
      try {
        await fallback.speak(item.text, item.lang, signal);
      } catch (fallbackErr) {
        if (!signal.aborted) logError('Speech synthesis failed', fallbackErr);
      }
    }
  }

  async function pump(): Promise<void> {
    if (playing) return;
    playing = true;
    options.onBusy?.(true);
    const myRun = run;
    try {
      while (myRun === run) {
        const item = queue.shift();
        if (item) {
          controller = new AbortController();
          await play(item, myRun, controller.signal);
          continue;
        }
        // Some engines return just before their audio ends; wait for it unless more comes
        const engine = current;
        if (!engine?.settle) break;
        const queued = new Promise<void>((resolve) => (wake = resolve));
        await Promise.race([
          engine.settle().catch((err: unknown) => logError('Waiting for the voice failed', err)),
          queued,
        ]);
        wake = null;
        if (queue.length === 0) break;
      }
    } finally {
      if (myRun === run) {
        playing = false;
        controller = null;
        current = null;
        options.onBusy?.(false);
      }
    }
  }

  function speak(text: string, lang: string): void {
    if (!text.trim()) return;
    const last = queue[queue.length - 1];
    if (last && last.lang === lang) {
      last.text = trimToRecent(`${last.text} ${text}`);
    } else {
      queue.push({ text: trimToRecent(text), lang });
    }
    while (queue.length > MAX_BACKLOG) queue.shift();
    wake?.();
    pump().catch((err: unknown) => logError('Speech queue failed', err));
  }

  function stop(): void {
    run++;
    playing = false;
    degraded = false;
    queue.length = 0;
    controller?.abort();
    controller = null;
    try {
      current?.stop();
      if (current !== fallback) fallback.stop();
    } catch (err) {
      logError('Stopping speech failed', err);
    } finally {
      current = null;
      options.onBusy?.(false);
    }
  }

  return { speak, stop };
}
