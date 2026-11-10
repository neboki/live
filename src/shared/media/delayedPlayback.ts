// Plays a live stream a chosen number of seconds behind real time, picture and sound.
//
// The stream is recorded in short chunks (MediaRecorder) and fed to a video element
// through Media Source Extensions, which keep them in a buffer the element plays from.
// Holding the playhead that many seconds behind the end of the buffer is the delay:
// the same technique as a live television stream, inside one tab. Once there it plays
// at normal speed and is left alone: the delay stays fixed, so picture and sound run
// smoothly. Only a real slip (a stall, a hidden tab) of more than a couple of seconds
// is corrected, once, by a jump or by holding the picture. Choosing another delay moves
// it straight there. The user can also pause it and go on from there, further behind,
// until they ask to catch up. And it can wait for a caption that is late: the picture
// holds where it is and goes on once the caption is there, further behind, as a video
// does while it buffers. Lowered by glideTo() instead, it gets there by playing a little
// faster for a while, so nothing is skipped: how a delay found by measuring settles in.

import { logError } from '@/shared/errors';

export interface DelayedPlayback {
  readonly element: HTMLVideoElement;
  /** How far behind real time the picture is, in seconds; null while the buffer fills */
  lagSeconds: () => number | null;
  /** Paused by the user (not by a buffer that is filling) */
  paused: () => boolean;
  setDelay: (seconds: number) => void;
  /**
   * Moves to a shorter delay by playing slightly faster until it is there, skipping
   * nothing; a longer one is reached as setDelay() does, by holding the picture
   */
  glideTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /** Holds the picture; the stream keeps being recorded behind it */
  pause: () => void;
  /** Goes on from where it was paused: that much further behind, until catchUp() */
  resume: () => void;
  /** Holds the picture for a late caption (true) or lets it go on (false); not a pause */
  wait: (on: boolean) => void;
  /** Held for a late caption */
  waiting: () => boolean;
  /** Back to the wanted delay, skipping what was missed */
  catchUp: () => void;
  stop: () => void;
}

/** Recording formats tried in order; the first the browser records and plays is used */
const MIME_TYPES = ['video/webm;codecs=vp8,opus', 'video/webm'];
/** Length of each recorded chunk: the granularity of the buffer */
export const CHUNK_MS = 250;
/** How often the playhead is checked against the wanted delay */
export const PACE_MS = 250;
/**
 * Within this difference from the wanted delay the playhead is left alone, at normal
 * speed. Only a real slip goes beyond it: a chunk's worth of jitter never does
 */
export const SLIP_SECONDS = 2;
/** A seek closer than this to where the playhead is would only cut the sound */
const SEEK_MIN_SECONDS = 0.25;
/** Media this far behind the playhead is dropped, so the buffer never fills up */
export const KEEP_BEHIND_SECONDS = 20;
const VIDEO_BITS_PER_SECOND = 2_500_000;
/**
 * Speed while gliding to a shorter delay: 8 % faster is hard to notice (the pitch is
 * kept) and wins back a second every 12 or so
 */
export const GLIDE_RATE = 1.08;
/** Gliding stops this close to the wanted delay */
const GLIDE_DONE_SECONDS = 0.25;

function supportedType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaSource === 'undefined') return null;
  return (
    MIME_TYPES.find(
      (type) => MediaRecorder.isTypeSupported(type) && MediaSource.isTypeSupported(type),
    ) ?? null
  );
}

/** True where the browser can record a stream and play it from a buffer (Chromium, Firefox) */
export function canDelayPlayback(): boolean {
  return supportedType() !== null;
}

function bufferedEnd(buffer: SourceBuffer): number | null {
  const { buffered } = buffer;
  return buffered.length ? buffered.end(buffered.length - 1) : null;
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError';
}

