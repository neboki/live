// A copy of a captured tab whose picture arrives at a steady rate.
//
// A shared tab only sends a frame when something on it changes: a talk with slides can
// go half a minute without one. A recording of that has no picture for those stretches,
// and a player cannot play a stretch without picture: it stops there, sound included,
// or has to jump over it. Here the tab's picture is repainted on a canvas several times
// a second, changed or not, and the canvas is what gets recorded, with the tab's own
// sound untouched. The recording is then continuous whatever the tab shows.

import { logError } from '@/shared/errors';

export interface SteadyPicture {
  /** The tab's sound with the steady copy of its picture */
  stream: MediaStream;
  stop: () => void;
}

/** Frames per second of the copy: enough for a video to look like one */
export const STEADY_FPS = 24;
/** The copy is no wider than this: what the recording is encoded at anyway */
const MAX_WIDTH = 1280;
/** Size of the copy until the tab's picture says its own */
const DEFAULT_SIZE = { width: 1280, height: 720 };

/**
 * The steady copy of `stream`; null where it has no picture or the browser cannot make
 * one (the stream is then recorded as it is).
 */
export function steadyPicture(stream: MediaStream): SteadyPicture | null {
  if (typeof stream.getVideoTracks !== 'function') return null;
  const [picture] = stream.getVideoTracks();
  if (!picture) return null;
  const canvas = document.createElement('canvas');
  const paint = canvas.getContext('2d', { alpha: false });
  if (!paint || typeof canvas.captureStream !== 'function') return null;

  const source = document.createElement('video');
  source.muted = true;
  source.playsInline = true;
  source.srcObject = new MediaStream([picture]);
  source.play().catch((err: unknown) => logError('Could not read the shared picture', err));

  /** The canvas takes the picture's shape, within the width it is recorded at */
  function fit(): void {
    const width = source.videoWidth || DEFAULT_SIZE.width;
    const height = source.videoHeight || DEFAULT_SIZE.height;
    const scale = Math.min(1, MAX_WIDTH / width);
    const fitted = { width: Math.round(width * scale), height: Math.round(height * scale) };
    if (canvas.width !== fitted.width) canvas.width = fitted.width;
    if (canvas.height !== fitted.height) canvas.height = fitted.height;
  }

  /** Paints what the tab shows now; the same picture again when it did not change */
  function repaint(): void {
    if (!paint) return;
    fit();
    if (source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      paint.drawImage(source, 0, 0, canvas.width, canvas.height);
    } else {
      // Nothing came yet: black still counts as a frame, so the sound can be played
      paint.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  repaint();
  const timer = setInterval(repaint, 1000 / STEADY_FPS);
  const copy = canvas.captureStream(STEADY_FPS);

  function stop(): void {
    clearInterval(timer);
    copy.getTracks().forEach((track) => track.stop());
    source.pause();
    source.srcObject = null;
  }

  return { stream: new MediaStream([...copy.getVideoTracks(), ...stream.getAudioTracks()]), stop };
}
