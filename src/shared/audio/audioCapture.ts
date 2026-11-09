import workletUrl from './pcmCapture.worklet.ts?worker&url';
import { AppError, logError } from '@/shared/errors';
import {
  openMic,
  openTab,
  type AudioInput,
  type AudioSource,
  type OpenedInput,
} from './audioSources';
import type { DelayedPlayback } from '@/shared/media/delayedPlayback';
import { createOriginalMonitor, type OriginalMonitor } from './originalMonitor';
import { Resampler, TARGET_SAMPLE_RATE, floatTo16BitPcm, levelFromRms, rms } from './pcm';

export interface CaptureHandlers {
  /** PCM16 mono at 24 kHz, roughly every 100 ms */
  onChunk: (pcm: Int16Array) => void;
  /** Loudness 0..1 for the UI */
  onLevel: (level: number) => void;
  /** An input went away: the user stopped sharing, or the microphone was unplugged */
  onEnded: (input: AudioInput) => void;
}

export interface CaptureOptions {
  /** A shared tab or screen by default */
  source?: AudioSource;
  /** Preferred microphone; the system default when empty */
  micDeviceId?: string;
  /** Listen to this stream instead (audio the app plays itself); `source` is then ignored */
  stream?: MediaStream;
}

export interface AudioCapture {
  start: (handlers: CaptureHandlers, options?: CaptureOptions) => Promise<AppError | null>;
  stop: () => void;
  /** After the app was in the background: true when the capture hears again */
  recover: () => Promise<boolean>;
  /** True when a tab was shared: its original audio plays through us and can be turned down */
  canControlOriginal: () => boolean;
  /** Volume of the shared tab's own audio, 0..1; ignored for screen and window shares */
  setOriginalVolume: (volume: number) => void;
  /** True when the shared tab's picture can be shown behind time, in step with the captions */
  canSyncOriginal: () => boolean;
  /** Shows the shared tab `seconds` behind real time (see OriginalMonitor.delay) */
  syncOriginal: (seconds: number) => DelayedPlayback | null;
  /** Back to the live sound of the shared tab */
  unsyncOriginal: () => void;
  /** Headphones with a microphone were found when the microphone opened */
  hasHeadset: () => boolean;
}

/** stop() ran while start() was waiting on a prompt: there is nothing to report. */
class OvertakenError extends Error {}

function toCaptureError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError('Audio capture failed', {
    userMessageKey: 'errors.captureFailed',
    cause: err,
  });
}

/**
 * At the target rate the browser resamples with proper anti-aliasing. Firefox can't
 * connect a microphone to a context running at another rate, so there the context
 * keeps the device rate and our Resampler does the work.
 */
function createSources(inputs: OpenedInput[]): {
  context: AudioContext;
  sources: MediaStreamAudioSourceNode[];
} {
  const connect = (context: AudioContext): MediaStreamAudioSourceNode[] =>
    inputs.map((opened) => context.createMediaStreamSource(new MediaStream(opened.audio)));
  const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  try {
    return { context, sources: connect(context) };
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'NotSupportedError')) throw err;
    context
      .close()
      .catch((closeErr: unknown) => logError('Closing the audio context failed', closeErr));
    const fallback = new AudioContext();
    return { context: fallback, sources: connect(fallback) };
  }
}

/** iOS unmutes the microphone a moment after the app is back, when it does at all */
const UNMUTE_WAIT_MS = 1500;

function untilUnmuted(track: MediaStreamTrack, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      track.removeEventListener('unmute', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    track.addEventListener('unmute', done);
  });
}

