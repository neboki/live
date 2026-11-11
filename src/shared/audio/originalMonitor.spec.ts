import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DelayedPlayback } from '@/shared/media/delayedPlayback';
import { createOriginalMonitor, isSilencedTab } from './originalMonitor';

const media = vi.hoisted(() => ({
  canDelay: true,
  playback: null as DelayedPlayback | null,
  create: vi.fn<(stream: unknown, seconds: number) => DelayedPlayback>(),
}));

vi.mock('@/shared/media/delayedPlayback', () => ({
  canDelayPlayback: () => media.canDelay,
  createDelayedPlayback: media.create,
}));

class FakeStream {
  constructor(readonly tracks: unknown[]) {}
}

function track(settings: Record<string, unknown> = {}): MediaStreamTrack {
  return {
    enabled: true,
    readyState: 'live',
    getSettings: () => settings,
  } as unknown as MediaStreamTrack;
}

function fakePlayback(): DelayedPlayback {
  return {
    element: document.createElement('video'),
    lagSeconds: () => null,
    paused: () => false,
    pause: vi.fn(),
    resume: vi.fn(),
    wait: vi.fn(),
    waiting: () => false,
    catchUp: vi.fn(),
    setDelay: vi.fn(),
    glideTo: vi.fn(),
    setVolume: vi.fn(),
    stop: vi.fn(),
  };
}

describe('isSilencedTab', () => {
  it('is a tab Chrome stopped playing itself', () => {
    const audio = track({ suppressLocalAudioPlayback: true });
    expect(isSilencedTab(track({ displaySurface: 'browser' }), audio)).toBe(true);
    // Chrome does not report the setting back on every version: a tab is taken as silenced
    expect(isSilencedTab(track({ displaySurface: 'browser' }), track())).toBe(true);
    expect(
      isSilencedTab(
        track({ displaySurface: 'browser' }),
        track({ suppressLocalAudioPlayback: false }),
      ),
    ).toBe(false);
    expect(isSilencedTab(track({ displaySurface: 'monitor' }), audio)).toBe(false);
    expect(isSilencedTab(undefined, audio)).toBe(false);
  });
});

describe('createOriginalMonitor', () => {
  let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeStream);
    play = vi.fn<() => Promise<void>>(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    media.canDelay = true;
    media.playback = fakePlayback();
    media.create.mockImplementation(() => {
      if (!media.playback) throw new Error('no');
      return media.playback;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('plays the tab sound at the volume asked, and stops it', () => {
    const audio = track();
    const monitor = createOriginalMonitor([audio]);
    expect(play).toHaveBeenCalledTimes(1);
    expect(monitor.canDelay).toBe(false);
    expect(monitor.delay(3)).toBeNull();

    monitor.setVolume(2);
    monitor.stop();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('can only delay with the picture and a browser that plays behind time', () => {
    media.canDelay = false;
    expect(createOriginalMonitor([track()], track()).canDelay).toBe(false);
    media.canDelay = true;
    expect(createOriginalMonitor([track()], track()).canDelay).toBe(true);
  });

  it('shows the tab behind time with its sound, then brings the live sound back', () => {
    const audio = track();
    const video = track();
    video.enabled = false;
    const monitor = createOriginalMonitor([audio], video);
    monitor.setVolume(0.5);

    const playback = monitor.delay(4);
    expect(playback).toBe(media.playback);
    expect(video.enabled).toBe(true);
    expect(media.create).toHaveBeenCalledWith(expect.any(FakeStream), 4);
    expect((media.create.mock.calls[0]?.[0] as FakeStream).tracks).toEqual([video, audio]);
    expect(playback?.setVolume).toHaveBeenCalledWith(0.5);
    // The volume keeps reaching the delayed sound
    monitor.setVolume(0.2);
    expect(playback?.setVolume).toHaveBeenLastCalledWith(0.2);

    // Called again it only moves the delay
    expect(monitor.delay(6)).toBe(playback);
    expect(playback?.setDelay).toHaveBeenCalledWith(6);
    expect(media.create).toHaveBeenCalledTimes(1);

    monitor.undelay();
    expect(playback?.stop).toHaveBeenCalledTimes(1);
    expect(video.enabled).toBe(false);
    monitor.undelay();
    expect(playback?.stop).toHaveBeenCalledTimes(1);
  });

  it('leaves the live sound alone when the delay cannot start', () => {
    media.playback = null;
    const video = track();
    const monitor = createOriginalMonitor([track()], video);
    expect(monitor.delay(4)).toBeNull();
    expect(video.enabled).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('gives the live picture, and stops capturing it once hidden', () => {
    const video = track();
    video.enabled = false;
    const monitor = createOriginalMonitor([track()], video);

    const picture = monitor.picture() as unknown as FakeStream;
    expect(picture.tracks).toEqual([video]);
    expect(video.enabled).toBe(true);

    monitor.hidePicture();
    expect(video.enabled).toBe(false);
  });

  it('keeps capturing the picture while it is delayed, whatever the live one does', () => {
    const video = track();
    const monitor = createOriginalMonitor([track()], video);
    monitor.picture();
    monitor.delay(4);
    monitor.hidePicture();
    expect(video.enabled).toBe(true);

    monitor.picture();
    monitor.undelay();
    expect(video.enabled).toBe(true);
  });

  it('has no live picture without one, or once it ended', () => {
    expect(createOriginalMonitor([track()]).picture()).toBeNull();
    const ended = track();
    (ended as { readyState: string }).readyState = 'ended';
    expect(createOriginalMonitor([track()], ended).picture()).toBeNull();
  });

  it('ends the delay with the monitor', () => {
    const video = track();
    const monitor = createOriginalMonitor([track()], video);
    const playback = monitor.delay(4);
    monitor.stop();
    expect(playback?.stop).toHaveBeenCalled();
    expect(video.enabled).toBe(false);
  });
});
