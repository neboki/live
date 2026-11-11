import { createPcmAssembler } from '@/shared/audio/pcm';
import { createPcmPlayer, type PcmPlayer } from '@/shared/audio/pcmPlayer';
import { ExternalServiceError } from '@/shared/errors';
import type { TtsProvider } from '@/shared/speech/types';
import type { Usage } from '../types';
import { ELEVENLABS_API, OUTPUT_FORMAT } from './config';
import { elevenLabsError, elevenLabsNetworkError } from './errors';

export interface ElevenLabsTtsConfig {
  apiKey: string;
  model: string;
  /** ElevenLabs voice id */
  voice: string;
  /** 0..1, read as each chunk plays; 1 when absent */
  volume?: number;
}

/** What came before is passed for a smoother join; longer context only adds latency */
const MAX_PREVIOUS_CHARS = 300;

/** The ISO 639-1 part of a language tag ("pt-BR" → "pt"), or undefined when there is none */
function languageCode(lang: string): string | undefined {
  const code = lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return /^[a-z]{2}$/.test(code) ? code : undefined;
}

/**
 * ElevenLabs text to speech: POST /v1/text-to-speech/{voice}/stream, asked for raw PCM
 * at 24 kHz and played through the PCM player as it arrives, like the interpreter's
 * voice. Each sentence carries the one before (`previous_text`) so they join without a
 * reset in tone. `getConfig` is read on every call, so key or voice changes apply to the
 * next sentence. Every clip is reported to `onUsage` in characters, what ElevenLabs bills.
 */
export function createElevenLabsTts(
  getConfig: () => ElevenLabsTtsConfig,
  onUsage?: (usage: Usage) => void,
  player: PcmPlayer = createPcmPlayer(() => getConfig().volume ?? 1),
): TtsProvider {
  /** Bumped by stop(): a clip still streaming then stops feeding the player */
  let run = 0;
  /** Cancels the clip being downloaded, so a stop does not keep fetching it */
  let cancelCurrent: (() => void) | null = null;
  /** The last sentence read, in its language, for `previous_text` */
  let previous: { text: string; lang: string } | null = null;

  async function request(
    config: ElevenLabsTtsConfig,
    text: string,
    lang: string,
    signal?: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>> {
    const url =
      `${ELEVENLABS_API}/v1/text-to-speech/${encodeURIComponent(config.voice)}/stream` +
      `?output_format=${OUTPUT_FORMAT}`;
    const body: Record<string, unknown> = { text, model_id: config.model };
    const code = languageCode(lang);
    if (code) body.language_code = code;
    if (previous && previous.lang === lang) {
      body.previous_text = previous.text.slice(-MAX_PREVIOUS_CHARS);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw elevenLabsNetworkError(err);
    }
    if (!response.ok) {
      throw elevenLabsError(response.status, await response.text(), config.apiKey);
    }
    if (!response.body) {
      throw new ExternalServiceError('ElevenLabs returned no audio', 'errors.ttsFailed');
    }
    return response.body;
  }

  /** Feeds the clip to the player as it arrives. False when it was cut short. */
  async function stream(
    body: ReadableStream<Uint8Array>,
    myRun: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const reader = body.getReader();
    const assemble = createPcmAssembler();
    const cancel = (): void => {
      player.stop();
      void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    cancelCurrent = cancel;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (signal?.aborted || myRun !== run) {
          cancel();
          return false;
        }
        if (done) return true;
        player.play(assemble(value));
      }
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (cancelCurrent === cancel) cancelCurrent = null;
    }
  }

  async function speak(text: string, lang: string, signal?: AbortSignal): Promise<void> {
    if (!text.trim() || signal?.aborted) return;
    const config = getConfig();
    const myRun = run;
    const body = await request(config, text, lang, signal);
    // The clip is generated, and billed, whether or not it is played to the end
    onUsage?.({
      model: config.model,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      characters: text.length,
    });
    previous = { text, lang };
    try {
      if (await stream(body, myRun, signal)) await player.whenDrained();
    } catch (err) {
      if (signal?.aborted || myRun !== run) return;
      throw elevenLabsNetworkError(err);
    }
  }

  function stop(): void {
    run++;
    previous = null;
    cancelCurrent?.();
    player.stop();
  }

  function close(): void {
    run++;
    player.close();
  }

  return { speak, stop, close };
}
