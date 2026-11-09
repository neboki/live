import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CATCH_UP_RATE,
  CATCH_UP_SECONDS,
  LEAD_SECONDS,
  MAX_VOLUME,
  createPcmPlayer,
} from './pcmPlayer';

class FakeSource {
  buffer: { duration: number } | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stopped = false;
  connect = vi.fn();
  start(at: number): void {
    this.startedAt = at;
  }
  stop(): void {
    this.stopped = true;
  }
  /** The audio thread finished it */
  end(): void {
    this.onended?.();
  }
}

class FakeContext {
  static last: FakeContext | null = null;
  currentTime = 0;
  state = 'running';
  sources: FakeSource[] = [];
  gain = { gain: { value: 1 }, connect: vi.fn() };
  destination = {};
  constructor() {
    FakeContext.last = this;
  }
  createGain(): typeof this.gain {
    return this.gain;
  }
  createDynamicsCompressor(): Record<string, unknown> {
    const param = (): { value: number } => ({ value: 0 });
    return {
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect: vi.fn(),
    };
  }
  createBuffer(
    _channels: number,
    length: number,
    rate: number,
  ): {
    duration: number;
    getChannelData: () => Float32Array;
  } {
    return { duration: length / rate, getChannelData: () => new Float32Array(length) };
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

/** 24 000 samples a second: `seconds` of audio */
function chunk(seconds: number): Int16Array {
  return new Int16Array(Math.round(seconds * 24_000)).fill(1000);
}

function ctx(): FakeContext {
  const context = FakeContext.last;
  if (!context) throw new Error('No audio context');
  return context;
}

describe('createPcmPlayer', () => {
  beforeEach(() => {
    FakeContext.last = null;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts behind a short cushion and schedules the chunks back to back', () => {
    const player = createPcmPlayer();
    player.play(chunk(0.2));
    player.play(chunk(0.2));
    const [first, second] = ctx().sources;
    expect(first?.startedAt).toBeCloseTo(LEAD_SECONDS);
    expect(second?.startedAt).toBeCloseTo(LEAD_SECONDS + 0.2);
    expect(first?.playbackRate.value).toBe(1);
  });

  it('keeps the cushion after a gap in the stream', () => {
    const player = createPcmPlayer();
    player.play(chunk(0.2));
    // The chunk is long gone: the next one would start in the past
    ctx().currentTime = 2;
    player.play(chunk(0.2));
    expect(ctx().sources[1]?.startedAt).toBeCloseTo(2 + LEAD_SECONDS);
  });

  it('speaks a little faster while far behind, then at normal speed again', () => {
    const player = createPcmPlayer();
    for (let i = 0; i < 6; i++) player.play(chunk(0.2));
    // More than CATCH_UP_SECONDS queued: the next chunks play faster and take less time
    const fast = ctx().sources.at(-1);
    expect(fast?.playbackRate.value).toBe(CATCH_UP_RATE);
    const queued = ctx().sources.reduce((at, s) => Math.max(at, s.startedAt ?? 0), 0);
    expect(queued).toBeGreaterThan(CATCH_UP_SECONDS);
    // Time passes until little is left: the pace is normal again
    ctx().currentTime = queued;
    player.play(chunk(0.2));
    expect(ctx().sources.at(-1)?.playbackRate.value).toBe(1);
  });

  it('skips ahead, cutting what was queued, when the backlog is too long', () => {
    const player = createPcmPlayer();
    // Faster and faster behind, the backlog still passes MAX_LAG_SECONDS at the 17th chunk
    for (let i = 0; i < 16; i++) player.play(chunk(0.2));
    const queued = ctx().sources.slice();
    expect(queued.some((source) => source.stopped)).toBe(false);
    player.play(chunk(0.2));
    expect(queued.every((source) => source.stopped)).toBe(true);
    expect(ctx().sources.at(-1)?.startedAt).toBeCloseTo(LEAD_SECONDS);
  });

  it('reads the volume for each chunk', () => {
    let volume = 0.5;
    const player = createPcmPlayer(() => volume);
    player.play(chunk(0.1));
    expect(ctx().gain.gain.value).toBe(0.5);
    volume = 1.5;
    player.play(chunk(0.1));
    expect(ctx().gain.gain.value).toBe(1.5);
    volume = 5;
    player.play(chunk(0.1));
    expect(ctx().gain.gain.value).toBe(MAX_VOLUME);
  });

  it('resolves whenDrained once every chunk has ended', async () => {
    const player = createPcmPlayer();
    await expect(player.whenDrained()).resolves.toBeUndefined();
    player.play(chunk(0.1));
    player.play(chunk(0.1));
    let drained = false;
    void player.whenDrained().then(() => (drained = true));
    ctx().sources[0]?.end();
    await Promise.resolve();
    expect(drained).toBe(false);
    ctx().sources[1]?.end();
    await Promise.resolve();
    expect(drained).toBe(true);
  });

  it('stop() cuts the queue and releases whoever waits for it', async () => {
    const player = createPcmPlayer();
    player.play(chunk(0.1));
    const drained = player.whenDrained();
    player.stop();
    await expect(drained).resolves.toBeUndefined();
    expect(ctx().sources[0]?.stopped).toBe(true);
    player.play(chunk(0.1));
    expect(ctx().sources[1]?.startedAt).toBeCloseTo(LEAD_SECONDS);
  });

  it('close() stops and closes the context', () => {
    const player = createPcmPlayer();
    player.play(chunk(0.1));
    player.close();
    expect(ctx().close).toHaveBeenCalled();
  });

  it('resumes a suspended context and ignores empty chunks', () => {
    const player = createPcmPlayer();
    player.play(new Int16Array(0));
    expect(FakeContext.last).toBeNull();
    player.play(chunk(0.1));
    ctx().state = 'suspended';
    player.play(chunk(0.1));
    expect(ctx().resume).toHaveBeenCalled();
  });
});
