// The shared tab shown behind time, in step with the captions (see ../utils/sync).
//
// While the "sync" option is on and the share allows it, the tab's picture and sound
// play in the page a fixed number of seconds behind real time, and the captions the
// picture has reached are listed under it. The delay is the one the user chose, or, on
// "auto", one found at the start: the picture is held while the first captions are
// timed (CALIBRATION_SECONDS at most), and once a few were, the delay is settled from
// them; a picture already playing further behind glides there, a little faster, without
// skipping anything. Either way it then stays put: like a live broadcast, everything
// runs that far behind and stays there. With the "wait" option on, a picture that reaches a sentence
// whose caption is not there yet holds until it is (as a video does while it buffers)
// and goes on from there, that much further behind; without it, the caption simply
// shows a little late. The lag is polled while it plays, for the status line, the
// captions and the waits.

import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { SessionLine } from '@/modules/session';
import type { AudioCapture } from '@/shared/audio/audioCapture';
import { PACE_MS, type DelayedPlayback } from '@/shared/media/delayedPlayback';
import type { OverlayStore } from '../pipeline/types';
import { SYNC_DELAY_AUTO } from '@/modules/overlay';
import { autoDelay, CALIBRATION_SECONDS, linesReached } from '../utils/sync';

/** A caption that never comes (music, noise) is waited for this long, then let go */
export const MAX_WAIT_MS = 12_000;
/** Beyond this many seconds behind the chosen delay, captions are no longer waited for */
export const MAX_WAIT_LAG_SECONDS = 60;

export interface VideoSyncDeps {
  capture: Pick<AudioCapture, 'canSyncOriginal' | 'syncOriginal' | 'unsyncOriginal'>;
  overlay: Pick<OverlayStore, 'canSyncVideo' | 'syncVideo' | 'syncDelay' | 'syncWait'>;
  /** The session's lines so far, in the order heard */
  lines: () => readonly SessionLine[];
  /** Where the oldest speech still without a caption began (epoch ms); null: none */
  captionDueFrom?: () => number | null;
  now?: () => number;
}

export interface VideoSync {
  /** The tab playing behind time; null while the option is off or it can't be done */
  playback: ShallowRef<DelayedPlayback | null>;
  /** Seconds the picture is behind real time; null while its buffer fills */
  lagSeconds: Ref<number | null>;
  /** Paused by the user */
  paused: Ref<boolean>;
  /** Held until a late caption arrives */
  waiting: Ref<boolean>;
  /** Seconds it is held back, as chosen or as settled on "auto"; null while it is not playing */
  delaySeconds: Ref<number | null>;
  /** The delay is set automatically, and is still being worked out */
  calibrating: Ref<boolean>;
  /** The option was on, but the picture could not be played behind time */
  failed: Ref<boolean>;
  /** The lines the picture has reached: what to show under it */
  reached: ComputedRef<SessionLine[]>;
  /** A session started: its share says whether the picture can be synced */
  started: () => void;
  /** The session ended: back to the live sound; the option stays for the next one */
  ended: () => void;
}

