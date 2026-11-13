import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_MS,
  GLIDE_FAST_RATE,
  GLIDE_SLOW_RATE,
  PACE_MS,
  SLIP_SECONDS,
  canDelayPlayback,
  createDelayedPlayback,
} from './delayedPlayback';

type Listener = (event: unknown) => void;

class FakeSourceBuffer {
  mode = 'segments';
  updating = false;
  /** [start, end] of what is buffered */
  range: [number, number] | null = null;
  /** Stretches buffered before `range`, each followed by a gap */
  earlier: Array<[number, number]> = [];
  appended: ArrayBuffer[] = [];
  removed: Array<[number, number]> = [];
  failWith: Error | null = null;
  private listeners = new Map<string, Listener>();
  buffered = {
    length: 0,
    start: (index: number) => this.all()[index]?.[0] ?? 0,
    end: (index: number) => this.all()[index]?.[1] ?? 0,
  };

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  appendBuffer(bytes: ArrayBuffer): void {
    if (this.failWith) throw this.failWith;
    this.updating = true;
    this.appended.push(bytes);
  }

  remove(start: number, end: number): void {
    this.updating = true;
    this.removed.push([start, end]);
  }

  private all(): Array<[number, number]> {
    return [...this.earlier, ...(this.range ? [this.range] : [])];
  }

  /** What the element has of the stream */
  hold(start: number, end: number): void {
    this.range = [start, end];
    this.buffered.length = this.all().length;
  }

  /** The recording has gaps: these stretches came before what is held now */
  holdEarlier(...ranges: Array<[number, number]>): void {
    this.earlier = ranges;
    this.buffered.length = this.all().length;
  }

  /** The browser finished the append or the removal */
  settle(): void {
    this.updating = false;
    this.listeners.get('updateend')?.(new Event('updateend'));
  }

  fail(): void {
    this.listeners.get('error')?.(new Event('error'));
  }
}

class FakeMediaSource {
  static last: FakeMediaSource | null = null;
  static isTypeSupported = vi.fn(() => true);
  static failAdd = false;
  readyState = 'closed';
  buffer: FakeSourceBuffer | null = null;
  ended = false;
  private listeners = new Map<string, Listener>();

