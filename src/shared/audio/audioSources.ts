// Where the captured audio comes from.
//
// A tab or screen comes through the share dialog, raw: it is already clean, and any
// processing would only damage it. A microphone hears a room, so the browser's own
// echo cancellation, noise suppression and gain control stay on: they keep a distant
// voice audible and the hum of the room out of the transcription.

import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnsupportedFeatureError,
  ValidationError,
} from '@/shared/errors';
import { isSilencedTab } from './originalMonitor';

/** What a session listens to: a shared tab or screen, the microphone, or both mixed */
export type AudioSource = 'tab' | 'mic' | 'mixed';
/** One of the inputs a source is made of */
export type AudioInput = 'tab' | 'mic';

export interface OpenedInput {
  input: AudioInput;
  stream: MediaStream;
  /** Audio tracks to listen to */
  audio: MediaStreamTrack[];
  /** Chrome silenced the shared tab, so its audio may be played back at our volume */
  silencedTab: boolean;
  /**
   * A silenced tab's picture, kept disabled (not captured) until it is shown behind
   * time with the captions. Any other share's video is already stopped.
   */
  video?: MediaStreamTrack;
}

// Chromium-only hints, not yet in lib.dom
type DisplayMediaOptions = Omit<DisplayMediaStreamOptions, 'audio'> & {
  audio: MediaTrackConstraints & { suppressLocalAudioPlayback?: boolean };
  systemAudio?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
};

export const AUDIO_SOURCES: readonly AudioSource[] = ['tab', 'mic', 'mixed'];

const DISPLAY_MEDIA_OPTIONS: DisplayMediaOptions = {
  video: true, // required by browsers, discarded right away
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    // A shared tab goes quiet; we play it back ourselves at the volume the user wants
    suppressLocalAudioPlayback: true,
  },
  systemAudio: 'include',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
};

/** The picture is only shown in a page column: a modest size keeps the delay cheap */
const SYNC_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24 },
};

const MIC_PROCESSING: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

/** True when the source needs the share dialog (unavailable on phones) */
export function needsShare(source: AudioSource): boolean {
  return source !== 'mic';
}

/** True when the source listens to a microphone */
export function usesMic(source: AudioSource): boolean {
  return source !== 'tab';
}

/** i18n key of why a session ended when this input went away */
export function endedMessageKey(input: AudioInput): string {
  return input === 'mic' ? 'errors.micEnded' : 'errors.audioEnded';
}

/** i18n key shown while a session starts: the share dialog, or only the microphone prompt */
export function startingMessageKey(source: AudioSource): string {
  return needsShare(source) ? 'start.starting' : 'start.startingMic';
}

export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

export function canUseMic(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function isDomError(err: unknown, ...names: string[]): err is DOMException {
  return err instanceof DOMException && names.includes(err.name);
}

function shareError(err: unknown): unknown {
  if (isDomError(err, 'NotAllowedError')) {
    return new ForbiddenError(
      'Screen sharing was cancelled or blocked',
      'errors.shareCancelled',
      err,
    );
  }
  return err;
}

function micError(err: unknown): unknown {
  if (isDomError(err, 'NotAllowedError', 'SecurityError')) {
    return new ForbiddenError('Microphone access was denied', 'errors.micDenied', err);
  }
  if (isDomError(err, 'NotFoundError', 'OverconstrainedError')) {
    return new NotFoundError('No microphone was found', 'errors.noMic', err);
  }
  if (isDomError(err, 'NotReadableError', 'AbortError')) {
    return new AppError('The microphone is busy or failed', {
      userMessageKey: 'errors.micBusy',
      cause: err,
    });
  }
  return err;
}

/**
 * Asks the browser to stay on this page once a tab is shared, instead of bringing the
 * shared tab to the front: the captions (and the synced picture) are here. Where the
 * browser cannot (no CaptureController), it switches as it always did.
 */
function stayHere(): CaptureController | undefined {
  if (typeof CaptureController === 'undefined') return undefined;
  try {
    const controller = new CaptureController();
    controller.setFocusBehavior('no-focus-change');
    return controller;
  } catch (err) {
    console.warn('[Neboki Live] Could not keep the focus on the page', err);
    return undefined;
  }
}

/**
 * Opens the share dialog. Calls getDisplayMedia before awaiting anything, so it
 * still counts as the user's click.
 */
export async function openTab(): Promise<OpenedInput> {
  if (!canShareScreen()) {
    throw new UnsupportedFeatureError('getDisplayMedia', 'errors.captureUnsupported');
  }
  const controller = stayHere();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(
      controller ? { ...DISPLAY_MEDIA_OPTIONS, controller } : DISPLAY_MEDIA_OPTIONS,
    );
  } catch (err) {
    throw shareError(err);
  }
  const audio = stream.getAudioTracks();
  const [first] = audio;
  if (!first) {
    stream.getTracks().forEach((track) => track.stop());
    throw new ValidationError('No audio was shared', 'errors.noAudio');
  }
  // Only a silenced tab may be played back, and only then is its picture worth keeping
  const [video] = stream.getVideoTracks();
  const silencedTab = isSilencedTab(video, first);
  if (!silencedTab || !video) {
    stream.getVideoTracks().forEach((track) => track.stop());
    return { input: 'tab', stream, audio, silencedTab };
  }
  video.enabled = false;
  // A preference, not a requirement: the picture is fine at whatever size it comes
  video.applyConstraints(SYNC_VIDEO).catch(() => undefined);
  return { input: 'tab', stream, audio, silencedTab, video };
}

/**
 * Opens a microphone; `deviceId` is only a preference, so an unplugged one falls back
 * to the system default instead of failing.
 */
export async function openMic(deviceId?: string): Promise<OpenedInput> {
  if (!canUseMic()) {
    throw new UnsupportedFeatureError('getUserMedia', 'errors.micUnsupported');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...MIC_PROCESSING, deviceId: { ideal: deviceId } } : MIC_PROCESSING,
    });
  } catch (err) {
    throw micError(err);
  }
  const audio = stream.getAudioTracks();
  if (!audio.length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new NotFoundError('The microphone delivered no audio', 'errors.noMic');
  }
  return { input: 'mic', stream, audio, silencedTab: false };
}
