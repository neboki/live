import { type AppError, ExternalServiceError, logError } from '@/shared/errors';
import {
  BACKOFF_JITTER_MS,
  BACKOFF_MS,
  RECONNECT_BUDGET_MS,
  STABLE_CONNECTION_MS,
} from '../config';
import { shut } from './realtimeSocket';

export interface ReconnectOptions {
  /** Names the socket in the logs: "Transcription", "Interpreter" */
  label: string;
  open: () => Promise<WebSocket>;
  isStopped: () => boolean;
  /** Takes a freshly opened socket into the session (calls `connected()` itself) */
  attach: (socket: WebSocket) => void;
  /** After the new socket is attached */
  onReconnected: () => void;
  /** Before each retry that follows a failed attempt */
  onRetry?: () => void;
  /** Out of attempts or out of time */
  onGiveUp: (error: AppError) => void;
}

export interface Reconnector {
  /** A socket was attached: a drop after this long counts as a fresh failure */
  connected: () => void;
  /** The socket closed without being asked to: try again with backoff */
  dropped: () => void;
  /** Stops a pending attempt */
  cancel: () => void;
}

/**
 * Reopens a realtime socket with backoff and jitter, within a total time budget. Only a socket
 * that stayed up earns a fresh budget; one that drops at once keeps backing off.
 */
export function createReconnector(options: ReconnectOptions): Reconnector {
  const { label } = options;
  let timer = 0;
  let startedAt = 0;
  /** When the current socket opened, and which reconnect attempt opened it (-1: the first) */
  let connectedAt = 0;
  let openedBy = -1;

  function schedule(attempt: number): void {
    const delay = BACKOFF_MS[attempt];
    if (delay === undefined || Date.now() - startedAt + delay > RECONNECT_BUDGET_MS) {
      options.onGiveUp(
        logError(
          `${label} reconnect gave up`,
          new ExternalServiceError(`${label} socket closed`, 'errors.connectionLost'),
        ),
      );
      return;
    }
    if (attempt > 0) options.onRetry?.();
    const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
    timer = window.setTimeout(() => void reconnect(attempt), delay + jitter);
  }

  async function reconnect(attempt: number): Promise<void> {
    timer = 0;
    try {
      const next = await options.open();
      if (options.isStopped()) {
        shut(next);
        return;
      }
      openedBy = attempt;
      options.attach(next);
      options.onReconnected();
    } catch (err) {
      if (options.isStopped()) return;
      logError(`${label} reconnect attempt ${attempt + 1} failed`, err);
      schedule(attempt + 1);
    }
  }

  return {
    connected: () => {
      connectedAt = Date.now();
    },
    dropped: () => {
      if (openedBy < 0 || Date.now() - connectedAt >= STABLE_CONNECTION_MS) {
        startedAt = Date.now();
        schedule(0);
      } else {
        schedule(openedBy + 1);
      }
    },
    cancel: () => {
      window.clearTimeout(timer);
      timer = 0;
    },
  };
}
