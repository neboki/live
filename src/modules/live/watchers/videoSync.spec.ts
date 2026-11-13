import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import type { SessionLine } from '@/modules/session';
import { PACE_MS, type DelayedPlayback } from '@/shared/media/delayedPlayback';
import { SYNC_DELAY_AUTO } from '@/modules/overlay';
import type { ComingCaption } from '../pipeline/types';
import { AUTO_SECONDS } from '../utils/sync';
import { createVideoSync, type VideoSyncDeps } from './videoSync';

/** The delay the user chose */
const DELAY = 5;

interface FakePlayback extends DelayedPlayback {
  lag: number | null;
  held: boolean;
}

function fakePlayback(): FakePlayback {
  const playback: FakePlayback = {
    lag: null,
    held: false,
    element: document.createElement('video'),
    lagSeconds: () => playback.lag,
    paused: () => playback.held,
    setDelay: vi.fn(),
    glideTo: vi.fn(),
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
  coming: { value: ComingCaption | null };
} {
  const now = { value: 100_000 };
  const coming: { value: ComingCaption | null } = { value: null };
  const lines: SessionLine[] = [];
  const overlay = reactive({
    canSyncVideo: false,
    syncVideo: false,
    syncDelay: DELAY,
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
    captionComing: () => coming.value,
    now: () => now.value,
  };
  return { deps, capture, overlay, lines, now, coming };
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

  it('shows a caption on its sentence as it is written, before its line is finished', async () => {
    const playback = fakePlayback();
    const { deps, overlay, lines, now, coming } = setup(playback);
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    lines.push(line(96_000, 94_000));
    playback.lag = 5;

    // The first words of the next sentence came back; the picture (at 96 000) is not there yet
    coming.value = { from: 97_000, text: 'Hola', speaker: 1 };
    now.value = 101_000;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.reached.value).toEqual([lines[0]]);

    // At 97 500 it is: the words written so far show, and grow as more arrive
    now.value = 102_500;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.reached.value.at(-1)).toMatchObject({
      from: 97_000,
      translation: 'Hola',
      speaker: 1,
    });
    coming.value = { from: 97_000, text: 'Hola a todos', speaker: 1 };
    now.value = 102_750;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.reached.value.at(-1)).toMatchObject({ from: 97_000, translation: 'Hola a todos' });

    // Finished, the recorded line takes its place: it is not shown twice
    lines.push({ at: 99_000, from: 97_000, source: 's', translation: 'Hola a todos.' });
    coming.value = null;
    now.value = 103_000;
    vi.advanceTimersByTime(PACE_MS);
    expect(sync.reached.value).toEqual(lines);
    sync.ended();
  });

  it('never stops or moves the picture for a caption, however late it is', async () => {
    const playback = fakePlayback();
    const { deps, lines, overlay, now, coming } = setup(playback);
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    playback.lag = DELAY;

    // Sentences whose captions take 9 s, with a chosen delay of 5 s
    for (let from = 100_000; from < 160_000; from += 6000) {
      now.value = from + 8000;
      coming.value = { from, text: 'tarde' };
      vi.advanceTimersByTime(PACE_MS);
      now.value = from + 9000;
      coming.value = null;
      lines.push(line(from + 4000, from));
      vi.advanceTimersByTime(PACE_MS);
    }

    expect(playback.pause).not.toHaveBeenCalled();
    expect(playback.catchUp).not.toHaveBeenCalled();
    expect(playback.setDelay).not.toHaveBeenCalled();
    // A chosen delay stays as chosen: only the automatic one is raised
    expect(playback.glideTo).not.toHaveBeenCalled();
    expect(sync.delaySeconds.value).toBe(DELAY);
    // Late, the captions still show, as soon as they exist
    expect(sync.reached.value).toEqual(lines);
    sync.ended();
  });

  it('on auto, starts at a delay known beforehand: nothing is measured while the picture waits', async () => {
    const playback = fakePlayback();
    const { deps, capture, overlay, lines, now } = setup(playback);
    overlay.syncDelay = SYNC_DELAY_AUTO;
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    expect(capture.syncOriginal).toHaveBeenCalledWith(AUTO_SECONDS);
    expect(sync.delaySeconds.value).toBe(AUTO_SECONDS);

    // Quick captions do not lower it, and nothing is retuned as they come
    playback.lag = AUTO_SECONDS;
    for (let from = 100_500; from < 130_000; from += 3000) {
      lines.push(line(from + 2000, from));
      now.value = from + 3000;
      vi.advanceTimersByTime(PACE_MS);
    }
    expect(sync.delaySeconds.value).toBe(AUTO_SECONDS);
    expect(playback.glideTo).not.toHaveBeenCalled();
    expect(playback.setDelay).not.toHaveBeenCalled();
    expect(capture.syncOriginal).toHaveBeenCalledTimes(1);
    sync.ended();
  });

  it('on auto, raises the delay by gliding once captions keep landing late, and never lowers it', async () => {
    const playback = fakePlayback();
    const { deps, overlay, lines, now, coming } = setup(playback);
    overlay.syncDelay = SYNC_DELAY_AUTO;
    const sync = createVideoSync(deps);
    overlay.syncVideo = true;
    sync.started();
    await nextTick();
    playback.lag = AUTO_SECONDS;
    /** The first words of a caption show `wait` ms after its sentence began at `from` */
    function arrives(from: number, wait: number): void {
      coming.value = { from, text: 'x' };
      now.value = from + wait;
      vi.advanceTimersByTime(PACE_MS);
      // Its line is recorded later: the wait counted is the one to its first words
      coming.value = null;
      lines.push(line(from + 1000, from));
      now.value = from + wait + 2000;
      vi.advanceTimersByTime(PACE_MS);
    }
    arrives(100_000, 5000);
    arrives(110_000, 6000);
    expect(playback.glideTo).not.toHaveBeenCalled();

    // One slow caption shows late; the delay stays
    arrives(120_000, 10_000);
    expect(sync.delaySeconds.value).toBe(AUTO_SECONDS);

    // A second one: the delay covers the slowest (10.4 s + room, to the half second)
    arrives(135_000, 10_400);
    expect(playback.glideTo).toHaveBeenLastCalledWith(12);
    expect(sync.delaySeconds.value).toBe(12);
    // Reached without stopping or jumping
    expect(playback.setDelay).not.toHaveBeenCalled();
    expect(playback.pause).not.toHaveBeenCalled();

    // Quick captions again: it stays where it is
    playback.lag = 12;
    arrives(150_000, 3000);
    arrives(160_000, 3000);
    arrives(170_000, 3000);
    expect(sync.delaySeconds.value).toBe(12);
    expect(playback.glideTo).toHaveBeenCalledTimes(1);
    sync.ended();
  });
});