export function createDelayedPlayback(
  stream: MediaStream,
  delaySeconds: number,
  element: HTMLVideoElement = document.createElement('video'),
): DelayedPlayback {
  const type = supportedType();
  if (type === null) throw new Error('Delayed playback is not supported here');
  const mediaSource = new MediaSource();
  const url = URL.createObjectURL(mediaSource);
  const recorder = new MediaRecorder(stream, {
    mimeType: type,
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
  });
  const queue: ArrayBuffer[] = [];
  let delay = delaySeconds;
  let buffer: SourceBuffer | null = null;
  /** The buffer held the delay once and the element is playing from it */
  let playing = false;
  /** Paused by the user */
  let held = false;
  /** Held for a late caption */
  let waitingForCaption = false;
  /** Resumed after a pause: further behind than the delay, on purpose, until catchUp() */
  let behindByChoice = false;
  /** Playing faster until the playhead is the (lowered) delay behind */
  let gliding = false;
  let stopped = false;
  let reading: Promise<void> = Promise.resolve();
  /**
   * Real time (epoch seconds) of the recording's time zero: the smallest gap seen between
   * the clock and the end of the buffer as each chunk lands, i.e. the freshest chunk. The
   * end of the buffer is always a chunk behind real time; this tells by how much.
   */
  let timeZero: number | null = null;
  const pacer = setInterval(pace, PACE_MS);

  element.playsInline = true;
  element.preload = 'auto';
  element.src = url;

  function play(): void {
    if (held || waitingForCaption) return;
    element.play().catch((err: unknown) => logError('Delayed playback could not start', err));
  }

  /** Moves the playhead, unless it is already about there (a seek interrupts the sound) */
  function seekTo(time: number): void {
    if (Math.abs(element.currentTime - time) > SEEK_MIN_SECONDS) element.currentTime = time;
  }

  /** Drops what is far behind the playhead; true when a removal was started */
  function trim(target: SourceBuffer): boolean {
    const { buffered } = target;
    if (!buffered.length) return false;
    const start = buffered.start(0);
    const cutoff = element.currentTime - KEEP_BEHIND_SECONDS;
    if (cutoff - start < KEEP_BEHIND_SECONDS / 2) return false;
    target.remove(start, cutoff);
    return true;
  }

  /** A chunk just landed: where the buffer ends now is about the present */
  function markEdge(target: SourceBuffer): void {
    const end = bufferedEnd(target);
    if (end === null) return;
    const zero = Date.now() / 1000 - end;
    if (timeZero === null || zero < timeZero) timeZero = zero;
  }

  function onUpdateEnd(): void {
    if (buffer) markEdge(buffer);
    flush();
  }

  function flush(): void {
    if (stopped || !buffer || buffer.updating || trim(buffer)) return;
    const next = queue.shift();
    if (!next) return;
    try {
      buffer.appendBuffer(next);
    } catch (err) {
      if (isQuotaError(err)) {
        // A long pause filled the buffer: catch up, drop what is behind, keep the chunk
        catchUp();
        queue.unshift(next);
        if (trim(buffer)) return;
        queue.shift();
      }
      logError('Delayed playback could not keep a chunk', err);
    }
  }

  function onChunk(event: BlobEvent): void {
    // Chunks are read one after another so they reach the buffer in the order recorded
    reading = reading
      .then(() => event.data.arrayBuffer())
      .then((bytes) => {
        if (stopped) return;
        queue.push(bytes);
        flush();
      })
      .catch((err: unknown) => {
        logError('Delayed playback lost a chunk', err);
      });
  }

  function pace(): void {
    if (stopped || !buffer || held || waitingForCaption) return;
    const end = bufferedEnd(buffer);
    if (end === null) return;
    const lag = end - element.currentTime;
    if (!playing) {
      // Buffering: wait until the whole delay is there, then start that far behind
      if (lag < delay) return;
      seekTo(end - delay);
      playing = true;
      play();
      return;
    }
    if (behindByChoice) return;
    if (gliding) {
      glide(lag);
      return;
    }
    realign(end, SLIP_SECONDS);
  }

  function setRate(rate: number): void {
    if (element.playbackRate !== rate) element.playbackRate = rate;
  }

  /** One step of a glide: faster while further behind than the delay, then normal again */
  function glide(lag: number): void {
    if (lag - delay > GLIDE_DONE_SECONDS) {
      element.preservesPitch = true;
      setRate(GLIDE_RATE);
      return;
    }
    stopGlide();
  }

  function stopGlide(): void {
    gliding = false;
    setRate(1);
  }

  /**
   * Back to the wanted delay when off by more than `tolerance`: further behind, it jumps
   * ahead; too close to the live edge, the picture is held until that much is buffered
   */
  function realign(end: number, tolerance: number): void {
    const gap = end - element.currentTime - delay;
    if (gap < -tolerance) {
      element.pause();
      playing = false;
    } else if (gap > tolerance) {
      seekTo(end - delay);
    }
  }

  mediaSource.addEventListener('sourceopen', () => {
    if (stopped) return;
    try {
      // Segments mode: the recording's own timestamps place each chunk, so sound and
      // picture stay as they were recorded (sequence mode re-times every append)
      buffer = mediaSource.addSourceBuffer(type);
      buffer.addEventListener('updateend', onUpdateEnd);
      buffer.addEventListener('error', (event) =>
        logError('Delayed playback buffer failed', event),
      );
      recorder.start(CHUNK_MS);
    } catch (err) {
      logError('Delayed playback could not start recording', err);
    }
  });
  recorder.addEventListener('dataavailable', onChunk);
  recorder.addEventListener('error', (event) =>
    logError('Delayed playback recording failed', event),
  );

  function lagSeconds(): number | null {
    if (!playing || !buffer) return null;
    const end = bufferedEnd(buffer);
    if (end === null) return null;
    // Behind the end of the buffer, plus how far that end is behind real time
    const edgeLag = timeZero === null ? 0 : Math.max(0, Date.now() / 1000 - timeZero - end);
    return Math.max(0, end - element.currentTime + edgeLag);
  }

  /** Moves straight to the new delay: chosen by the user, so one jump, not a slow drift */
  function setDelay(seconds: number): void {
    const next = Math.max(0, seconds);
    if (next === delay) return;
    stopGlide();
    delay = next;
    if (stopped || !buffer || !playing || held || behindByChoice) return;
    const end = bufferedEnd(buffer);
    if (end !== null) realign(end, SEEK_MIN_SECONDS);
  }

  function glideTo(seconds: number): void {
    const next = Math.max(0, seconds);
    // Still filling the buffer, or asked for more room: nothing to win back by speed
    if (!playing || next >= delay) {
      setDelay(next);
      return;
    }
    delay = next;
    if (stopped || held || behindByChoice) return;
    gliding = true;
  }

  function setVolume(volume: number): void {
    element.volume = Math.min(1, Math.max(0, volume));
  }

  function pause(): void {
    if (stopped || held) return;
    held = true;
    stopGlide();
    element.pause();
  }

  function resume(): void {
    if (stopped || !held) return;
    held = false;
    behindByChoice = true;
    if (playing) play();
  }

  function wait(on: boolean): void {
    if (stopped || on === waitingForCaption) return;
    waitingForCaption = on;
    if (on) {
      stopGlide();
      element.pause();
      return;
    }
    // Further behind now, on purpose: it stays there until catchUp(), never jumps ahead
    behindByChoice = true;
    if (playing) play();
  }

  function catchUp(): void {
    if (stopped) return;
    const wasHeld = held || waitingForCaption;
    held = false;
    waitingForCaption = false;
    behindByChoice = false;
    stopGlide();
    if (!playing) return;
    const end = buffer ? bufferedEnd(buffer) : null;
    if (end !== null) seekTo(end - delay);
    if (wasHeld) play();
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(pacer);
    queue.length = 0;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      if (mediaSource.readyState === 'open' && !buffer?.updating) mediaSource.endOfStream();
    } catch (err) {
      logError('Delayed playback did not stop cleanly', err);
    } finally {
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    }
  }

  return {
    element,
    lagSeconds,
    paused: () => held,
    setDelay,
    glideTo,
    setVolume,
    pause,
    resume,
    wait,
    waiting: () => waitingForCaption,
    catchUp,
    stop,
  };
}
