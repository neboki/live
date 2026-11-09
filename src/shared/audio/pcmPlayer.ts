// Plays streamed PCM16 (the interpreter's voice, OpenAI speech) without gaps: each chunk
// is scheduled right after the previous one on one AudioContext. A short cushion absorbs
// network jitter. Like an interpreter who has fallen behind, it speaks a little faster
// until it has caught up; only a long backlog (after a pause) is skipped.

import { logError } from '@/shared/errors';
import { TARGET_SAMPLE_RATE } from './pcm';

export interface PcmPlayer {
  /** Queues a chunk; volume is read for each chunk (0..MAX_VOLUME) */
  play: (pcm: Int16Array) => void;
  /** Cuts what is playing and what is queued */
  stop: () => void;
  /** Stops and releases the audio device */
  close: () => void;
  /** Resolves once everything queued has played, or was stopped */
  whenDrained: () => Promise<void>;
}

/** Cushion before a stretch of audio starts; the jitter of the chunks after it is absorbed */
export const LEAD_SECONDS = 0.15;
/** Queued audio beyond this plays faster, until less than CAUGHT_UP_SECONDS is left */
export const CATCH_UP_SECONDS = 1;
export const CAUGHT_UP_SECONDS = 0.4;
/** Hardly audible; a second of backlog is gone in about eight seconds */
export const CATCH_UP_RATE = 1.12;
/** Behind by more than this: skip ahead instead of lagging */
export const MAX_LAG_SECONDS = 3;
/** Up to twice as loud: synthetic voices are mastered quiet; a limiter keeps peaks clean */
export const MAX_VOLUME = 2;

/**
 * One output opened during a tap (see unlockAudioOutput), shared by every player. Safari
 * only lets audio play from a context created or resumed inside a user gesture; the
 * voice's first chunk arrives seconds after Start was pressed, too late to open one.
 */
let shared: AudioContext | null = null;

/**
 * Opens (or wakes) the shared audio output. Call it synchronously from a click or tap,
 * before anything is awaited. A short silent buffer is played: iOS wants a sound started
 * in the gesture, not only a resume().
 */
export function unlockAudioOutput(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    if (!shared || shared.state === 'closed') {
      shared = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    }
    if (shared.state === 'suspended')
      void shared.resume().catch((err: unknown) => logError('Audio output blocked', err));
    const silence = shared.createBufferSource();
    silence.buffer = shared.createBuffer(1, 1, TARGET_SAMPLE_RATE);
    silence.connect(shared.destination);
    silence.start();
  } catch (err) {
    logError('Could not open the audio output', err);
  }
}

export function createPcmPlayer(getVolume: () => number = () => 1): PcmPlayer {
  let context: AudioContext | null = null;
  /** The context is this player's own, not the shared one: close() may close it */
  let owned = false;
  let gain: GainNode | null = null;
  /** When the next chunk starts, in the context's time */
  let playAt = 0;
  let rate = 1;
  let sources: AudioBufferSourceNode[] = [];
  let drained: (() => void)[] = [];

  function ensure(): { ctx: AudioContext; out: GainNode } | null {
    if (context && gain) return { ctx: context, out: gain };
    try {
      const open = shared && shared.state !== 'closed' ? shared : null;
      owned = open === null;
      context = open ?? new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      gain = context.createGain();
      // Above 100% the peaks would clip: a fast limiter holds them just under full scale
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      gain.connect(limiter);
      limiter.connect(context.destination);
      return { ctx: context, out: gain };
    } catch (err) {
      logError('Could not open the audio output', err);
      return null;
    }
  }

  function settleDrained(): void {
    if (sources.length) return;
    const waiting = drained;
    drained = [];
    waiting.forEach((resolve) => resolve());
  }

  function cut(): void {
    for (const source of sources) {
      try {
        source.onended = null;
        source.stop();
      } catch (err) {
        logError('Stopping the voice failed', err);
      }
    }
    sources = [];
    settleDrained();
  }

  /** Where the next chunk starts and how fast it plays, from how much is still queued */
  function schedule(now: number): number {
    const backlog = playAt - now;
    if (backlog > MAX_LAG_SECONDS) cut();
    if (backlog <= 0 || backlog > MAX_LAG_SECONDS) {
      playAt = now + LEAD_SECONDS;
      rate = 1;
    } else if (backlog > CATCH_UP_SECONDS) {
      rate = CATCH_UP_RATE;
    } else if (backlog < CAUGHT_UP_SECONDS) {
      rate = 1;
    }
    return playAt;
  }

  function play(pcm: Int16Array): void {
    if (!pcm.length) return;
    const audio = ensure();
    if (!audio) return;
    const { ctx, out } = audio;
    if (ctx.state === 'suspended')
      void ctx.resume().catch((err: unknown) => logError('Audio output blocked', err));
    const buffer = ctx.createBuffer(1, pcm.length, TARGET_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = (pcm[i] ?? 0) / 0x8000;
    out.gain.value = Math.min(MAX_VOLUME, Math.max(0, getVolume()));
    const start = schedule(ctx.currentTime);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(out);
    source.onended = (): void => {
      sources = sources.filter((item) => item !== source);
      settleDrained();
    };
    source.start(start);
    playAt = start + buffer.duration / rate;
    sources.push(source);
  }

  function stop(): void {
    cut();
    playAt = 0;
    rate = 1;
  }

  function close(): void {
    stop();
    const ctx = context;
    const out = gain;
    context = null;
    gain = null;
    // The shared output stays open for the other players: only this player's part goes
    if (!owned) {
      out?.disconnect();
      return;
    }
    if (ctx)
      void ctx.close().catch((err: unknown) => logError('Closing the audio output failed', err));
  }

  function whenDrained(): Promise<void> {
    if (!sources.length) return Promise.resolve();
    return new Promise<void>((resolve) => drained.push(resolve));
  }

  return { play, stop, close, whenDrained };
}
