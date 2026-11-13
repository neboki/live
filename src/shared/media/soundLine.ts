// The sound of a captured tab, played a chosen number of seconds late.
//
// The sound goes through a delay line of the Web Audio API: what comes in leaves exactly
// that much later, sample after sample. Nothing in it can stall, skip or run dry, which
// is the point: a recording of picture and sound together stops its sound whenever its
// picture has a gap, and a live recording has them (a still tab, a busy computer). So the
// picture is recorded and played on its own, silent, and follows this line.

import { logError } from '@/shared/errors';

export interface SoundLine {
  /** Changes the delay: at once, or evenly over `overSeconds` (a slight change of pitch) */
  setDelay: (seconds: number, overSeconds?: number) => void;
  /** 0 mutes it, 1 plays it as loud as the tab would */
  setVolume: (volume: number) => void;
  /** Silences it without losing its place (the picture is paused) */
  mute: (on: boolean) => void;
  stop: () => void;
}

/** The longest delay the line can hold, in seconds */
export const MAX_SOUND_DELAY_SECONDS = 60;
/** A change of volume takes this long, so it never clicks */
const FADE_SECONDS = 0.05;

/**
 * The delayed sound of `stream`, playing from now on; null where it has no sound or the
 * browser has no Web Audio (the sound then stays with the picture).
 */
export function soundLine(stream: MediaStream, delaySeconds: number): SoundLine | null {
  if (typeof AudioContext === 'undefined' || typeof stream.getAudioTracks !== 'function') {
    return null;
  }
  const tracks = stream.getAudioTracks();
  if (!tracks.length) return null;
  let context: AudioContext;
  try {
    context = new AudioContext({ latencyHint: 'playback' });
  } catch (err) {
    logError('Could not delay the original sound', err);
    return null;
  }
  const source = context.createMediaStreamSource(new MediaStream(tracks));
  const line = context.createDelay(MAX_SOUND_DELAY_SECONDS);
  const level = context.createGain();
  const within = (seconds: number): number =>
    Math.min(MAX_SOUND_DELAY_SECONDS, Math.max(0, seconds));
  line.delayTime.value = within(delaySeconds);
  source.connect(line).connect(level).connect(context.destination);
  // Started from the user's Start click, so the browser lets it play
  context.resume().catch((err: unknown) => logError('Could not play the delayed sound', err));
  let volume = 1;
  let muted = false;

  function applyLevel(): void {
    level.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, FADE_SECONDS / 3);
  }

  function setDelay(seconds: number, overSeconds = 0): void {
    const at = context.currentTime;
    line.delayTime.cancelScheduledValues(at);
    if (overSeconds <= 0) {
      line.delayTime.setValueAtTime(within(seconds), at);
      return;
    }
    line.delayTime.setValueAtTime(line.delayTime.value, at);
    line.delayTime.linearRampToValueAtTime(within(seconds), at + overSeconds);
  }

  function setVolume(next: number): void {
    volume = Math.min(1, Math.max(0, next));
    applyLevel();
  }

  function mute(on: boolean): void {
    muted = on;
    applyLevel();
  }

  function stop(): void {
    source.disconnect();
    line.disconnect();
    level.disconnect();
    context.close().catch((err: unknown) => logError('The delayed sound did not close', err));
  }

  return { setDelay, setVolume, mute, stop };
}