/** Captures a shared tab or screen, the microphone, or both mixed into one voice. */
export function createAudioCapture(): AudioCapture {
  let inputs: OpenedInput[] = [];
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let monitor: OriginalMonitor | null = null;
  let originalVolume = 1;
  /** Bumped by every stop(): a start() still waiting on a prompt knows it was overtaken */
  let generation = 0;

  function release(opened: OpenedInput[]): void {
    opened.forEach((input) => input.stream.getTracks().forEach((track) => track.stop()));
  }

  function closeContext(ctx: AudioContext | null): void {
    ctx?.close().catch((err: unknown) => logError('Closing the audio context failed', err));
  }

  function stop(): void {
    generation++;
    monitor?.stop();
    monitor = null;
    release(inputs);
    node?.port.close();
    node?.disconnect();
    closeContext(context);
    inputs = [];
    context = null;
    node = null;
  }

  /**
   * Opens what the source needs; the share dialog first, while the click still counts.
   * Nothing is kept here until everything is open: a stop() meanwhile (the user gave up
   * while the prompt was showing) must not leave a shared tab captured.
   */
  async function start(
    handlers: CaptureHandlers,
    options: CaptureOptions = {},
  ): Promise<AppError | null> {
    stop();
    const mine = generation;
    const overtaken = (): boolean => mine !== generation;
    const opened: OpenedInput[] = [];
    let ctx: AudioContext | null = null;
    try {
      const source = options.source ?? 'tab';
      if (options.stream) {
        // Audio the app plays itself (a voice note): already clean, like a shared tab
        const audio = options.stream.getAudioTracks();
        opened.push({ input: 'tab', stream: options.stream, audio, silencedTab: false });
      } else {
        if (source !== 'mic') opened.push(await openTab());
        if (overtaken()) throw new OvertakenError();
        if (source !== 'tab') opened.push(await openMic(options.micDeviceId || undefined));
      }
      if (overtaken()) throw new OvertakenError();

      const graph = createSources(opened);
      ctx = graph.context;
      // A phone may hand over a suspended context once the permission prompt took the click
      if (ctx.state === 'suspended') await ctx.resume();
      await ctx.audioWorklet.addModule(workletUrl);
      if (overtaken()) throw new OvertakenError();

      // From here on the capture owns what was opened, and stop() releases it
      inputs = opened;
      context = ctx;
      const tab = inputs.find((input) => input.silencedTab);
      if (tab) {
        monitor = createOriginalMonitor(tab.audio, tab.video);
        monitor.setVolume(originalVolume);
      }
      for (const input of inputs) {
        input.audio.forEach((track) =>
          track.addEventListener('ended', () => {
            stop();
            handlers.onEnded(input.input);
          }),
        );
      }
      node = new AudioWorkletNode(context, 'pcm-capture');
      // Several sources into one input are summed: that is the mix
      for (const src of graph.sources) src.connect(node);
      // Route through a muted gain so the graph keeps pulling audio without echoing it
      const mute = context.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(context.destination);

      const resampler = new Resampler(context.sampleRate);
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        handlers.onLevel(levelFromRms(rms(event.data)));
        handlers.onChunk(floatTo16BitPcm(resampler.process(event.data)));
      };
      return null;
    } catch (err) {
      if (inputs === opened) {
        stop();
      } else {
        release(opened);
        closeContext(ctx);
      }
      // Overtaken: whoever stopped us has already dealt with the outcome
      if (err instanceof OvertakenError) return null;
      return logError('Could not start audio capture', toCaptureError(err));
    }
  }

  function canControlOriginal(): boolean {
    return monitor !== null;
  }

  function setOriginalVolume(volume: number): void {
    originalVolume = volume;
    monitor?.setVolume(volume);
  }

  function canSyncOriginal(): boolean {
    return monitor?.canDelay ?? false;
  }

  function syncOriginal(seconds: number): DelayedPlayback | null {
    return monitor?.delay(seconds) ?? null;
  }

  function unsyncOriginal(): void {
    monitor?.undelay();
  }

  /** Back in the app: wakes the suspended audio and waits briefly for a muted track. */
  async function recover(): Promise<boolean> {
    const ctx = context;
    if (!ctx) return false;
    const tracks = inputs.flatMap((input) => input.audio);
    try {
      // iOS reports 'interrupted', outside the typings: anything but running needs it
      if (ctx.state !== 'running') await ctx.resume();
      await Promise.all(
        tracks
          .filter((track) => track.muted && track.readyState === 'live')
          .map((track) => untilUnmuted(track, UNMUTE_WAIT_MS)),
      );
    } catch (err) {
      logError('Waking the audio capture failed', err);
    }
    return (
      context === ctx &&
      ctx.state === 'running' &&
      tracks.every((track) => track.readyState === 'live' && !track.muted)
    );
  }

  function hasHeadset(): boolean {
    return inputs.some((input) => input.headset === true);
  }

  return {
    start,
    stop,
    hasHeadset,
    recover,
    canControlOriginal,
    setOriginalVolume,
    canSyncOriginal,
    syncOriginal,
    unsyncOriginal,
  };
}
