import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import type { SessionLine } from '@/modules/session';
import { PACE_MS, type DelayedPlayback } from '@/shared/media/delayedPlayback';
import { createVideoSync, MAX_WAIT_MS, type VideoSyncDeps } from './videoSync';

/** The delay the user chose */
const DELAY = 5;

interface FakePlayback extends DelayedPlayback {
  lag: number | null;
  held: boolean;
  waitingForCaption: boolean;
}

function fakePlayback(): FakePlayback {
  const playback: FakePlayback = {
    lag: null,
    held: false,
    waitingForCaption: false,
    element: document.createElement('video'),
    lagSeconds: () => playback.lag,
    paused: () => playback.held,
    wait: vi.fn((on: boolean) => {
      playback.waitingForCaption = on;
    }),
    waiting: () => playback.waitingForCaption,
    setDelay: vi.fn(),
    setVolume: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    catchUp: vi.fn(),
    stop: vi.fn(),
  };
  return playback;
}

function line(at: number, from: number): SessionLine {
  return { at, from, source: 's', translation: 't' };
}

function setup(playback: DelayedPlayback | null = fakePlayback()): {
  deps: VideoSyncDeps;
  capture: {
    canSync: boolean;
    syncOriginal: ReturnType<typeof vi.fn>;
    unsyncOriginal: ReturnType<typeof vi.fn>;
  };
  overlay: VideoSyncDeps['overlay'];
  lines: SessionLine[];
  now: { value: number };
  due: { value: number | null };
} {
  const now = { value: 100_000 };
  const due: { value: number | null } = { value: null };
  const lines: SessionLine[] = [];
  const overlay = reactive({
    canSyncVideo: false,
    syncVideo: false,
    syncDelay: DELAY,
    syncWait: false,
  });
  const capture = {
    canSync: true,
    syncOriginal: vi.fn(() => playback),
    unsyncOriginal: vi.fn(),
  };
  const deps: VideoSyncDeps = {
    capture: {
      canSyncOriginal: () => capture.canSync,
      syncOriginal: capture.syncOriginal,
      unsyncOriginal: capture.unsyncOriginal,
    },
    overlay,
    lines: () => lines,
    captionDueFrom: () => due.value,
    now: () => now.value,
  };
  return { deps, capture, overlay, lines, now, due };
}

/** A session with the picture synced and the wait option on, playing DELAY behind */
async function waitingSetup(): Promise<{
  playback: FakePlayback;
  sync: ReturnType<typeof createVideoSync>;
  overlay: VideoSyncDeps['overlay'];
  now: { value: number };
  due: { value: number | null };
}> {
  const playback = fakePlayback();
  const { deps, overlay, now, due } = setup(playback);
  overlay.syncWait = true;
  const sync = createVideoSync(deps);
  overlay.syncVideo = true;
  sync.started();
  await nextTick();
  playback.lag = DELAY;
  return { playback, sync, overlay, now, due };
}

