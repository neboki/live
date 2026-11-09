import { base64ToPcm, pcmToBase64 } from '@/shared/audio/pcm';
import { type AppError, ExternalServiceError, logError } from '@/shared/errors';
import type {
  InterpreterCallbacks,
  InterpreterOptions,
  InterpreterProvider,
  InterpreterSession,
} from '../../types';
import { INTERPRETER_BACKLOG_SECONDS } from '../config';
import { translationSocket } from '../endpoint';
import { errorFromCode, isConfigurationError, redactKey } from '../errors';
import { createReconnector } from './realtimeReconnect';
import { detach, openSocket, shut } from './realtimeSocket';
import {
  AUDIO_DELTA,
  CLOSED,
  createAudioBacklog,
  createUsageMeter,
  INTERPRETER_DRAIN_MS,
  languageUpdate,
  SOURCE_DELTA,
  TRANSLATION_DELTA,
  type TranslationEvent,
} from './realtimeTranslateEvents';

export { INTERPRETER_DRAIN_MS } from './realtimeTranslateEvents';

function startSession(
  socket: WebSocket,
  options: InterpreterOptions,
  callbacks: InterpreterCallbacks,
): InterpreterSession {
  let ws: WebSocket | null = null;
  let language = options.language;
  /** Audio waiting for an open socket (only while reconnecting) */
  const backlog = createAudioBacklog(INTERPRETER_BACKLOG_SECONDS);
  const usage = createUsageMeter(callbacks.onUsage);
  let stopped = false;
  let announced = false;

  function send(payload: Record<string, unknown>): boolean {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function sendAudio(pcm: Int16Array): boolean {
    const sent = send({ type: 'session.input_audio_buffer.append', audio: pcmToBase64(pcm) });
    if (sent) {
      usage.add(pcm.length);
      usage.report();
    }
    return sent;
  }

  function flushBacklog(): void {
    const merged = backlog.take();
    if (merged && !sendAudio(merged)) backlog.hold(merged);
  }

  /** Every chunk goes out as it arrives, silence included: the interpreter keeps time with it */
  function append(pcm: Int16Array): void {
    if (stopped) return;
    if (!backlog.isEmpty() || !sendAudio(pcm)) backlog.hold(pcm);
  }

  function setLanguage(code: string): void {
    language = code;
    send(languageUpdate(code));
  }

  function fatal(error: AppError): void {
    stopped = true;
    teardown();
    usage.report(true);
    callbacks.onError(error);
  }

  function onServerError(event: TranslationEvent): void {
    const message = redactKey(event.error?.message ?? 'Translation failed', options.apiKey);
    const mapped = errorFromCode({
      message,
      code: event.error?.code ?? '',
      type: event.error?.type ?? '',
    });
    const error = logError('Interpreter server error', mapped ?? new ExternalServiceError(message));
    if (isConfigurationError(error) || error.userMessageKey === 'errors.noCredit') fatal(error);
    else callbacks.onError(error);
  }

  /** Handles one server event; returns its type, or null when it could not be read. */
  function onMessage(event: MessageEvent<string>): string | null {
    let message: TranslationEvent;
    try {
      message = JSON.parse(event.data) as TranslationEvent;
    } catch (err) {
      logError('Unreadable interpreter message', err);
      return null;
    }
    const delta = typeof message.delta === 'string' ? message.delta : '';
    if (message.type === 'error') onServerError(message);
    else if (message.type === SOURCE_DELTA && delta) callbacks.onSource(delta);
    else if (message.type === TRANSLATION_DELTA && delta) callbacks.onTranslation(delta);
    else if (message.type === AUDIO_DELTA && delta) callbacks.onAudio(base64ToPcm(delta));
    return message.type;
  }

  function teardown(): void {
    reconnector.cancel();
    if (ws) shut(ws);
    ws = null;
  }

  function attach(next: WebSocket): void {
    ws = next;
    reconnector.connected();
    next.onmessage = onMessage;
    next.onerror = () =>
      logError('Interpreter socket error', new ExternalServiceError('socket error'));
    next.onclose = onUnexpectedClose;
    send(languageUpdate(language));
    flushBacklog();
  }

  function onUnexpectedClose(): void {
    if (ws) detach(ws);
    ws = null;
    if (stopped) return;
    if (!announced) {
      announced = true;
      callbacks.onStatus?.('reconnecting');
    }
    reconnector.dropped();
  }

  const reconnector = createReconnector({
    label: 'Interpreter',
    open: () => openSocket(options, translationSocket),
    isStopped: () => stopped,
    attach,
    onReconnected: () => {
      if (announced) callbacks.onStatus?.('connected');
      announced = false;
    },
    onGiveUp: fatal,
  });

  /** session.close lets the interpreter finish what it heard; session.closed ends it. */
  function close(): void {
    if (stopped) return;
    stopped = true;
    reconnector.cancel();
    const current = ws;
    if (current?.readyState !== WebSocket.OPEN) {
      teardown();
      usage.report(true);
      return;
    }
    flushBacklog();
    usage.report(true);
    send({ type: 'session.close' });
    current.onclose = null;
    const timer = window.setTimeout(() => shut(current), INTERPRETER_DRAIN_MS);
    current.onmessage = (event: MessageEvent<string>): void => {
      // The type, not the text: a translation may well say "session.closed"
      if (onMessage(event) === CLOSED) {
        window.clearTimeout(timer);
        shut(current);
      }
    };
  }

  attach(socket);
  return { append, setLanguage, close };
}

/**
 * Speech translation over OpenAI's Realtime translation WebSocket (gpt-realtime-translate):
 * the original transcript, the translation and the translated voice all stream back while
 * people speak. Unlike transcription it is sent the silences too, so it bills the whole time.
 */
export const openAiInterpreter: InterpreterProvider = {
  connect: async (
    options: InterpreterOptions,
    callbacks: InterpreterCallbacks,
  ): Promise<InterpreterSession> =>
    startSession(await openSocket(options, translationSocket), options, callbacks),
};
