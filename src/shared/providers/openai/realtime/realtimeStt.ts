import { type AppError, ExternalServiceError, logError } from '@/shared/errors';
import type { SttActivity, SttCallbacks, SttOptions, SttProvider, SttSession } from '../../types';
import { DRAIN_MS, FLUSH_MS, INPUT_SAMPLE_RATE, MAX_KEYWORDS, MODELS } from '../config';
import { errorFromCode, isConfigurationError, redactKey } from '../errors';
import type { Voiceprint } from '@/shared/audio/voiceprint';
import { COMMIT_EVENT, createAudioOutbox } from './realtimeAudio';
import {
  COMMITTED,
  COMPLETED,
  DELTA,
  FAILED,
  isRecoverable,
  languageOf,
  type RealtimeEvent,
  type RealtimeUsage,
  sessionUpdate,
  toUsage,
} from './realtimeEvents';
import { createTranscriptItems } from './realtimeItems';
import { createReconnector } from './realtimeReconnect';
import { detach, openSocket, shut } from './realtimeSocket';

/** A commit sent and not yet acknowledged: what its sentence sounded like and when it began */
interface PendingCommit {
  voice: Voiceprint | null;
  startedOn: number;
}

function startSession(socket: WebSocket, options: SttOptions, callbacks: SttCallbacks): SttSession {
  const model = options.model ?? MODELS.transcription;
  const audio = createAudioOutbox();
  const items = createTranscriptItems(callbacks);
  let ws: WebSocket | null = null;
  let unbilledSamples = 0;
  /** Whether the user was told we are reconnecting (a quiet idle reconnect is not announced) */
  let announced = false;
  let flushTimer = 0;
  let stopped = false;
  /** Commits sent whose sentence the server has not acknowledged yet */
  let unacknowledged = 0;
  /** The commits not acknowledged yet, oldest first (commits are acknowledged in order) */
  let commits: PendingCommit[] = [];
  let activity: SttActivity = 'idle';

  function send(payload: Record<string, unknown>): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  /**
   * Sent as it arrives: the page sits in a background tab behind the floating window,
   * where the browser slows timers down to once a second, or even once a minute. The
   * audio chunks are not timers, so they keep the pace; the interval is only a backstop.
   */
  function append(pcm: Int16Array): void {
    if (stopped) return;
    audio.add(pcm);
    flush();
  }

  // Silence outside a sentence stays on the device; only what is sent counts for usage
  function flush(): void {
    if (!audio.hasQueued() || ws?.readyState !== WebSocket.OPEN) return;
    const batch = audio.take();
    unbilledSamples += batch.samples;
    for (const event of batch.events) send(event);
    unacknowledged += batch.events.filter((event) => event === COMMIT_EVENT).length;
    batch.voiceprints.forEach((voice, index) => {
      commits.push({ voice, startedOn: batch.starts[index] ?? Date.now() });
    });
    reportActivity();
  }

  /** Speech first (someone is talking now), then a sentence on its way, else idle */
  function reportActivity(): void {
    let next: SttActivity = 'idle';
    if (!audio.isIdle()) next = 'speech';
    else if (unacknowledged > 0 || items.hasOpen()) next = 'transcribing';
    if (next === activity) return;
    activity = next;
    callbacks.onActivity?.(next);
  }

  function configure(): void {
    send(
      sessionUpdate(model, INPUT_SAMPLE_RATE, {
        keywords: options.keywords.slice(0, MAX_KEYWORDS),
        languages: options.languages ?? [],
        topic: options.topic ?? '',
      }),
    );
  }

  function reportUsage(usage: RealtimeUsage | undefined): void {
    const report = toUsage(model, usage, unbilledSamples / INPUT_SAMPLE_RATE);
    unbilledSamples = 0;
    callbacks.onUsage?.(report);
  }

  function fatal(error: AppError): void {
    stopped = true;
    teardown();
    callbacks.onError(error);
  }

  function onServerError(event: RealtimeEvent): void {
    const message = redactKey(event.error?.message ?? 'Transcription failed', options.apiKey);
    if (isRecoverable(event)) {
      // A refused commit never gets its "committed": settle its bookkeeping here
      logError('Transcription warning', new ExternalServiceError(message));
      unacknowledged = Math.max(0, unacknowledged - 1);
      commits.shift();
      reportActivity();
      return;
    }
    const mapped = errorFromCode({
      message,
      code: event.error?.code ?? '',
      type: event.error?.type ?? '',
    });
    const error = logError(
      'Transcription server error',
      mapped ?? new ExternalServiceError(message),
    );
    // A bad key, model or setting, or no credit, won't fix itself: stop for good
    if (isConfigurationError(error) || error.userMessageKey === 'errors.noCredit') fatal(error);
    else callbacks.onError(error);
  }

  function onMessage(event: MessageEvent<string>): void {
    let message: RealtimeEvent;
    try {
      message = JSON.parse(event.data) as RealtimeEvent;
    } catch (err) {
      logError('Unreadable transcription message', err);
      return;
    }
    const id = message.item_id ?? '';
    if (message.type === 'error') {
      onServerError(message);
    } else if (message.type === COMMITTED) {
      unacknowledged = Math.max(0, unacknowledged - 1);
      const commit = commits.shift();
      items.committed(id, commit?.voice, commit?.startedOn);
    } else if (message.type === DELTA) {
      // Deltas are incremental: the tracker keeps the whole sentence so far
      items.delta(id, message.delta ?? '');
    } else if (message.type === COMPLETED) {
      reportUsage(message.usage);
      items.completed(id, message.transcript ?? '', languageOf(message));
    } else if (message.type === FAILED) {
      logError(
        'Sentence transcription failed',
        new ExternalServiceError(redactKey(message.error?.message ?? 'failed', options.apiKey)),
      );
      items.failed(id);
    }
    reportActivity();
  }

  function teardown(): void {
    window.clearInterval(flushTimer);
    reconnector.cancel();
    if (ws) shut(ws);
    ws = null;
  }

  function attach(next: WebSocket): void {
    ws = next;
    reconnector.connected();
    next.onmessage = onMessage;
    next.onerror = () =>
      logError('Transcription socket error', new ExternalServiceError('socket error'));
    next.onclose = onUnexpectedClose;
    configure();
    window.clearInterval(flushTimer);
    flushTimer = window.setInterval(flush, FLUSH_MS);
    flush();
  }

  function announce(): void {
    if (announced) return;
    announced = true;
    callbacks.onStatus?.('reconnecting');
  }

  // A quiet idle reconnect is announced only once an attempt fails
  const reconnector = createReconnector({
    label: 'Transcription',
    open: () => openSocket(options),
    isStopped: () => stopped,
    attach,
    onReconnected: () => {
      if (announced) callbacks.onStatus?.('connected');
      announced = false;
    },
    onRetry: announce,
    onGiveUp: fatal,
  });

  /**
   * No keep-alive during long silences, on purpose: the only app-level way to keep
   * the session busy is sending audio, which is billed, and the browser already
   * answers protocol pings. If the server drops an idle socket (or the session hits
   * its maximum length), it lands here like any other drop. With no sentence open
   * nothing is lost, so the reconnect stays quiet unless an attempt fails.
   */
  function onUnexpectedClose(): void {
    window.clearInterval(flushTimer);
    if (ws) detach(ws);
    ws = null;
    if (stopped) return;
    // Open sentences die with the old server buffer, so the gate forgets them too
    items.dropOpen();
    unacknowledged = 0;
    commits = [];
    if (audio.finish()) announce();
    reportActivity();
    reconnector.dropped();
  }

  /** A stop we asked for: send what's left, then listen a moment for the last sentence. */
  function close(): void {
    if (stopped) return;
    stopped = true;
    reconnector.cancel();
    window.clearInterval(flushTimer);
    const socket = ws;
    if (socket?.readyState !== WebSocket.OPEN) {
      teardown();
      return;
    }
    flush();
    // The last sentence has no print of its own: it goes to whoever was speaking
    if (audio.finish()) {
      commits.push({ voice: null, startedOn: Date.now() });
      send(COMMIT_EVENT);
    }
    socket.onclose = null;
    socket.onerror = null;
    window.setTimeout(() => {
      shut(socket);
      if (ws === socket) ws = null;
    }, DRAIN_MS);
  }

  attach(socket);
  return { append, close };
}

/**
 * Live transcription over OpenAI's Realtime WebSocket.
 * Sentences are closed client-side (see energyVad) because the live model doesn't
 * accept server VAD; silence between them is not sent (see silenceGate). A dropped
 * socket is reopened with backoff.
 */
export const openAiRealtimeStt: SttProvider = {
  connect: async (options: SttOptions, callbacks: SttCallbacks): Promise<SttSession> =>
    startSession(await openSocket(options), options, callbacks),
};