  constructor() {
    FakeMediaSource.last = this;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  addSourceBuffer(): FakeSourceBuffer {
    if (FakeMediaSource.failAdd) throw new Error('NotSupportedError');
    this.buffer = new FakeSourceBuffer();
    return this.buffer;
  }

  endOfStream(): void {
    this.ended = true;
  }

  /** The element attached the source */
  open(): void {
    this.readyState = 'open';
    this.listeners.get('sourceopen')?.(new Event('sourceopen'));
  }
}

class FakeMediaRecorder {
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported = vi.fn(() => true);
  state = 'inactive';
  timeslice: number | null = null;
  private listeners = new Map<string, Listener>();

  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string },
  ) {
    FakeMediaRecorder.last = this;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  start(timeslice: number): void {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop(): void {
    this.state = 'inactive';
  }

  /** A chunk of the recording is ready */
  async emit(bytes: ArrayBuffer): Promise<void> {
    this.listeners.get('dataavailable')?.({ data: { arrayBuffer: async () => bytes } });
    // The chain reads the blob, then queues it: a few microtasks, more after an earlier chunk
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }

  fail(): void {
    this.listeners.get('error')?.(new Event('error'));
  }
}

interface FakeVideo {
  currentTime: number;
  playbackRate: number;
  volume: number;
  src: string;
  playsInline: boolean;
  preload: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
}

function fakeVideo(): FakeVideo {
  return {
    currentTime: 0,
    playbackRate: 1,
    volume: 1,
    src: '',
    playsInline: false,
    preload: '',
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
  };
}

const bytes = (n: number): ArrayBuffer => new Uint8Array([n]).buffer;

function create(delay = 3): {
  video: FakeVideo;
  playback: ReturnType<typeof createDelayedPlayback>;
} {
  const video = fakeVideo();
  const playback = createDelayedPlayback(
    {} as MediaStream,
    delay,
    video as unknown as HTMLVideoElement,
  );
  return { video, playback };
}

/** Opens the source and returns its buffer */
function opened(): FakeSourceBuffer {
  FakeMediaSource.last?.open();
  const buffer = FakeMediaSource.last?.buffer;
  if (!buffer) throw new Error('no buffer');
  return buffer;
}

describe('delayedPlayback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('MediaSource', FakeMediaSource);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:tab'),
      revokeObjectURL: vi.fn(),
    });
    FakeMediaSource.isTypeSupported.mockReturnValue(true);
    FakeMediaRecorder.isTypeSupported.mockReturnValue(true);
    FakeMediaSource.failAdd = false;
    FakeMediaSource.last = null;
    FakeMediaRecorder.last = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is possible where the browser records and plays the same format', () => {
    expect(canDelayPlayback()).toBe(true);
    FakeMediaSource.isTypeSupported.mockReturnValue(false);
    expect(canDelayPlayback()).toBe(false);
    FakeMediaSource.isTypeSupported.mockReturnValue(true);
    FakeMediaRecorder.isTypeSupported.mockReturnValue(false);
    expect(canDelayPlayback()).toBe(false);
    expect(() => create()).toThrow(/not supported/);
    vi.unstubAllGlobals();
    expect(canDelayPlayback()).toBe(false);
  });

  it('records in short chunks once the source opens and keeps them in order', async () => {
    const { video, playback } = create();
    expect(video.src).toBe('blob:tab');
    expect(video.playsInline).toBe(true);
    const recorder = FakeMediaRecorder.last;
    expect(recorder?.state).toBe('inactive');

    const buffer = opened();
    // Segments mode: the recording's own timestamps place the chunks
    expect(buffer.mode).toBe('segments');
    expect(recorder?.state).toBe('recording');
    expect(recorder?.timeslice).toBe(CHUNK_MS);
    expect(recorder?.options.mimeType).toBe('video/webm;codecs=vp8,opus');

    await recorder?.emit(bytes(1));
    await recorder?.emit(bytes(2));
    // The second waits for the first append to finish
    expect(buffer.appended).toEqual([bytes(1)]);
    buffer.settle();
    expect(buffer.appended).toEqual([bytes(1), bytes(2)]);
    playback.stop();
  });

  it('starts that many seconds behind the live edge once they are buffered', () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 2);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.play).not.toHaveBeenCalled();
    expect(playback.lagSeconds()).toBeNull();

    buffer.hold(0, 3.5);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(0.5);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(playback.lagSeconds()).toBe(3);
    playback.stop();
  });

  it('counts how far the end of the buffer is behind real time in the lag', () => {
    const { playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    buffer.settle(); // a chunk landed: the end of the buffer is now
    vi.advanceTimersByTime(PACE_MS);
    expect(playback.lagSeconds()).toBe(3 + PACE_MS / 1000);
    // No chunk for a while: the picture is that much further behind real time
    vi.advanceTimersByTime(PACE_MS);
    expect(playback.lagSeconds()).toBeCloseTo(3 + (2 * PACE_MS) / 1000);
    buffer.hold(0, 10 + (2 * PACE_MS) / 1000);
    buffer.settle();
    expect(playback.lagSeconds()).toBeCloseTo(3 + (2 * PACE_MS) / 1000);
    playback.stop();
  });

  it('plays at normal speed and leaves the delay alone, however the chunks jitter', () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(7);

    // Up to the slip tolerance either way: no seek, no change of speed
    video.currentTime = 7 - SLIP_SECONDS + 0.1;
    vi.advanceTimersByTime(PACE_MS);
    video.currentTime = 7 + SLIP_SECONDS - 0.1;
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(7 + SLIP_SECONDS - 0.1);
    expect(video.playbackRate).toBe(1);
    expect(video.pause).not.toHaveBeenCalled();
    playback.stop();
  });

  it('corrects a real slip: jumps when too far behind, plays slower when too close', () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);

    video.currentTime = 7 - SLIP_SECONDS - 1; // stalled: far back
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(7);

    video.currentTime = 7 + SLIP_SECONDS + 0.5; // too close to the live edge
    vi.advanceTimersByTime(PACE_MS * 2);
    // Never held for it: it goes on, a little slower, until the delay is there again
    expect(video.pause).not.toHaveBeenCalled();
    expect(playback.lagSeconds()).not.toBeNull();
    expect(video.playbackRate).toBe(GLIDE_SLOW_RATE);
    buffer.hold(0, 12.5);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(9.5);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.playbackRate).toBe(1);
    playback.stop();
  });

  it('moves straight to a delay the user chose, in one jump or one hold', () => {
    const { video, playback } = create(5);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(5);

    playback.setDelay(3); // shorter: jumps ahead at once
    expect(video.currentTime).toBe(7);

    playback.setDelay(8); // longer: the picture waits until that much is buffered
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(playback.lagSeconds()).toBeNull();
    buffer.hold(0, 15);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(7);
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(playback.lagSeconds()).toBe(8);

    playback.setDelay(8); // the same: nothing moves
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(video.playbackRate).toBe(1);
    playback.stop();
  });

  it('pauses for the user and goes on from there, further behind, until asked to catch up', () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(playback.paused()).toBe(false);

    playback.pause();
    expect(playback.paused()).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
    playback.pause();
    expect(video.pause).toHaveBeenCalledTimes(1);
    // Meanwhile the stream goes on being recorded; the picture stays and the lag grows
    buffer.hold(0, 30);
    vi.advanceTimersByTime(PACE_MS * 4);
    expect(video.currentTime).toBe(7);
    expect(playback.lagSeconds()).toBe(23);

    playback.resume();
    expect(playback.paused()).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(2);
    // Far behind the delay by choice: no jump, no hurry
    vi.advanceTimersByTime(PACE_MS * 4);
    expect(video.currentTime).toBe(7);
    expect(video.playbackRate).toBe(1);

    playback.catchUp();
    expect(video.currentTime).toBe(27);
    expect(video.play).toHaveBeenCalledTimes(2);
    // Back under the pacer's care
    video.currentTime = 20;
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(27);

    // Caught up straight from a pause: plays again
    playback.pause();
    playback.catchUp();
    expect(playback.paused()).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(3);
    playback.stop();
  });

  it('catches up when a long pause fills the buffer, and keeps the chunk', async () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    playback.pause();
    buffer.hold(0, 200);
    buffer.failWith = new DOMException('full', 'QuotaExceededError');

    await FakeMediaRecorder.last?.emit(bytes(1));
    expect(video.currentTime).toBe(197);
    expect(playback.paused()).toBe(false);
    expect(buffer.removed).toEqual([[0, 177]]);
    buffer.failWith = null;
    buffer.hold(177, 200);
    buffer.settle();
    expect(buffer.appended).toEqual([bytes(1)]);
    playback.stop();
  });

  it('drops what is far behind the playhead before taking more', async () => {
    const { video, playback } = create();
    const buffer = opened();
    buffer.hold(0, 55);
    video.currentTime = 50;
    await FakeMediaRecorder.last?.emit(bytes(1));
    expect(buffer.removed).toEqual([[0, 30]]);
    expect(buffer.appended).toEqual([]);
    buffer.hold(30, 55);
    buffer.settle();
    expect(buffer.appended).toEqual([bytes(1)]);
    playback.stop();
  });

  it('sets the volume within range and stops cleanly, once', async () => {
    const { video, playback } = create();
    const buffer = opened();
    playback.setVolume(1.5);
    expect(video.volume).toBe(1);
    playback.setVolume(-1);
    expect(video.volume).toBe(0);

    playback.stop();
    expect(FakeMediaRecorder.last?.state).toBe('inactive');
    expect(FakeMediaSource.last?.ended).toBe(true);
    expect(video.pause).toHaveBeenCalled();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tab');

    // Nothing moves afterwards
    await FakeMediaRecorder.last?.emit(bytes(1));
    vi.advanceTimersByTime(PACE_MS * 4);
    expect(buffer.appended).toEqual([]);
    expect(video.play).not.toHaveBeenCalled();
    playback.stop();
    expect(video.load).toHaveBeenCalledTimes(1);
  });

  it('logs what the browser refuses instead of throwing', async () => {
    FakeMediaSource.failAdd = true;
    const first = create();
    FakeMediaSource.last?.open();
    expect(console.error).toHaveBeenCalledTimes(1);
    first.playback.stop();

    FakeMediaSource.failAdd = false;
    const { playback } = create();
    const buffer = opened();
    buffer.failWith = new Error('NotSupportedError');
    await FakeMediaRecorder.last?.emit(bytes(1));
    buffer.fail();
    FakeMediaRecorder.last?.fail();
    expect(console.error).toHaveBeenCalledTimes(4);
    playback.stop();
  });

  it('glides to a shorter delay by playing a little faster, skipping nothing', () => {
    const { video, playback } = create(10);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(0);

    playback.glideTo(4);
    vi.advanceTimersByTime(PACE_MS);
    // No jump: the playhead stays, the picture plays faster
    expect(video.currentTime).toBe(0);
    expect(video.playbackRate).toBe(GLIDE_FAST_RATE);

    // Close enough to the new delay: back to normal speed, and kept there
    video.currentTime = 5.9;
    vi.advanceTimersByTime(PACE_MS);
    expect(video.playbackRate).toBe(1);
    expect(video.currentTime).toBe(5.9);
    playback.stop();
  });

  it('glides to a longer delay by playing a little slower: it never stops or jumps', () => {
    const { video, playback } = create(4);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(6);
    expect(video.play).toHaveBeenCalledTimes(1);

    playback.glideTo(8);
    // 4 s short of the new delay, far more than a slip: it goes on playing, only slower
    for (let end = 10.25; end < 20; end += 0.25) {
      buffer.hold(0, end);
      video.currentTime = end - 4;
      vi.advanceTimersByTime(PACE_MS);
      expect(video.currentTime).toBe(end - 4);
    }
    expect(video.playbackRate).toBe(GLIDE_SLOW_RATE);
    expect(video.pause).not.toHaveBeenCalled();
    expect(playback.lagSeconds()).not.toBeNull();

    // There: back to normal speed, and kept at the new delay
    buffer.hold(0, 30);
    video.currentTime = 22.1;
    vi.advanceTimersByTime(PACE_MS);
    expect(video.playbackRate).toBe(1);
    vi.advanceTimersByTime(PACE_MS * 4);
    expect(video.currentTime).toBe(22.1);
    expect(video.pause).not.toHaveBeenCalled();
    playback.stop();
  });

  it('fills up to a delay set while it is still buffering', () => {
    const { video, playback } = create(10);
    const buffer = opened();
    buffer.hold(0, 4);
    playback.glideTo(3);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(1);
    expect(video.playbackRate).toBe(1);
    playback.stop();
  });

  it('stops gliding when paused or sent back to live', () => {
    const { video, playback } = create(10);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    playback.glideTo(4);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.playbackRate).toBe(GLIDE_FAST_RATE);

    playback.pause();
    expect(video.playbackRate).toBe(1);
    playback.catchUp();
    expect(video.currentTime).toBe(6);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.playbackRate).toBe(1);
    playback.stop();
  });

  it('starts past a gap of the recording instead of in the stretch before it', () => {
    const { video } = create(3);
    const buffer = opened();
    // The first chunk, a gap, then the rest: 3 s behind the end falls in the gap
    buffer.holdEarlier([0, 0.9]);
    buffer.hold(1.9, 4.5);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(1.9);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('jumps over a gap the playhead runs into, at once', () => {
    const { video, playback } = create(3);
    const buffer = opened();
    buffer.hold(0, 10);
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(7);

    // The tab stopped painting for a while: nothing was recorded between 8 and 9.5
    buffer.holdEarlier([0, 8]);
    buffer.hold(9.5, 11);
    video.currentTime = 7.95;
    vi.advanceTimersByTime(PACE_MS);
    expect(video.currentTime).toBe(9.5);
    expect(video.pause).not.toHaveBeenCalled();
    playback.stop();
  });
});