describe('createVideoSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays the tab behind time while the option is on and the share allows it', async () => {
    const playback = fakePlayback();
    const { deps, capture, overlay } = setup(playback);
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    await nextTick();
    // Not yet: no session has said the picture is there
    expect(capture.syncOriginal).not.toHaveBeenCalled();

    sync.started();
    await nextTick();
    expect(overlay.canSyncVideo).toBe(true);
    expect(capture.syncOriginal).toHaveBeenCalledWith(DELAY);
    expect(sync.playback.value).toBe(playback);
    expect(sync.delaySeconds.value).toBe(DELAY);
    expect(sync.lagSeconds.value).toBeNull();

    overlay.syncVideo = false;
    await nextTick();
    expect(capture.unsyncOriginal).toHaveBeenCalledTimes(1);
    expect(sync.playback.value).toBeNull();
    expect(sync.delaySeconds.value).toBeNull();
    sync.ended();
  });

  it('keeps the chosen delay whatever the captions latency, and moves only when it is changed', async () => {
    const { deps, capture, overlay } = setup();
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    expect(capture.syncOriginal).toHaveBeenCalledTimes(1);

    overlay.syncDelay = 8;
    await nextTick();
    expect(capture.syncOriginal).toHaveBeenLastCalledWith(8);
    expect(sync.delaySeconds.value).toBe(8);
    sync.ended();
  });

  it('polls the lag and lists the lines the picture has reached', async () => {
    const playback = fakePlayback();
    const { deps, overlay, lines, now } = setup(playback);
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    lines.push(line(96_000, 94_000), line(99_500, 97_500));
    expect(sync.reached.value).toEqual([]);

    playback.lag = 4;
    now.value = 100_000;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.lagSeconds.value).toBe(4);
    // The picture is at 96 000: past the first sentence's start, not the second's
    expect(sync.reached.value).toEqual([lines[0]]);

    now.value = 102_000;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.reached.value).toEqual(lines);

    // Paused by the user: the picture stays, so do the captions it had reached
    playback.held = true;
    playback.lag = 8;
    now.value = 106_000;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.paused.value).toBe(true);
    expect(sync.reached.value).toEqual(lines);

    sync.ended();
    expect(sync.lagSeconds.value).toBeNull();
    expect(sync.paused.value).toBe(false);
    expect(sync.reached.value).toEqual([]);
    expect(overlay.canSyncVideo).toBe(false);
    // No more polling after the end
    playback.lag = 5;
    vi.advanceTimersByTime(PACE_MS * 4);
    expect(sync.lagSeconds.value).toBeNull();
  });

  it('gives up for the session when the picture cannot be played behind time', async () => {
    const { deps, capture, overlay } = setup(null);
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();

    expect(sync.failed.value).toBe(true);
    expect(sync.playback.value).toBeNull();
    expect(overlay.canSyncVideo).toBe(false);
    expect(capture.unsyncOriginal).toHaveBeenCalled();

    // The next session tries again
    capture.syncOriginal.mockReturnValue(fakePlayback());
    sync.started();
    await nextTick();
    expect(sync.failed.value).toBe(false);
    expect(sync.playback.value).not.toBeNull();
    sync.ended();
  });

  it('does nothing where the share has no picture to sync', async () => {
    const { deps, capture, overlay } = setup();
    capture.canSync = false;
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();

    expect(overlay.canSyncVideo).toBe(false);
    expect(capture.syncOriginal).not.toHaveBeenCalled();
    expect(sync.playback.value).toBeNull();
  });

  describe('waiting for late captions', () => {
    it('holds the picture once it reaches speech without a caption, and goes on when it arrives', async () => {
      const { playback, sync, now, due } = await waitingSetup();
      due.value = 96_000;

      // The picture is at 95 000: the sentence has not begun on screen yet
      now.value = 100_000;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);

      // At 96 500 it has: the picture holds
      now.value = 101_500;
      vi.advanceTimersByTime(PACE_MS);
      expect(playback.wait).toHaveBeenLastCalledWith(true);
      expect(sync.waiting.value).toBe(true);

      // Held, it falls further behind; the caption arrives and it goes on
      playback.lag = 7;
      now.value = 103_500;
      due.value = null;
      vi.advanceTimersByTime(PACE_MS);
      expect(playback.wait).toHaveBeenLastCalledWith(false);
      expect(sync.waiting.value).toBe(false);
      sync.ended();
    });

    it('lets a caption that never comes go after a while, and does not wait for it again', async () => {
      const { playback, sync, now, due } = await waitingSetup();
      due.value = 90_000;
      now.value = 100_000;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(true);

      now.value = 100_000 + MAX_WAIT_MS + 1;
      playback.lag = DELAY + MAX_WAIT_MS / 1000;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);

      now.value += 1000;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);

      // The next late sentence is waited for again
      due.value = now.value - DELAY * 1000 - (MAX_WAIT_MS + 1000);
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(true);
      sync.ended();
      expect(playback.waitingForCaption).toBe(false);
    });

    it('never waits with the option off, while paused by the user, or far behind already', async () => {
      const { playback, sync, overlay, now, due } = await waitingSetup();
      due.value = 90_000;
      now.value = 100_000;

      overlay.syncWait = false;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);

      overlay.syncWait = true;
      playback.held = true;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);

      playback.held = false;
      playback.lag = DELAY + 61;
      vi.advanceTimersByTime(PACE_MS);
      expect(sync.waiting.value).toBe(false);
      sync.ended();
    });
  });
});
