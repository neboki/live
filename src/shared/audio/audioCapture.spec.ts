import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioCapture, type CaptureHandlers } from './audioCapture';

function makeHandlers(): CaptureHandlers {
  return { onChunk: vi.fn(), onLevel: vi.fn(), onEnded: vi.fn() };
}

function mockGetDisplayMedia(impl: () => Promise<unknown>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia: vi.fn(impl) },
  });
}

interface MediaDevicesMock {
  getDisplayMedia: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
}

function mockMediaDevices(
  display: () => Promise<unknown>,
  user: () => Promise<unknown>,
): MediaDevicesMock {
  const devices = { getDisplayMedia: vi.fn(display), getUserMedia: vi.fn(user) };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
  return devices;
}

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => Record<string, unknown>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string) => void;
  muted: boolean;
  readyState: string;
  fire: (type: string) => void;
}

interface FakeStream {
  stopAll: ReturnType<typeof vi.fn>;
  track: FakeTrack;
  getAudioTracks: () => unknown[];
  getVideoTracks: () => unknown[];
  getTracks: () => unknown[];
}

function fakeStream(audioTracks: number): FakeStream {
  const stopAll = vi.fn();
  const listeners = new Map<string, () => void>();
  const track: FakeTrack = {
    stop: stopAll,
    getSettings: () => ({}),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    muted: false,
    readyState: 'live',
    fire: (type) => listeners.get(type)?.(),
  };
  return {
    stopAll,
    track,
    getAudioTracks: () => Array.from({ length: audioTracks }, () => track),
    getVideoTracks: () => [track],
    getTracks: () => [track],
  };
}

/** Minimal Web Audio graph: enough for the capture to wire itself up. */
class FakeNode {
  connect(next: FakeNode): FakeNode {
    return next;
  }
  disconnect = vi.fn();
}

class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode | null = null;
  port = {
    onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null,
    close: vi.fn(),
  };
  constructor() {
    super();
    FakeWorkletNode.last = this;
  }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  readonly sampleRate: number;
  audioWorklet = { addModule: vi.fn(() => Promise.resolve()) };
  close = vi.fn(() => Promise.resolve());
  state = 'running';
  resume = vi.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  constructor(options?: { sampleRate: number }) {
    this.sampleRate = options?.sampleRate ?? 48_000;
    FakeAudioContext.last = this;
  }
  sources = 0;
  createMediaStreamSource(): FakeNode {
    this.sources++;
    return new FakeNode();
  }
  createGain(): FakeNode & { gain: { value: number } } {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }
  get destination(): FakeNode {
    return new FakeNode();
  }
}

