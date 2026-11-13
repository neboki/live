// Plays a live stream a chosen number of seconds behind real time, picture and sound.
//
// The stream is recorded in short chunks (MediaRecorder) and fed to a video element
// through Media Source Extensions, which keep them in a buffer the element plays from.
// Holding the playhead that many seconds behind the end of the buffer is the delay:
// the same technique as a live television stream, inside one tab. Once there it plays
// at normal speed and is left alone: the delay stays fixed, so picture and sound run
// smoothly. Only a real slip (a stall, a hidden tab) of more than a couple of seconds
// is corrected: by one jump when it fell behind, by playing slightly slower when it got
// too close to the present. Choosing another delay moves
// it straight there. The user can also pause it and go on from there, further behind,
// until they ask to catch up. Nothing else ever stops it: a delay that has to change while
// it plays (glideTo) is reached by playing a little faster or slower for a while, too
// little to notice, so the picture and its sound never halt and nothing is skipped.

import { logError } from '@/shared/errors';

export interface DelayedPlayback {
  readonly element: HTMLVideoElement;
  /** How far behind real time the picture is, in seconds; null while the buffer fills */
  lagSeconds: () => number | null;
  /** Paused by the user (not by a buffer that is filling) */
  paused: () => boolean;
  setDelay: (seconds: number) => void;
  /**
   * Moves to another delay without stopping or skipping: slightly faster until it is
   * there for a shorter one, slightly slower for a longer one
   */
  glideTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  /** Holds the picture; the stream keeps being recorded behind it */
  pause: () => void;
  /** Goes on from where it was paused: that much further behind, until catchUp() */
  resume: () => void;
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
/** A playhead this close to the end of a buffered stretch that a gap follows jumps over it */
const GAP_EDGE_SECONDS = 0.1;
/** Media this far behind the playhead is dropped, so the buffer never fills up */
export const KEEP_BEHIND_SECONDS = 20;
const VIDEO_BITS_PER_SECOND = 2_500_000;
/**
 * Speeds while gliding to another delay. A change of tempo in speech is noticed from
 * about 5 % (the pitch is kept), so these stay at it: a second is won or lost every 20
 */
export const GLIDE_FAST_RATE = 1.05;
export const GLIDE_SLOW_RATE = 0.95;
/** Gliding stops this close to the wanted delay */
const GLIDE_DONE_SECONDS = 0.25;
/** Every this many checks, the trace notes where the playhead is */
const TRACE_EVERY = 20;

/**
 * Development trace of everything that moves or holds the playhead, in the console as
 * `[sync]`: tells a hold for a caption from a stall of the decoder (dropped frames,
 * `waiting`/`stalled` events) when the picture seems to skip
 */
const TRACED = import.meta.env.DEV && import.meta.env.MODE !== 'test';
function trace(what: string, detail: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console -- a development trace, never in production
  if (TRACED) console.debug(`[sync] ${what}`, detail);
}

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
  /** Resumed after a pause: further behind than the delay, on purpose, until catchUp() */
  let behindByChoice = false;
  /** Playing a little faster or slower until the playhead is the (changed) delay behind */
  let gliding = false;
  let stopped = false;
  let reading: Promise<void> = Promise.resolve();
  /**
   * Real time (epoch seconds) of the recording's time zero: the smallest gap seen between
   * the clock and the end of the buffer as each chunk lands, i.e. the freshest chunk. The
   * end of the buffer is always a chunk behind real time; this tells by how much.
   */
  let timeZero: number | null = null;
  /** Checks so far, for the periodic trace */
  let ticks = 0;
  const pacer = setInterval(pace, PACE_MS);

  element.playsInline = true;
  element.preload = 'auto';
  element.src = url;

  /** Where things stand, for the trace */
  function state(): Record<string, unknown> {
    const end = buffer ? bufferedEnd(buffer) : null;
    const quality =
      typeof element.getVideoPlaybackQuality === 'function'
        ? element.getVideoPlaybackQuality()
        : null;
    return {
      at: Number(element.currentTime.toFixed(2)),
      end: end === null ? null : Number(end.toFixed(2)),
      lag: end === null ? null : Number((end - element.currentTime).toFixed(2)),
      delay,
      rate: element.playbackRate,
      dropped: quality?.droppedVideoFrames ?? null,
      queued: queue.length,
    };
  }

