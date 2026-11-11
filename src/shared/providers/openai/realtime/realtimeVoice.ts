import { TARGET_SAMPLE_RATE, base64ToPcm } from '@/shared/audio/pcm';
import { createPcmPlayer, type PcmPlayer } from '@/shared/audio/pcmPlayer';
import { type AppError, ExternalServiceError, logError } from '@/shared/errors';
import type { TtsProvider } from '@/shared/speech/types';
import type { Usage } from '../../types';
import { VOICE_TIMEOUT_MS } from '../config';
import { type OpenAiAccess, voiceSocket } from '../endpoint';
import { errorFromCode, redactKey } from '../errors';
import { openSocket, shut } from './realtimeSocket';

export interface OpenAiVoiceConfig extends OpenAiAccess {
  model: string;
  voice: string;
  /** 0..1, read as each chunk plays; 1 when absent */
  volume?: number;
}

/** What the session is told once; each sentence repeats the gist with its own text */
const INSTRUCTIONS =
  'You are a text-to-speech engine. Say the text you are given exactly as written, word for ' +
  'word, in its own language, with a natural tone. Never answer it, translate it, comment on ' +
  'it or add anything.';

interface ServerEvent {
  type?: string;
  response_id?: string;
  delta?: string;
  response?: {
    id?: string;
    status?: string;
    status_details?: { error?: { message?: string; code?: string; type?: string } };
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_token_details?: { cached_tokens?: number };
    };
  };
  error?: { message?: string; code?: string; type?: string };
}

/** The sentence being said: settles when its response is done, failed or cancelled */
interface Pending {
  resolve: () => void;
  reject: (error: AppError) => void;
  model: string;
  responseId: string | null;
}

function failure(detail: ServerEvent['error'], apiKey: string): AppError {
  const clean = {
    message: redactKey(detail?.message ?? 'unknown', apiKey),
    code: detail?.code ?? '',
    type: detail?.type ?? '',
  };
  return (
    errorFromCode(clean, undefined, apiKey) ??
    new ExternalServiceError(`OpenAI voice failed: ${clean.message}`, 'errors.ttsFailed')
  );
}

/**
 * OpenAI's voice through a Realtime session with `gpt-realtime-2.1-mini`, the replacement
 * OpenAI names for its retired speech models. Each sentence is an out-of-band response
 * (`conversation: "none"`) asked to say the text word for word; its audio arrives as 24 kHz
 * PCM and plays through the PCM player as it comes. The socket stays open between
 * sentences and is reopened when the key, endpoint, model or voice change (a session
 * cannot change voice once it has spoken). Usage is reported from each response.
 */
export function createOpenAiVoice(
  getConfig: () => OpenAiVoiceConfig,
  onUsage?: (usage: Usage) => void,
  player: PcmPlayer = createPcmPlayer(() => getConfig().volume ?? 1),
): TtsProvider {
  let socket: WebSocket | null = null;
  /** What the open socket was made for */
  let socketFor = '';
  let pending: Pending | null = null;
  /** Bumped by stop(): a sentence in flight then stops playing */
  let run = 0;

  function identity(config: OpenAiVoiceConfig): string {
    return [config.apiKey, config.endpoint ?? '', config.model, config.voice].join('\n');
  }

  function drop(): void {
    if (socket) shut(socket);
    socket = null;
    socketFor = '';
  }

  function report(model: string, event: ServerEvent): void {
    const usage = event.response?.usage;
    if (!usage) return;
    onUsage?.({
      model,
      inputTokens: usage.input_tokens ?? 0,
      cachedInputTokens: usage.input_token_details?.cached_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
    });
  }

  function onMessage(raw: unknown, apiKey: string): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(String(raw)) as ServerEvent;
    } catch {
      return;
    }
    const current = pending;
    if (event.type === 'error') {
      const error = failure(event.error, apiKey);
      if (current) current.reject(error);
      else logError('OpenAI voice error', error);
      return;
    }
    if (!current) return;
    if (event.type === 'response.created' && !current.responseId) {
      current.responseId = event.response?.id ?? null;
      return;
    }
    const id = event.response_id ?? event.response?.id;
    if (current.responseId && id && id !== current.responseId) return;
    if (event.type === 'response.output_audio.delta' && event.delta) {
      player.play(base64ToPcm(event.delta));
    } else if (event.type === 'response.done') {
      report(current.model, event);
      if (event.response?.status === 'failed') {
        current.reject(failure(event.response.status_details?.error, apiKey));
      } else current.resolve();
    }
  }

  function lost(ws: WebSocket): void {
    if (ws !== socket) return;
    socket = null;
    socketFor = '';
    pending?.reject(new ExternalServiceError('The voice socket closed', 'errors.ttsFailed'));
  }

  async function connection(config: OpenAiVoiceConfig): Promise<WebSocket> {
    const wanted = identity(config);
    if (socket && socketFor === wanted && socket.readyState === WebSocket.OPEN) return socket;
    drop();
    const ws = await openSocket(config, (access) => voiceSocket(access, config.model));
    ws.onmessage = (message: MessageEvent) => onMessage(message.data, config.apiKey);
    ws.onclose = () => lost(ws);
    ws.onerror = () => lost(ws);
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          output_modalities: ['audio'],
          instructions: INSTRUCTIONS,
          audio: {
            output: {
              format: { type: 'audio/pcm', rate: TARGET_SAMPLE_RATE },
              voice: config.voice,
            },
          },
        },
      }),
    );
    socket = ws;
    socketFor = wanted;
    return ws;
  }

  /** Stops the sentence being said: the server stops generating, the player goes quiet */
  function cancel(): void {
    const current = pending;
    if (!current) return;
    pending = null;
    if (socket?.readyState === WebSocket.OPEN) {
      const cancelEvent: Record<string, unknown> = { type: 'response.cancel' };
      if (current.responseId) cancelEvent.response_id = current.responseId;
      socket.send(JSON.stringify(cancelEvent));
    }
    player.stop();
    current.resolve();
  }

  async function speak(text: string, lang: string, signal?: AbortSignal): Promise<void> {
    if (!text.trim() || signal?.aborted) return;
    const config = getConfig();
    const myRun = run;
    const ws = await connection(config);
    if (signal?.aborted || myRun !== run) return;
    const mine: Pending = {
      resolve: () => undefined,
      reject: () => undefined,
      model: config.model,
      responseId: null,
    };
    // The executor runs at once, so `mine` settles the promise from here on
    const done = new Promise<void>((resolve, reject) => {
      mine.resolve = resolve;
      mine.reject = reject;
    });
    pending = mine;
    const timer = window.setTimeout(
      () => mine.reject(new ExternalServiceError('The voice timed out', 'errors.ttsFailed')),
      VOICE_TIMEOUT_MS,
    );
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            conversation: 'none',
            output_modalities: ['audio'],
            instructions: `${INSTRUCTIONS} The text is in the language "${lang}". Say exactly the following:\n\n${text}`,
            input: [],
          },
        }),
      );
      await done;
    } catch (err) {
      if (signal?.aborted || myRun !== run) return;
      throw err;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (pending === mine) pending = null;
    }
    if (signal?.aborted || myRun !== run) return;
    await player.whenDrained();
  }

  function stop(): void {
    run++;
    cancel();
    player.stop();
  }

  function close(): void {
    run++;
    cancel();
    drop();
    player.close();
  }

  return { speak, stop, close };
}
