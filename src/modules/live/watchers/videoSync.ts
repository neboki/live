// The shared tab shown behind time, in step with the captions (see ../utils/sync).
//
// While the "sync" option is on and the share allows it, the tab's picture and sound
// play in the page a fixed number of seconds behind real time, the one the user chose,
// and the captions the picture has reached are listed under it. The delay never follows
// the captions' latency: like a live broadcast, everything runs that far behind and
// stays there, so the picture never stutters; a caption slower than the delay simply
// shows a little late. The lag is polled while it plays, for the status line and for
// the captions.

import { computed, ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import type { SessionLine } from '@/modules/session';
import type { AudioCapture } from '@/shared/audio/audioCapture';
import { PACE_MS, type DelayedPlayback } from '@/shared/media/delayedPlayback';
import type { OverlayStore } from '../pipeline/types';
import { linesReached } from '../utils/sync';

export interface VideoSyncDeps {
  capture: Pick<AudioCapture, 'canSyncOriginal' | 'syncOriginal' | 'unsyncOriginal'>;
  overlay: Pick<OverlayStore, 'canSyncVideo' | 'syncVideo' | 'syncDelay'>;
  /** The session's lines so far, in the order heard */
  lines: () => readonly SessionLine[];
  now?: () => number;
}

export interface VideoSync {
  /** The tab playing behind time; null while the option is off or it can't be done */
  playback: ShallowRef<DelayedPlayback | null>;
  /** Seconds the picture is behind real time; null while its buffer fills */
  lagSeconds: Ref<number | null>;
  /** Paused by the user */
  paused: Ref<boolean>;
  /** Seconds it is held back, as the user chose; null while it is not playing */
  delaySeconds: Ref<number | null>;
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
  now = () => Date.now(),
}: VideoSyncDeps): VideoSync {
  const playback = shallowRef<DelayedPlayback | null>(null);
  const lagSeconds = ref<number | null>(null);
  const paused = ref(false);
  const delaySeconds = ref<number | null>(null);
  const failed = ref(false);
  /** Advances with each poll, so `reached` follows the picture */
  const clock = ref(0);
  let poll: ReturnType<typeof setInterval> | undefined;

  const reached = computed(() => {
    const lag = lagSeconds.value;
    if (lag === null) return [];
    return linesReached(lines(), lag * 1000, clock.value);
  });

  function tick(): void {
    lagSeconds.value = playback.value?.lagSeconds() ?? null;
    paused.value = playback.value?.paused() ?? false;
    clock.value = now();
  }

  function release(): void {
    clearInterval(poll);
    poll = undefined;
    capture.unsyncOriginal();
    playback.value = null;
    lagSeconds.value = null;
    paused.value = false;
    delaySeconds.value = null;
  }

  /** Starts, retunes or ends the delayed playback to match the option and the chosen delay */
  function apply(): void {
    if (!overlay.canSyncVideo || !overlay.syncVideo) {
      if (playback.value) release();
      return;
    }
    const seconds = overlay.syncDelay;
    const next = capture.syncOriginal(seconds);
    if (next === null) {
      // Not something to retry: the option goes away for this session
      failed.value = true;
      overlay.canSyncVideo = false;
      release();
      return;
    }
    delaySeconds.value = seconds;
    if (playback.value === next) return;
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

  return { playback, lagSeconds, paused, delaySeconds, failed, reached, started, ended };
}
