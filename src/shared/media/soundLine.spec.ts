import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SOUND_DELAY_SECONDS, soundLine } from './soundLine';

class FakeParam {
  value = 0;
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  linearRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeNode {
  delayTime = new FakeParam();
  gain = new FakeParam();
  connect = vi.fn((next: FakeNode) => next);
  disconnect = vi.fn();
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 10;
  destination = new FakeNode();
  source = new FakeNode();
  line = new FakeNode();
  level = new FakeNode();
  maxDelay = 0;
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  constructor() {
    FakeAudioContext.last = this;
  }
  createMediaStreamSource = vi.fn(() => this.source);
  createDelay = vi.fn((max: number) => {
    this.maxDelay = max;
    return this.line;
  });
  createGain = vi.fn(() => this.level);
}

function tab(tracks: unknown[] = [{}]): MediaStream {
  return { getAudioTracks: () => tracks } as unknown as MediaStream;
}

describe('soundLine', () => {
  beforeEach(() => {
    FakeAudioContext.last = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'MediaStream',
      class {
        constructor(public tracks: unknown[]) {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays the sound through a delay line set to the delay, apart from any picture', () => {
    const line = soundLine(tab(), 15);
    const context = FakeAudioContext.last;
    expect(line).not.toBeNull();
    expect(context?.maxDelay).toBe(MAX_SOUND_DELAY_SECONDS);
    expect(context?.line.delayTime.value).toBe(15);
    // tab → delay → level → speakers
    expect(context?.source.connect).toHaveBeenCalledWith(context?.line);
    expect(context?.line.connect).toHaveBeenCalledWith(context?.level);
    expect(context?.level.connect).toHaveBeenCalledWith(context?.destination);
    expect(context?.resume).toHaveBeenCalled();
  });

  it('changes the delay at once, or evenly over a while, within what the line holds', () => {
    const line = soundLine(tab(), 15);
    const delayTime = FakeAudioContext.last?.line.delayTime;
    line?.setDelay(20);
    expect(delayTime?.setValueAtTime).toHaveBeenLastCalledWith(20, 10);

    line?.setDelay(22, 40);
    expect(delayTime?.linearRampToValueAtTime).toHaveBeenLastCalledWith(22, 50);

    line?.setDelay(500);
    expect(delayTime?.setValueAtTime).toHaveBeenLastCalledWith(MAX_SOUND_DELAY_SECONDS, 10);
  });

  it('sets the volume, mutes without forgetting it, and closes when stopped', () => {
    const line = soundLine(tab(), 15);
    const context = FakeAudioContext.last;
    const gain = context?.level.gain;
    line?.setVolume(0.4);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 10, expect.any(Number));
    line?.mute(true);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, expect.any(Number));
    line?.mute(false);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 10, expect.any(Number));
    line?.setVolume(7);
    expect(gain?.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, expect.any(Number));

    line?.stop();
    expect(context?.close).toHaveBeenCalled();
  });

  it('is not there without sound to delay, or without Web Audio', () => {
    expect(soundLine(tab([]), 15)).toBeNull();
    vi.stubGlobal('AudioContext', undefined);
    expect(soundLine(tab(), 15)).toBeNull();
  });
});