describe('createAudioCapture', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    vi.stubGlobal('MediaStream', vi.fn());
    FakeAudioContext.last = null;
    FakeWorkletNode.last = null;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports browsers without screen capture', async () => {
    const error = await createAudioCapture().start(makeHandlers());

    expect(error?.userMessageKey).toBe('errors.captureUnsupported');
    expect(error?.status).toBe(422);
  });

  it('reports when the user cancels the share dialog', async () => {
    mockGetDisplayMedia(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));

    const error = await createAudioCapture().start(makeHandlers());

    expect(error?.userMessageKey).toBe('errors.shareCancelled');
    expect(error?.status).toBe(403);
  });

  it('reports a share without audio and releases the stream', async () => {
    const stream = fakeStream(0);
    mockGetDisplayMedia(() => Promise.resolve(stream));

    const error = await createAudioCapture().start(makeHandlers());

    expect(error?.userMessageKey).toBe('errors.noAudio');
    expect(stream.stopAll).toHaveBeenCalled();
  });

  it('reports other failures as captureFailed and cleans up', async () => {
    mockGetDisplayMedia(() => Promise.resolve(fakeStream(1)));
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        override audioWorklet = { addModule: vi.fn(() => Promise.reject(new Error('blocked'))) };
      },
    );

    const error = await createAudioCapture().start(makeHandlers());

    expect(error?.userMessageKey).toBe('errors.captureFailed');
    expect(FakeAudioContext.last?.close).toHaveBeenCalled();
  });

  it('streams PCM16 chunks and levels once started', async () => {
    const stream = fakeStream(1);
    mockGetDisplayMedia(() => Promise.resolve(stream));
    const handlers = makeHandlers();

    const error = await createAudioCapture().start(handlers);
    FakeWorkletNode.last?.port.onmessage?.(
      new MessageEvent('message', { data: new Float32Array(2400).fill(0.5) }),
    );

    expect(error).toBeNull();
    expect(FakeAudioContext.last?.sampleRate).toBe(24_000);
    // The video track is dropped right away; only audio is kept
    expect(stream.stopAll).toHaveBeenCalledTimes(1);
    expect(handlers.onLevel).toHaveBeenCalledWith(expect.any(Number));
    const chunk = vi.mocked(handlers.onChunk).mock.calls[0]?.[0];
    expect(chunk).toBeInstanceOf(Int16Array);
    expect(chunk?.length).toBeGreaterThan(2000);
  });

  it('releases a tab shared after stop() ran while the dialog was open, and starts nothing', async () => {
    const stream = fakeStream(1);
    let share: (value: unknown) => void = () => undefined;
    mockGetDisplayMedia(() => new Promise((resolve) => (share = resolve)));
    const capture = createAudioCapture();
    const starting = capture.start(makeHandlers());

    capture.stop();
    share(stream);

    expect(await starting).toBeNull();
    // Once for the dropped video, once more because nobody wants it any more
    expect(stream.stopAll).toHaveBeenCalledTimes(2);
    expect(FakeWorkletNode.last).toBeNull();
    expect(FakeAudioContext.last).toBeNull();
  });

  it('stops and notifies when the shared tab stops sending audio', async () => {
    const stream = fakeStream(1);
    mockGetDisplayMedia(() => Promise.resolve(stream));
    const handlers = makeHandlers();
    await createAudioCapture().start(handlers);

    stream.track.fire('ended');

    expect(handlers.onEnded).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.last?.close).toHaveBeenCalled();
    expect(FakeWorkletNode.last?.port.close).toHaveBeenCalled();
  });

  it('wakes the audio after the app was in the background, and waits for a muted track', async () => {
    vi.useFakeTimers();
    const stream = fakeStream(1);
    mockGetDisplayMedia(() => Promise.resolve(stream));
    const capture = createAudioCapture();
    await capture.start(makeHandlers());
    const context = FakeAudioContext.last;
    if (!context) throw new Error('no context');

    context.state = 'interrupted';
    stream.track.muted = true;
    const back = capture.recover();
    stream.track.muted = false;
    stream.track.fire('unmute');
    await expect(back).resolves.toBe(true);
    expect(context.resume).toHaveBeenCalled();

    // Still muted after the wait: it cannot hear
    stream.track.muted = true;
    const stuck = capture.recover();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(stuck).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('stop() releases the tracks, the worklet and the context', async () => {
    const stream = fakeStream(1);
    mockGetDisplayMedia(() => Promise.resolve(stream));
    const capture = createAudioCapture();
    await capture.start(makeHandlers());
    stream.stopAll.mockClear();

    capture.stop();

    expect(stream.stopAll).toHaveBeenCalled();
    expect(FakeWorkletNode.last?.disconnect).toHaveBeenCalled();
    expect(FakeAudioContext.last?.close).toHaveBeenCalledTimes(1);

    // A second stop is a no-op
    capture.stop();
    expect(FakeAudioContext.last?.close).toHaveBeenCalledTimes(1);
  });

  describe('from the microphone', () => {
    it('opens the microphone with the room processing on, and no share dialog', async () => {
      const devices = mockMediaDevices(
        () => Promise.resolve(fakeStream(1)),
        () => Promise.resolve(fakeStream(1)),
      );
      const handlers = makeHandlers();

      const error = await createAudioCapture().start(handlers, {
        source: 'mic',
        micDeviceId: 'usb-mic',
      });
      FakeWorkletNode.last?.port.onmessage?.(
        new MessageEvent('message', { data: new Float32Array(2400).fill(0.5) }),
      );

      expect(error).toBeNull();
      expect(devices.getDisplayMedia).not.toHaveBeenCalled();
      expect(devices.getUserMedia).toHaveBeenCalledWith({
        audio: expect.objectContaining({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          deviceId: { ideal: 'usb-mic' },
        }),
      });
      expect(handlers.onChunk).toHaveBeenCalled();
    });

    it('reports a denied microphone', async () => {
      mockMediaDevices(
        () => Promise.resolve(fakeStream(1)),
        () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      );

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mic' });

      expect(error?.userMessageKey).toBe('errors.micDenied');
      expect(error?.status).toBe(403);
    });

    it('reports a missing microphone', async () => {
      mockMediaDevices(
        () => Promise.resolve(fakeStream(1)),
        () => Promise.reject(new DOMException('none', 'NotFoundError')),
      );

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mic' });

      expect(error?.userMessageKey).toBe('errors.noMic');
    });

    it('reports browsers without a microphone API', async () => {
      mockGetDisplayMedia(() => Promise.resolve(fakeStream(1)));

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mic' });

      expect(error?.userMessageKey).toBe('errors.micUnsupported');
    });

    it('says which input ended', async () => {
      const mic = fakeStream(1);
      mockMediaDevices(
        () => Promise.resolve(fakeStream(1)),
        () => Promise.resolve(mic),
      );
      const handlers = makeHandlers();
      await createAudioCapture().start(handlers, { source: 'mic' });

      mic.track.fire('ended');

      expect(handlers.onEnded).toHaveBeenCalledWith('mic');
    });

    it('falls back to the device rate where the browser cannot mix rates', async () => {
      mockMediaDevices(
        () => Promise.resolve(fakeStream(1)),
        () => Promise.resolve(fakeStream(1)),
      );
      const contexts: FakeAudioContext[] = [];
      vi.stubGlobal(
        'AudioContext',
        class extends FakeAudioContext {
          constructor(options?: { sampleRate: number }) {
            super(options);
            contexts.push(this);
          }
          override createMediaStreamSource(): FakeNode {
            if (this.sampleRate === 24_000) throw new DOMException('rates', 'NotSupportedError');
            return super.createMediaStreamSource();
          }
        },
      );

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mic' });

      expect(error).toBeNull();
      expect(contexts.map((context) => context.sampleRate)).toEqual([24_000, 48_000]);
      expect(contexts[0]?.close).toHaveBeenCalled();
    });
  });

  describe('mixed', () => {
    it('asks to share first, then the microphone, and mixes both into one input', async () => {
      const order: string[] = [];
      mockMediaDevices(
        () => (order.push('share'), Promise.resolve(fakeStream(1))),
        () => (order.push('mic'), Promise.resolve(fakeStream(1))),
      );

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mixed' });

      expect(error).toBeNull();
      expect(order).toEqual(['share', 'mic']);
      expect(FakeAudioContext.last?.sources).toBe(2);
    });

    it('releases the shared tab when the microphone fails', async () => {
      const tab = fakeStream(1);
      mockMediaDevices(
        () => Promise.resolve(tab),
        () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      );

      const error = await createAudioCapture().start(makeHandlers(), { source: 'mixed' });

      expect(error?.userMessageKey).toBe('errors.micDenied');
      // Once for the dropped video, once more on cleanup
      expect(tab.stopAll).toHaveBeenCalledTimes(2);
    });
  });
});
