import { logError } from '@/shared/errors';
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
}

interface QueueItem {
  text: string;
  lang: string;
}

/** Pending items kept while one plays; the oldest is dropped beyond this. */
export const MAX_BACKLOG = 3;
const TTS_FAILED_KEY = 'errors.ttsFailed';

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
      options.onError?.(TTS_FAILED_KEY);
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
    const myRun = run;
    try {
      while (queue.length > 0 && myRun === run) {
        const item = queue.shift();
        if (!item) break;
        controller = new AbortController();
        await play(item, myRun, controller.signal);
      }
    } finally {
      if (myRun === run) {
        playing = false;
        controller = null;
        current = null;
      }
    }
  }

  function speak(text: string, lang: string): void {
    if (!text.trim()) return;
    queue.push({ text, lang });
    while (queue.length > MAX_BACKLOG) queue.shift();
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
    }
  }

  return { speak, stop };
}
