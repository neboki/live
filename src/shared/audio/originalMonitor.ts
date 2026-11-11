// Plays the shared tab's own audio back in this page, at a volume we control.
//
// The tab is captured with suppressLocalAudioPlayback, so Chrome stops playing it
// itself; this element is then the only way the user hears the original. That is
// what lets the original go quiet (or softer) while the translated voice speaks,
// which no web page could otherwise do to another tab. Screen and window shares
// can't be silenced that way (the system keeps playing them), so they get no monitor.
//
// Because the page owns that sound, it can also hold it back: with the tab's picture
// the monitor can show the tab a few seconds behind real time, in step with the
// captions (see delayedPlayback). The live sound goes quiet meanwhile.

import { logError } from '@/shared/errors';
import {
  canDelayPlayback,
  createDelayedPlayback,
  type DelayedPlayback,
} from '@/shared/media/delayedPlayback';

export interface OriginalMonitor {
  /** 0 mutes the original, 1 plays it as loud as the tab would */
  setVolume: (volume: number) => void;
  /** The tab's picture came with its sound, and the browser can play it behind time */
  canDelay: boolean;
  /**
   * Shows the tab `seconds` behind real time, sound included, instead of the live
   * sound. Called again, it only changes the delay. Null where it can't be done.
   */
  delay: (seconds: number) => DelayedPlayback | null;
  /** Back to the live sound */
  undelay: () => void;
  /**
   * The tab's picture as it plays now, to show without any delay (the sound stays the
   * live one). Null without a picture. The track is captured until hidePicture()
   */
  picture: () => MediaStream | null;
  /** The live picture is no longer shown: it stops being captured, unless it is delayed */
  hidePicture: () => void;
  stop: () => void;
}

/** True when Chrome silenced the shared surface itself: only then may we play it back. */
export function isSilencedTab(
  video: MediaStreamTrack | undefined,
  audio: MediaStreamTrack,
): boolean {
  const surface = (video?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
  const silenced = (audio.getSettings() as { suppressLocalAudioPlayback?: boolean })
    .suppressLocalAudioPlayback;
  return surface === 'browser' && silenced !== false;
}

export function createOriginalMonitor(
  tracks: MediaStreamTrack[],
  video?: MediaStreamTrack,
): OriginalMonitor {
  const element = new Audio();
  element.srcObject = new MediaStream(tracks);
  element.volume = 1;
  // Started from the user's Start click, so the browser lets it play with sound
  element.play().catch((err: unknown) => logError('Could not play the original audio', err));
  const canDelay = video !== undefined && canDelayPlayback();
  let volume = 1;
  let delayed: DelayedPlayback | null = null;
  /** The live picture is being shown */
  let showing = false;

  /** The picture is only captured while something shows it */
  function capturePicture(): void {
    if (video) video.enabled = showing || delayed !== null;
  }

  function setVolume(next: number): void {
    volume = Math.min(1, Math.max(0, next));
    element.volume = volume;
    delayed?.setVolume(volume);
  }

  function delay(seconds: number): DelayedPlayback | null {
    if (!canDelay || !video) return null;
    if (delayed) {
      delayed.setDelay(seconds);
      return delayed;
    }
    try {
      // The picture is only captured while it is shown: enabling the track starts it
      video.enabled = true;
      delayed = createDelayedPlayback(new MediaStream([video, ...tracks]), seconds);
    } catch (err) {
      logError('Could not play the original behind time', err);
      capturePicture();
      return null;
    }
    delayed.setVolume(volume);
    element.muted = true;
    return delayed;
  }

  function undelay(): void {
    if (!delayed) return;
    delayed.stop();
    delayed = null;
    capturePicture();
    element.muted = false;
  }

  function picture(): MediaStream | null {
    if (!video || video.readyState !== 'live') return null;
    showing = true;
    capturePicture();
    return new MediaStream([video]);
  }

  function hidePicture(): void {
    showing = false;
    capturePicture();
  }

  function stop(): void {
    showing = false;
    undelay();
    element.pause();
    element.srcObject = null;
  }

  return { setVolume, canDelay, delay, undelay, picture, hidePicture, stop };
}