  /** The element stalled on its own: not a hold of ours */
  function onStall(event: Event): void {
    trace(`element ${event.type}`, state());
  }
  const STALL_EVENTS = ['waiting', 'stalled'] as const;
  if (TRACED) STALL_EVENTS.forEach((type) => element.addEventListener(type, onStall));

  function play(): void {
    if (held) return;
    element.play().catch((err: unknown) => logError('Delayed playback could not start', err));
  }

  /**
   * The nearest time at or after `time` that is buffered: a recording can have gaps
   * (a tab that stops painting sends no frames), and a playhead put in one stays there
   */
  function playable(time: number): number {
    const ranges = buffer?.buffered;
    if (!ranges) return time;
    for (let index = 0; index < ranges.length; index++) {
      if (time < ranges.start(index)) return ranges.start(index);
      if (time <= ranges.end(index)) return time;
    }
    return time;
  }

  /** Moves the playhead, unless it is already about there (a seek interrupts the sound) */
  function seekTo(time: number): void {
    const to = playable(time);
    if (Math.abs(element.currentTime - to) <= SEEK_MIN_SECONDS) return;
    trace('seek', { ...state(), to: Number(to.toFixed(2)) });
    element.currentTime = to;
  }

  /**
   * A playhead that ran into a gap of the recording goes on from where it resumes,
   * at once, instead of standing there until the slip is large enough to be corrected
   */
  function skipGap(): void {
    const ranges = buffer?.buffered;
    if (!ranges) return;
    for (let index = 0; index < ranges.length - 1; index++) {
      const next = ranges.start(index + 1);
      if (
        element.currentTime >= ranges.end(index) - GAP_EDGE_SECONDS &&
        element.currentTime < next
      ) {
        trace('skip a gap', { ...state(), to: Number(next.toFixed(2)) });
        element.currentTime = next;
        return;
      }
    }
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
    if (stopped || !buffer || held) return;
    const end = bufferedEnd(buffer);
    if (end === null) return;
    const lag = end - element.currentTime;
    if (++ticks % TRACE_EVERY === 0) trace('playhead', state());
    if (!playing) {
      // Buffering: wait until the whole delay is there, then start that far behind
      if (lag < delay) return;
      seekTo(end - delay);
      playing = true;
      trace('start', state());
      play();
      return;
    }
    skipGap();
    if (behindByChoice) return;
    if (gliding) {
      glide(lag);
      return;
    }
    // Slipped too close to the present (the recording fell behind for a moment): it
    // drifts back by playing slower. Only a delay the user chose holds the picture
    if (lag - delay < -SLIP_SECONDS) gliding = true;
    else realign(end, SLIP_SECONDS);
  }

  function setRate(rate: number): void {
    if (element.playbackRate !== rate) element.playbackRate = rate;
  }

  /**
   * One step of a glide: faster while further behind than the delay, slower while
   * closer to the present than it, then normal again
   */
  function glide(lag: number): void {
    const off = lag - delay;
    if (Math.abs(off) > GLIDE_DONE_SECONDS) {
      const rate = off > 0 ? GLIDE_FAST_RATE : GLIDE_SLOW_RATE;
      element.preservesPitch = true;
      if (element.playbackRate !== rate) trace('glide', state());
      setRate(rate);
      return;
    }
    stopGlide();
  }

  function stopGlide(): void {
    gliding = false;
    if (element.playbackRate !== 1) trace('glide done', state());
    setRate(1);
  }

  /**
   * Back to the wanted delay when off by more than `tolerance`: further behind, it jumps
   * ahead; too close to the live edge, the picture is held until that much is buffered
   * (only when the user picks a longer delay: they asked for it there and then)
   */
  function realign(end: number, tolerance: number): void {
    const gap = end - element.currentTime - delay;
    if (gap < -tolerance) {
      trace('hold until buffered', state());
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
    if (next === delay) return;
    // Still filling the buffer: it simply fills up to the new delay
    if (!playing) {
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
    trace('paused by the user', state());
    element.pause();
  }

  function resume(): void {
    if (stopped || !held) return;
    held = false;
    behindByChoice = true;
    trace('resumed by the user', state());
    if (playing) play();
  }

  function catchUp(): void {
    if (stopped) return;
    trace('catch up', state());
    const wasHeld = held;
    held = false;
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
    if (TRACED) STALL_EVENTS.forEach((type) => element.removeEventListener(type, onStall));
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
    catchUp,
    stop,
  };
}