export function createVideoSync({
  capture,
  overlay,
  lines,
  captionDueFrom = () => null,
  now = () => Date.now(),
}: VideoSyncDeps): VideoSync {
  const playback = shallowRef<DelayedPlayback | null>(null);
  const lagSeconds = ref<number | null>(null);
  const paused = ref(false);
  const waiting = ref(false);
  const delaySeconds = ref<number | null>(null);
  const failed = ref(false);
  const calibrating = ref(false);
  /** When the picture began to be held back (epoch ms) */
  let syncedOn = 0;
  /** Lines already timed */
  let timed = 0;
  /** How long each caption took to arrive after its sentence began, in milliseconds */
  const waits: number[] = [];
  /** The automatic delay, once settled; null until then */
  let settled: number | null = null;
  /** Delay the picture is held at while it fills, once settled below what it already held */
  let filling: number | null = null;
  /** Advances with each poll, so `reached` follows the picture */
  const clock = ref(0);
  let poll: ReturnType<typeof setInterval> | undefined;
  /** When the current wait began (epoch ms) */
  let waitStartedOn = 0;
  /** A caption waited for too long: not waited for again */
  let givenUp: number | null = null;

  const reached = computed(() => {
    const lag = lagSeconds.value;
    if (lag === null) return [];
    return linesReached(lines(), lag * 1000, clock.value);
  });

  /** True when the picture has reached speech whose caption is not there yet */
  function captionLate(current: DelayedPlayback, lag: number | null, at: number): boolean {
    if (!overlay.syncWait || lag === null || current.paused()) return false;
    if (lag - (delaySeconds.value ?? overlay.syncDelay) > MAX_WAIT_LAG_SECONDS) return false;
    const due = captionDueFrom();
    if (due === null || due === givenUp || at - lag * 1000 < due) return false;
    if (current.waiting() && at - waitStartedOn > MAX_WAIT_MS) {
      givenUp = due;
      return false;
    }
    return true;
  }

  /** Holds the picture while its caption is late, and lets it go once it is there */
  function holdForCaption(current: DelayedPlayback, lag: number | null, at: number): void {
    const late = captionLate(current, lag, at);
    if (late && !current.waiting()) waitStartedOn = at;
    current.wait(late);
  }

  /** Times the captions that arrived since the last look, from their sentence's start */
  function timeArrivals(at: number): void {
    const all = lines();
    for (; timed < all.length; timed++) {
      const from = all[timed]?.from;
      if (from !== undefined && from >= syncedOn) waits.push(at - from);
    }
  }

  function auto(): boolean {
    return overlay.syncDelay === SYNC_DELAY_AUTO;
  }

  /**
   * On "auto", settles the delay once enough captions were timed. Still filling, the
   * picture starts that far behind, or as far as it already holds (nothing is skipped);
   * playing, it glides there
   */
  function settle(current: DelayedPlayback, lag: number | null, at: number): void {
    if (!auto()) return;
    settled ??= autoDelay(waits);
    calibrating.value = settled === null;
    if (settled === null) return;
    if (lag === null) {
      const held = Math.ceil(((at - syncedOn) / 1000) * 2) / 2;
      filling ??= Math.max(settled, Math.min(held, delaySeconds.value ?? held));
      if (delaySeconds.value !== filling) current.setDelay(filling);
      delaySeconds.value = filling;
      return;
    }
    if (delaySeconds.value === settled) return;
    current.glideTo(settled);
    delaySeconds.value = settled;
  }

  function tick(): void {
    const current = playback.value;
    const at = now();
    timeArrivals(at);
    if (current) settle(current, current.lagSeconds(), at);
    if (current) holdForCaption(current, current.lagSeconds(), at);
    lagSeconds.value = current?.lagSeconds() ?? null;
    paused.value = current?.paused() ?? false;
    waiting.value = current?.waiting() ?? false;
    clock.value = at;
  }

  function release(): void {
    clearInterval(poll);
    poll = undefined;
    playback.value?.wait(false);
    capture.unsyncOriginal();
    playback.value = null;
    lagSeconds.value = null;
    paused.value = false;
    waiting.value = false;
    delaySeconds.value = null;
    calibrating.value = false;
    givenUp = null;
    waits.length = 0;
    timed = 0;
    settled = null;
    filling = null;
  }

  /** Starts, retunes or ends the delayed playback to match the option and the chosen delay */
  function apply(): void {
    if (!overlay.canSyncVideo || !overlay.syncVideo) {
      if (playback.value) release();
      return;
    }
    // On "auto", a picture already held keeps its delay (the next look settles it);
    // a new one is held the longest while the first captions are timed
    const seconds = auto()
      ? playback.value
        ? (delaySeconds.value ?? CALIBRATION_SECONDS)
        : CALIBRATION_SECONDS
      : overlay.syncDelay;
    if (!playback.value) {
      syncedOn = now();
      timed = lines().length;
    }
    const next = capture.syncOriginal(seconds);
    if (next === null) {
      // Not something to retry: the option goes away for this session
      failed.value = true;
      overlay.canSyncVideo = false;
      release();
      return;
    }
    delaySeconds.value = seconds;
    calibrating.value = auto() && settled === null;
    if (playback.value === next) {
      tick();
      return;
    }
    playback.value = next;
    tick();
    poll ??= setInterval(tick, PACE_MS);
  }

  watch(() => [overlay.canSyncVideo, overlay.syncVideo, overlay.syncDelay] as const, apply);

  function started(): void {
    failed.value = false;
    overlay.canSyncVideo = capture.canSyncOriginal();
  }

  function ended(): void {
    overlay.canSyncVideo = false;
    release();
  }

  return {
    playback,
    lagSeconds,
    paused,
    waiting,
    delaySeconds,
    calibrating,
    failed,
    reached,
    started,
    ended,
  };
}
