// Keeps one stuck translation from freezing the captions.
//
// Translations go out one at a time, in order, so a request that hangs (a stalled
// stream, a slow server, a network that drops packets without closing) used to hold
// every sentence after it until the session was stopped. The watchdog gives each call
// a deadline for its first words and for every gap between words; a call that misses
// one is cancelled, and a call that never said anything is tried once more.

import { AppError, ExternalServiceError } from '@/shared/errors';

export interface WatchdogLimits {
  /** Longest wait for the first words of a translation */
  firstWordsMs: number;
  /** Longest silence between two pieces of a translation already under way */
  stallMs: number;
}

/**
 * A translation normally shows its first words well under a second after it is asked
 * for; past a few seconds the request is stuck, not slow, and a fresh one is faster.
 */
export const TRANSLATE_LIMITS: Readonly<WatchdogLimits> = { firstWordsMs: 4000, stallMs: 4000 };
/** A call that failed before writing anything is tried this many times in all */
export const TRANSLATE_ATTEMPTS = 2;

/** One translation call, cancelled through `signal` */
export type TranslateCall = (
  signal: AbortSignal,
  onDelta: (chunk: string) => void,
) => Promise<void>;

/**
 * A missed deadline. Built on demand, not as a subclass: a class extending an imported one
 * would run at import time, before a test that mocks the errors module can provide it.
 */
export function translationTimeout(phase: 'first words' | 'stall', ms: number): AppError {
  return new ExternalServiceError(
    `Translation timed out waiting for ${phase} (${ms} ms)`,
    'errors.connectionFailed',
  );
}

/**
 * A translation with no words after this long is usually stuck behind a slow server, not
 * long to write: a second identical request goes out, and whichever speaks first is kept
 * (the other is cancelled). Most of the freezes that ended with captions arriving all at
 * once were one such request holding every sentence after it.
 */
export const HEDGE_AFTER_MS = 1500;

/**
 * `call`, raced against a copy of itself started `afterMs` later if the first has said
 * nothing by then. The first to give a piece of text wins and is the only one heard; the
 * other is aborted. Fails only when every request started has failed (with the last error).
 * A cancelled loser reports no usage, so the extra request costs a few unbilled tokens.
 */
export function hedged(call: TranslateCall, afterMs: number = HEDGE_AFTER_MS): TranslateCall {
  return (signal, onDelta) =>
    new Promise<void>((resolve, reject) => {
      const controllers: AbortController[] = [];
      let winner: number | null = null;
      let failed = 0;
      let settled = false;

      const abortOthers = (keep: number | null): void =>
        controllers.forEach((controller, index) => index !== keep && controller.abort());
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        abortOthers(winner);
        if (error === undefined) resolve();
        else reject(error);
      };
      const onAbort = (): void => {
        winner = null;
        finish(signal.reason ?? new DOMException('aborted', 'AbortError'));
      };
      const launch = (): void => {
        const index = controllers.length;
        const controller = new AbortController();
        controllers.push(controller);
        call(controller.signal, (chunk) => {
          if (settled) return;
          if (winner === null) {
            winner = index;
            clearTimeout(timer);
            abortOthers(index);
          }
          if (winner === index) onDelta(chunk);
        }).then(
          () => {
            // An empty answer is still an answer, unless the other one is already speaking
            if (winner === null || winner === index) {
              winner = index;
              finish();
            }
          },
          (err: unknown) => {
            if (winner === index) finish(err);
            else if (winner === null && ++failed === controllers.length) finish(err);
          },
        );
      };

      if (signal.aborted) {
        reject(signal.reason as unknown);
        return;
      }
      // Armed before the first launch: a call that answers at once clears it
      const timer = setTimeout(() => {
        if (!settled && winner === null) launch();
      }, afterMs);
      signal.addEventListener('abort', onAbort, { once: true });
      launch();
    });
}

/** Worth asking again: a timeout, a network failure or a server error; never a refusal. */
export function isRetryable(err: unknown): boolean {
  return err instanceof AppError && err.status >= 500;
}

/**
 * Runs `call` under the deadlines. Rejects with a translationTimeout() error when one is
 * missed (the call itself is aborted and anything it says afterwards is ignored), or
 * with the parent's abort reason when the whole run is cancelled.
 */
export function watchTranslation(
  call: TranslateCall,
  parent: AbortSignal,
  onDelta: (chunk: string) => void,
  limits: Readonly<WatchdogLimits> = TRANSLATE_LIMITS,
): Promise<void> {
  if (parent.aborted) return Promise.reject(parent.reason as unknown);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parent.removeEventListener('abort', onParentAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    const onParentAbort = (): void => {
      controller.abort(parent.reason);
      finish(parent.reason);
    };
    const arm = (phase: 'first words' | 'stall', ms: number): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Settle first: the call may reject with an AbortError we must not report instead
        finish(translationTimeout(phase, ms));
        controller.abort();
      }, ms);
    };

    parent.addEventListener('abort', onParentAbort, { once: true });
    arm('first words', limits.firstWordsMs);
    call(controller.signal, (chunk) => {
      if (settled) return;
      arm('stall', limits.stallMs);
      onDelta(chunk);
    }).then(
      () => finish(),
      (err: unknown) => finish(err ?? new ExternalServiceError('Translation failed')),
    );
  });
}
