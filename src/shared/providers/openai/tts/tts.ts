import { TARGET_SAMPLE_RATE, createPcmAssembler } from '@/shared/audio/pcm';
import { createPcmPlayer, type PcmPlayer } from '@/shared/audio/pcmPlayer';
import { ExternalServiceError } from '@/shared/errors';
import type { TtsProvider } from '@/shared/speech/types';
import type { Usage } from '../../types';
import { type OpenAiAccess, apiBase, authHeaders } from '../endpoint';
import { errorFromResponse, networkError } from '../errors';

export interface OpenAiTtsConfig extends OpenAiAccess {
  model: string;
  voice: string;
  /** 0..1, read as each chunk plays; 1 when absent */
  volume?: number;
}

/** Raw PCM16 mono at 24 kHz: it plays as it arrives, with nothing to decode first */
const RESPONSE_FORMAT = 'pcm';
/** Rough text tokens per character, for the estimate only */
const CHARS_PER_TOKEN = 4;
/** Rough speaking rate, for a clip that was cut before it had fully arrived */
const SPOKEN_CHARS_PER_SECOND = 15;

/**
 * OpenAI text to speech: POST /audio/speech, streamed, and played through the PCM player
 * as the audio arrives rather than once the whole clip is downloaded, so the first word
 * sounds about a second earlier. `getConfig` is read on every call, so key or voice changes
 * apply to the next sentence. Every generated clip is reported to `onUsage` (text tokens
 * and audio seconds, estimated).
 */
export function createOpenAiTts(
  getConfig: () => OpenAiTtsConfig,
  onUsage?: (usage: Usage) => void,
  player: PcmPlayer = createPcmPlayer(() => getConfig().volume ?? 1),
): TtsProvider {
  /** Bumped by stop(): a clip still streaming then stops feeding the player */
  let run = 0;
  /** Cancels the clip being downloaded, so a stop does not keep fetching it */
  let cancelCurrent: (() => void) | null = null;

  async function request(
    config: OpenAiTtsConfig,
    text: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const { model, voice } = config;
    const url = `${apiBase(config)}/audio/speech`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { ...authHeaders(config), 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, voice, input: text, response_format: RESPONSE_FORMAT }),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw networkError(err);
    }
    if (!response.ok) {
      throw errorFromResponse(response.status, await response.text(), config.apiKey);
    }
    if (!response.body) {
      throw new ExternalServiceError('OpenAI returned no audio', 'errors.ttsFailed');
    }
    return response.body;
  }

  /**
   * Feeds the clip to the player as it arrives. Resolves with the samples received, or
   * null when the clip was cut short (stop() or the signal).
   */
  async function stream(
    body: ReadableStream<Uint8Array>,
    myRun: number,
    signal?: AbortSignal,
  ): Promise<number | null> {
    const reader = body.getReader();
    const assemble = createPcmAssembler();
    const cancel = (): void => {
      player.stop();
      void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    cancelCurrent = cancel;
    let samples = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal?.aborted || myRun !== run) {
          cancel();
          return null;
        }
        if (done) return samples;
        const pcm = assemble(value);
        samples += pcm.length;
        player.play(pcm);
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (cancelCurrent === cancel) cancelCurrent = null;
    }
  }

  function report(model: string, text: string, seconds: number): void {
    const inputTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
    onUsage?.({ model, inputTokens, cachedInputTokens: 0, outputTokens: 0, audioSeconds: seconds });
  }

  async function speak(text: string, _lang: string, signal?: AbortSignal): Promise<void> {
    if (!text.trim() || signal?.aborted) return;
    const config = getConfig();
    const myRun = run;
    const body = await request(config, text, signal);
    let samples: number | null = null;
    try {
      samples = await stream(body, myRun, signal);
      if (samples !== null) await player.whenDrained();
    } catch (err) {
      if (signal?.aborted || myRun !== run) return;
      throw networkError(err);
    } finally {
      // The clip is generated, and billed, whether or not it is played to the end
      const seconds =
        samples === null ? text.length / SPOKEN_CHARS_PER_SECOND : samples / TARGET_SAMPLE_RATE;
      report(config.model, text, seconds);
    }
  }

  function stop(): void {
    run++;
    cancelCurrent?.();
    player.stop();
  }

  function close(): void {
    run++;
    player.close();
  }

  return { speak, stop, close };
}
