import type { TtsProvider } from './types';

const SPEECH_RATE = 1.05;

/**
 * Browser speech synthesis: free and offline, quality depends on the OS voices.
 * It never calls cancel() between utterances, so a sentence is not cut off by
 * the next one; the caller queues them.
 */
export function createBrowserTts(getVolume: () => number = () => 1): TtsProvider {
  function speak(text: string, lang: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
      if (!synth || !text.trim() || signal?.aborted) {
        resolve();
        return;
      }
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = SPEECH_RATE;
        // The browser's voice cannot go above 100%
        utterance.volume = Math.min(1, Math.max(0, getVolume()));
        const done = (): void => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        };
        const onAbort = (): void => {
          stop();
          done();
        };
        utterance.onend = done;
        // 'interrupted' and 'canceled' come from stop(); treat every error as the end
        utterance.onerror = done;
        signal?.addEventListener('abort', onAbort, { once: true });
        synth.speak(utterance);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function stop(): void {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Nothing to stop.
    }
  }

  return { speak, stop };
}
