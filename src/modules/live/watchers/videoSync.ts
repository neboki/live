// The shared tab shown behind time, in step with the captions (see ../utils/sync).
//
// While the "sync" option is on and the share allows it, the tab's picture and sound
// play in the page a fixed number of seconds behind real time, and the captions the
// picture has reached show on it. The picture never stops for a caption: nothing here
// can pause it or make it jump. The delay is the one the user chose or, on "auto", one
// known beforehand that covers a whole sentence and its translation. A caption shows
// from its first translated words, where its sentence began on the picture, and fills
// in as the rest arrives; one that is late simply shows as soon as it exists. Only when
// captions keep landing late is the automatic delay raised, and the picture reaches it
// by playing slightly slower for a while, still without stopping; it is never lowered
// again. The lag is polled while it plays, for the status line and the captions.

import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { SessionLine } from '@/modules/session';
import type { AudioCapture } from '@/shared/audio/audioCapture';
import { PACE_MS, type DelayedPlayback } from '@/shared/media/delayedPlayback';
import type { ComingCaption, OverlayStore } from '../pipeline/types';
import { SYNC_DELAY_AUTO } from '@/modules/overlay';
import { AUTO_SECONDS, linesReached, raisedDelay } from '../utils/sync';

export interface VideoSyncDeps {
  capture: Pick<AudioCapture, 'canSyncOriginal' | 'syncOriginal' | 'unsyncOriginal'>;
  overlay: Pick<OverlayStore, 'canSyncVideo' | 'syncVideo' | 'syncDelay'>;
  /** The session's lines so far, in the order heard */
  lines: () => readonly SessionLine[];
  /** The caption being written right now, with the words that came so far; null: none */
  captionComing?: () => ComingCaption | null;
  now?: () => number;
}

export interface VideoSync {
  /** The tab playing behind time; null while the option is off or it can't be done */
  playback: ShallowRef<DelayedPlayback | null>;
  /** Seconds the picture is behind real time; null while its buffer fills */
  lagSeconds: Ref<number | null>;
  /** Paused by the user */
  paused: Ref<boolean>;
  /** Seconds it is held back, as chosen or as set on "auto"; null while it is not playing */
  delaySeconds: Ref<number | null>;
  /** The option was on, but the picture could not be played behind time */
  failed: Ref<boolean>;
  /** The lines the picture has reached, the one still being written last */
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
  captionComing = () => null,
  now = () => Date.now(),
}: VideoSyncDeps): VideoSync {
  const playback = shallowRef<DelayedPlayback | null>(null);
  const lagSeconds = ref<number | null>(null);
  const paused = ref(false);
  const delaySeconds = ref<number | null>(null);
  const failed = ref(false);
  /** When the picture began to be held back (epoch ms) */
  let syncedOn = 0;
  /** Lines already timed */
  let timed = 0;
  /** Start of the latest sentence whose caption was timed (epoch ms) */
  let timedFrom = 0;
  /** How long each caption took to start showing after its sentence began, in milliseconds */
  const waits: number[] = [];
  /** The automatic delay: the one known beforehand, or what it was raised to */
  let automatic = AUTO_SECONDS;
  /** Waits timed before this index were covered by the last raise of the delay */
  let raisedFrom = 0;
  /** Advances with each poll, so `reached` follows the picture */
  const clock = ref(0);
  let poll: ReturnType<typeof setInterval> | undefined;

  const reached = computed(() => {
    const lag = lagSeconds.value;
    if (lag === null) return [];
    const at = clock.value;
    const done = linesReached(lines(), lag * 1000, at);
    // The caption still being written shows too, once the picture is at its sentence
    const coming = captionComing();
    if (!coming || coming.from > at - lag * 1000) return done;
    const { from, text, speaker } = coming;
    const writing: SessionLine = {
      at,
      from,
      source: '',
      translation: text,
      ...(speaker === undefined ? {} : { speaker }),
    };
    return [...done, writing];
  });

  /** Notes how long the caption of the sentence begun at `from` took to start showing */
  function note(from: number | undefined, at: number): void {
    if (from === undefined || from < syncedOn || from <= timedFrom) return;
    timedFrom = from;
    waits.push(at - from);
  }

  /** Times the captions that began to show since the last look, from their sentence's start */
  function timeArrivals(at: number): void {
    const all = lines();
    for (; timed < all.length; timed++) note(all[timed]?.from, at);
    note(captionComing()?.from, at);
  }

  function auto(): boolean {
    return overlay.syncDelay === SYNC_DELAY_AUTO;
  }

  /**
   * On "auto", captions that keep landing late raise the delay. The picture gets there
   * by playing slightly slower, without stopping; the delay is never lowered again
   */
  function raise(current: DelayedPlayback): void {
    if (!auto()) return;
    const raised = raisedDelay(waits.slice(raisedFrom), automatic);
    if (raised === null) return;
    automatic = raised;
    raisedFrom = waits.length;
    current.glideTo(automatic);
    delaySeconds.value = automatic;
  }

  function tick(): void {
    const current = playback.value;
    const at = now();
    timeArrivals(at);
    if (current) raise(current);
    lagSeconds.value = current?.lagSeconds() ?? null;
    paused.value = current?.paused() ?? false;
    clock.value = at;
  }

  function release(): void {
    clearInterval(poll);
    poll = undefined;
    capture.unsyncOriginal();
    playback.value = null;
    lagSeconds.value = null;
    paused.value = false;
    delaySeconds.value = null;
    waits.length = 0;
    timed = 0;
    timedFrom = 0;
    automatic = AUTO_SECONDS;
    raisedFrom = 0;
  }

  /** Starts, retunes or ends the delayed playback to match the option and the chosen delay */
  function apply(): void {
    if (!overlay.canSyncVideo || !overlay.syncVideo) {
      if (playback.value) release();
      return;
    }
    if (!playback.value) {
      syncedOn = now();
      timed = lines().length;
    }
    const seconds = auto() ? automatic : overlay.syncDelay;
    const next = capture.syncOriginal(seconds);
    if (next === null) {
      // Not something to retry: the option goes away for this session
      failed.value = true;
      overlay.canSyncVideo = false;
      release();
      return;
    }
    delaySeconds.value = seconds;
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
    delaySeconds,
    failed,
    reached,
    started,
    ended,
  };
}
