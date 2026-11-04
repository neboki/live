import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useFloatingWindow } from '@/modules/overlay/store/useFloatingWindow';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import type { CaptureHandlers, CaptureOptions } from '@/shared/audio/audioCapture';
import { AppError, ExternalServiceError, UnauthorizedError } from '@/shared/errors';
import type { DelayedPlayback } from '@/shared/media/delayedPlayback';
import type { SttCallbacks, SttOptions, SttSession, Usage } from '@/shared/providers/types';
import { CALIBRATION_SECONDS } from '../utils/sync';
import { useLiveSession } from './useLiveSession';

const fakes = vi.hoisted(() => {
  const state: { handlers: CaptureHandlers | null; stt: SttCallbacks | null } = {
    handlers: null,
    stt: null,
  };
  return {
    state,
    /** What start() asked the browser for, in order, before anything awaited */
    calls: [] as string[],
    pip: { supported: true },
    pipOpen: vi.fn<() => Promise<AppError | null>>(),
    pipClose: vi.fn<() => void>(),
    captureStart:
      vi.fn<(handlers: CaptureHandlers, options?: CaptureOptions) => Promise<AppError | null>>(),
    captureStop: vi.fn<() => void>(),
    captureRecover: vi.fn<() => Promise<boolean>>(),
    /** A tab was shared (its original audio can be controlled), not a screen */
    sharedTab: { value: false },
    setOriginalVolume: vi.fn<(volume: number) => void>(),
    /** The shared tab's picture can be played behind time */
    canSync: { value: false },
    syncOriginal: vi.fn<(seconds: number) => DelayedPlayback | null>(),
    unsyncOriginal: vi.fn<() => void>(),
    verifyApiKey: vi.fn<(access: unknown, models?: string[]) => Promise<AppError | null>>(),
    connect: vi.fn<(options: SttOptions, callbacks: SttCallbacks) => Promise<SttSession>>(),
    sessionClose: vi.fn<() => void>(),
    record: {
      begin: vi.fn(),
      addLine: vi.fn(),
      setSummary: vi.fn(),
      setGlossary: vi.fn(),
      addUsage: vi.fn(),
      end: vi.fn(),
      usage: [] as Usage[],
      lines: [],
    },
  };
});

vi.mock('@/shared/audio/audioCapture', () => ({
  createAudioCapture: () => ({
    start: (handlers: CaptureHandlers, options?: CaptureOptions) => {
      fakes.calls.push('share');
      fakes.state.handlers = handlers;
      return fakes.captureStart(handlers, options);
    },
    stop: fakes.captureStop,
    recover: fakes.captureRecover,
    canControlOriginal: () => fakes.sharedTab.value,
    hasHeadset: () => false,
    setOriginalVolume: fakes.setOriginalVolume,
    canSyncOriginal: () => fakes.canSync.value,
    syncOriginal: fakes.syncOriginal,
    unsyncOriginal: fakes.unsyncOriginal,
  }),
}));
vi.mock('@/shared/pip/useDocumentPip', async () => {
  const { computed, shallowRef } = await import('vue');
  return {
    createDocumentPip: () => {
      const pipWindow = shallowRef<Window | null>(null);
      return {
        isSupported: fakes.pip.supported,
        pipWindow,
        pipBody: computed(() => null),
        open: async () => {
          fakes.calls.push('floating');
          const error = await fakes.pipOpen();
          if (!error) pipWindow.value = window;
          return error;
        },
        close: () => {
          fakes.pipClose();
          pipWindow.value = null;
        },
      };
    },
  };
});
const demoFakes = vi.hoisted(() => ({
  requestDemo: vi.fn<() => Promise<{ key: string; seconds: number } | Error>>(),
}));
vi.mock('@/shared/providers/openai/demo', () => ({ requestDemo: demoFakes.requestDemo }));
vi.mock('@/shared/providers/openai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/providers/openai/config')>()),
  DEMO_API: '/api/demo',
}));
vi.mock('@/shared/providers/openai/llm/chat', () => ({ verifyApiKey: fakes.verifyApiKey }));
vi.mock('@/shared/providers/openai/realtime/realtimeStt', () => ({
  openAiRealtimeStt: { connect: fakes.connect },
}));
vi.mock('@/shared/providers/openai/llm/openAiLlm', () => ({
  openAiLlm: {
    translate: vi.fn(async () => undefined),
    summarize: vi.fn(async () => []),
    suggest: vi.fn(async () => []),
  },
}));
vi.mock('@/modules/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/session')>()),
  useSessionRecord: () => fakes.record,
}));

function setup(): ReturnType<typeof useLiveSession> {
  useSettingsStore().apiKey = 'test-key';
  return useLiveSession();
}

describe('useLiveSession', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakes.calls.length = 0;
    fakes.record.usage = [];
    fakes.pip.supported = true;
    fakes.sharedTab.value = false;
    fakes.canSync.value = false;
    fakes.syncOriginal.mockReturnValue(null);
    fakes.pipOpen.mockResolvedValue(null);
    fakes.captureStart.mockResolvedValue(null);
    fakes.verifyApiKey.mockResolvedValue(null);
    fakes.connect.mockImplementation(async (_options, callbacks) => {
      fakes.state.stt = callbacks;
      return { append: vi.fn(), close: fakes.sessionClose };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts a session with the settings models and begins the record', async () => {
    const session = setup();
    useOverlayStore().glossary = 'Acme';
    useSettingsStore().models.transcription = 'stt-custom';

    await expect(session.start('es')).resolves.toBe(true);

    expect(session.active).toBe(true);
    expect(session.starting).toBe(false);
    expect(session.showLive).toBe(true);
    expect(fakes.verifyApiKey).toHaveBeenCalledWith(
      { apiKey: 'test-key', endpoint: undefined },
      expect.arrayContaining(['stt-custom']),
    );
    expect(fakes.connect.mock.calls[0]?.[0]).toMatchObject({ model: 'stt-custom' });
    expect(fakes.record.begin).toHaveBeenCalledWith(
      expect.objectContaining({ pair: { from: 'AUTO', to: 'ES' }, glossary: 'Acme' }),
    );
  });

  it('shows the capture error, closes the connection opened meanwhile and keeps the last record', async () => {
    fakes.captureStart.mockResolvedValue(
      new AppError('no', { userMessageKey: 'errors.shareCancelled' }),
    );
    const session = setup();

    await expect(session.start('es')).resolves.toBe(false);

    expect(session.errorKey).toBe('errors.shareCancelled');
    expect(session.active).toBe(false);
    expect(fakes.sessionClose).toHaveBeenCalled();
    expect(fakes.record.begin).not.toHaveBeenCalled();
  });

  it('connects the transcriber while the share dialog is still open', async () => {
    let share: (value: null) => void = () => undefined;
    fakes.captureStart.mockReturnValue(new Promise((resolve) => (share = resolve)));
    const session = setup();

    const started = session.start('es');
    await Promise.resolve();
    expect(fakes.connect).toHaveBeenCalledTimes(1);

    share(null);
    await expect(started).resolves.toBe(true);
    expect(fakes.record.begin).toHaveBeenCalledTimes(1);
  });

  it('shows a rejected key and stops the capture', async () => {
    fakes.verifyApiKey.mockResolvedValue(new UnauthorizedError('bad'));
    const session = setup();

    await session.start('es');

    expect(session.errorKey).toBe('errors.invalidKey');
    expect(fakes.captureStop).toHaveBeenCalled();
    expect(session.showLive).toBe(false);
  });

  it('shows a failed connection', async () => {
    fakes.connect.mockRejectedValue(new ExternalServiceError('x', 'errors.connectionFailed'));
    const session = setup();

    await expect(session.start('es')).resolves.toBe(false);

    expect(session.errorKey).toBe('errors.connectionFailed');
    expect(session.active).toBe(false);
  });

  it('ignores a second start while the first is running', async () => {
    const session = setup();
    const first = session.start('es');
    const second = session.start('es');

    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
    expect(fakes.captureStart).toHaveBeenCalledTimes(1);
  });

  it('stays stopped when the shared tab ends during the start', async () => {
    fakes.captureStart.mockImplementation(async (handlers) => {
      handlers.onEnded('tab');
      return null;
    });
    const session = setup();

    await expect(session.start('es')).resolves.toBe(false);

    expect(session.active).toBe(false);
    expect(session.starting).toBe(false);
    expect(session.errorKey).toBe('errors.audioEnded');
    expect(fakes.sessionClose).toHaveBeenCalled();
  });

  it('resets starting when something throws', async () => {
    fakes.verifyApiKey.mockRejectedValue(new Error('boom'));
    const session = setup();

    await expect(session.start('es')).resolves.toBe(false);

    expect(session.starting).toBe(false);
    expect(session.active).toBe(false);
    expect(session.errorKey).toBe('errors.unexpected');
  });

  it('stops the capture and ends the record on stop', async () => {
    const session = setup();
    await session.start('es');

    session.stop();

    expect(session.active).toBe(false);
    expect(fakes.captureStop).toHaveBeenCalled();
    expect(fakes.sessionClose).toHaveBeenCalled();
    expect(fakes.record.end).toHaveBeenCalledTimes(1);
  });

  it('silences the shared tab under the translated voice, and offers it back', async () => {
    fakes.sharedTab.value = true;
    const overlay = useOverlayStore();
    const session = setup();
    await session.start('es');
    expect(overlay.canHearOriginal).toBe(true);
    expect(fakes.setOriginalVolume).toHaveBeenLastCalledWith(1);

    overlay.toggleOption('voice');
    await nextTick();
    expect(fakes.setOriginalVolume).toHaveBeenLastCalledWith(0);

    overlay.hearOriginal = true;
    await nextTick();
    // Both on: the original stays, softly, under the voice
    expect(fakes.setOriginalVolume).toHaveBeenLastCalledWith(0.25);

    session.stop();
    expect(overlay.canHearOriginal).toBe(false);
  });

  it('shows the shared tab behind time while the sync option is on, following the latency', async () => {
    fakes.sharedTab.value = true;
    fakes.canSync.value = true;
    const playback: DelayedPlayback = {
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
    fakes.syncOriginal.mockReturnValue(playback);
    const overlay = useOverlayStore();
    overlay.syncVideo = true;
    const session = setup();
    await session.start('es');
    await nextTick();

    expect(overlay.canSyncVideo).toBe(true);
    // Auto by default: held the longest while the first captions are timed
    expect(fakes.syncOriginal).toHaveBeenLastCalledWith(CALIBRATION_SECONDS);
    expect(session.syncedTab).toBe(playback);
    expect(session.syncDelaySeconds).toBe(CALIBRATION_SECONDS);
    expect(session.syncCalibrating).toBe(true);

    // The latency does not move it: only the captions timed, or a delay chosen, change it
    const calls = fakes.syncOriginal.mock.calls.length;
    overlay.setLatency(4200);
    await nextTick();
    expect(fakes.syncOriginal).toHaveBeenCalledTimes(calls);
    overlay.syncDelay = 15;
    await nextTick();
    expect(fakes.syncOriginal).toHaveBeenLastCalledWith(15);
    expect(session.syncDelaySeconds).toBe(15);

    overlay.syncVideo = false;
    await nextTick();
    expect(fakes.unsyncOriginal).toHaveBeenCalled();
    expect(session.syncedTab).toBeNull();

    session.stop();
    expect(overlay.canSyncVideo).toBe(false);
    // The option is remembered for the next session
    expect(overlay.syncVideo).toBe(false);
  });

  it('switches the target language mid-session from the next sentence on', async () => {
    const overlay = useOverlayStore();
    const session = setup();
    await session.start('es');

    useSettingsStore().targetLanguage = 'fr';
    await nextTick();
    expect(overlay.pair.to).toBe('FR');
  });

  it('keeps a draining run out of a session restarted right after stop', async () => {
    const session = setup();
    await session.start('es');
    const old = fakes.state.stt;
    session.stop();

    let share: (value: AppError | null) => void = () => undefined;
    fakes.captureStart.mockReturnValueOnce(new Promise((resolve) => (share = resolve)));
    const restarting = session.start('es');
    old?.onFinal('From the old session', { language: 'de' });
    share(null);
    await restarting;

    const overlay = useOverlayStore();
    expect(overlay.source.text).toBe('');
    expect(overlay.pair.from).toBe('AUTO');
  });

  it('stops everything when the key is forgotten while active', async () => {
    const session = setup();
    await session.start('es');

    useSettingsStore().forgetKey();
    await nextTick();

    expect(session.active).toBe(false);
    expect(fakes.captureStop).toHaveBeenCalled();
    expect(fakes.sessionClose).toHaveBeenCalled();
  });

  it('stops with an error in the bar when the session reaches the spending limit', async () => {
    const usage = reactive<Usage[]>([]);
    fakes.record.usage = usage;
    const session = setup();
    useSettingsStore().spendLimitEur = 1;
    await session.start('es');

    // A model with no price counts as nothing, and the bar says the limit is blind
    usage.push({ model: 'unpriced', inputTokens: 9e9, cachedInputTokens: 0, outputTokens: 0 });
    await nextTick();
    expect(session.active).toBe(true);
    expect(useOverlayStore().notice).toBe('overlay.cost.unpricedLimit');

    // $8 of output on sol ≈ €6.9: past 80 % of a €8 limit, so a warning, and the session goes on
    useSettingsStore().spendLimitEur = 8;
    usage.push({ model: 'gpt-6.1-sol', inputTokens: 0, cachedInputTokens: 0, outputTokens: 8e5 });
    await nextTick();
    expect(session.active).toBe(true);
    expect(useOverlayStore().notice).toBe('overlay.cost.nearLimit');

    usage.push({ model: 'gpt-6.1-sol', inputTokens: 0, cachedInputTokens: 0, outputTokens: 1e6 });
    await nextTick();
    expect(session.active).toBe(false);
    expect(session.liveError).toBe('errors.spendLimit');
  });

  it('keeps the bar with the error after a fatal one, until dismissed', async () => {
    const session = setup();
    await session.start('es');

    fakes.state.stt?.onError(new UnauthorizedError('revoked'));

    expect(session.active).toBe(false);
    expect(session.liveError).toBe('errors.invalidKey');
    expect(session.showLive).toBe(true);
    expect(fakes.captureStop).toHaveBeenCalled();

    session.dismissError();

    expect(session.liveError).toBeNull();
    expect(session.errorKey).toBe('errors.invalidKey');
    expect(session.showLive).toBe(false);
  });

  it('shows a fatal error in the bar when the shared tab ends mid-session', async () => {
    const session = setup();
    await session.start('es');

    fakes.state.handlers?.onEnded('tab');

    expect(session.liveError).toBe('errors.audioEnded');
    expect(session.showLive).toBe(true);
  });

  it('keeps the bar mounted while restarting from an error', async () => {
    const session = setup();
    await session.start('es');
    fakes.state.handlers?.onEnded('tab');

    let release: (value: AppError | null) => void = () => undefined;
    fakes.captureStart.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const restarted = session.start('es');

    expect(session.starting).toBe(true);
    expect(session.showLive).toBe(true);

    release(null);
    expect(await restarted).toBe(true);
    expect(session.liveError).toBeNull();
    expect(session.active).toBe(true);
  });

  it('shows a failed restart in the bar', async () => {
    const session = setup();
    await session.start('es');
    fakes.state.handlers?.onEnded('tab');
    fakes.captureStart.mockResolvedValueOnce(
      new AppError('cancelled', {
        userMessageKey: 'errors.shareCancelled',
      }),
    );

    expect(await session.start('es')).toBe(false);

    expect(session.liveError).toBe('errors.shareCancelled');
    expect(session.errorKey).toBeNull();
    expect(session.showLive).toBe(true);
  });
});

describe('useLiveSession and the floating window', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakes.calls.length = 0;
    fakes.pip.supported = true;
    fakes.pipOpen.mockResolvedValue(null);
    fakes.captureStart.mockResolvedValue(null);
    fakes.verifyApiKey.mockResolvedValue(null);
    fakes.connect.mockImplementation(async (_options, callbacks) => {
      fakes.state.stt = callbacks;
      return { append: vi.fn(), close: fakes.sessionClose };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('asks to share first and opens the window in the same click, before awaiting', async () => {
    const session = setup();

    const started = session.start('es');

    // Synchronously: the window uses the click up, so it must come right after the share dialog
    expect(fakes.calls).toEqual(['share', 'floating']);
    await expect(started).resolves.toBe(true);
    expect(useFloatingWindow().isOpen).toBe(true);
  });

  it('does not start, nor ask to share, a tab without a floating window', async () => {
    fakes.pip.supported = false;
    const session = setup();
    useSettingsStore().audioSource = 'tab';

    await expect(session.start('es')).resolves.toBe(false);

    expect(session.errorKey).toBe('errors.pipUnsupported');
    expect(fakes.calls).toEqual([]);
  });

  it('closes the window when the start fails', async () => {
    fakes.captureStart.mockResolvedValue(
      new AppError('no', { userMessageKey: 'errors.shareCancelled' }),
    );
    const session = setup();

    await session.start('es');

    expect(useFloatingWindow().isOpen).toBe(false);
    expect(fakes.pipClose).toHaveBeenCalled();
  });

  it('goes on when the window could not open: the page offers to reopen it', async () => {
    fakes.pipOpen.mockResolvedValue(new AppError('no', { userMessageKey: 'errors.unexpected' }));
    const session = setup();

    await expect(session.start('es')).resolves.toBe(true);

    expect(session.active).toBe(true);
    expect(useFloatingWindow().isOpen).toBe(false);
  });

  it('closes the window on stop', async () => {
    const session = setup();
    await session.start('es');

    session.stop();

    expect(useFloatingWindow().isOpen).toBe(false);
  });

  it('keeps the window open to show a fatal error, and closes it on dismiss', async () => {
    const session = setup();
    await session.start('es');

    fakes.state.handlers?.onEnded('tab');
    expect(useFloatingWindow().isOpen).toBe(true);

    session.dismissError();
    expect(useFloatingWindow().isOpen).toBe(false);
  });

  it('keeps the open window when restarting from an error', async () => {
    const session = setup();
    await session.start('es');
    fakes.state.handlers?.onEnded('tab');
    fakes.calls.length = 0;

    await expect(session.start('es')).resolves.toBe(true);

    expect(fakes.pipOpen).toHaveBeenCalledTimes(1);
    expect(fakes.pipClose).not.toHaveBeenCalled();
  });

  it('stopping from the error clears it and closes the window', async () => {
    const session = setup();
    await session.start('es');
    fakes.state.handlers?.onEnded('tab');

    session.stop();

    expect(session.liveError).toBeNull();
    expect(session.showLive).toBe(false);
    expect(useFloatingWindow().isOpen).toBe(false);
  });
});

describe('useLiveSession with the microphone', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakes.calls.length = 0;
    fakes.pip.supported = true;
    fakes.pipOpen.mockResolvedValue(null);
    fakes.captureStart.mockResolvedValue(null);
    fakes.verifyApiKey.mockResolvedValue(null);
    fakes.connect.mockImplementation(async (_options, callbacks) => {
      fakes.state.stt = callbacks;
      return { append: vi.fn(), close: fakes.sessionClose };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('passes the chosen source and microphone to the capture', async () => {
    const session = setup();
    const settings = useSettingsStore();
    settings.audioSource = 'mixed';
    settings.micDeviceId = 'usb-mic';

    await session.start('es');

    expect(fakes.captureStart).toHaveBeenCalledWith(expect.anything(), {
      source: 'mixed',
      micDeviceId: 'usb-mic',
    });
    expect(session.source).toBe('mixed');
  });

  it('says the microphone is starting instead of the share dialog', () => {
    const session = setup();
    const settings = useSettingsStore();

    settings.audioSource = 'mic';
    expect(session.startingKey).toBe('start.startingMic');
    settings.audioSource = 'mixed';
    expect(session.startingKey).toBe('start.starting');
  });

  it('starts in the page, without a floating window, when listening to the microphone', async () => {
    fakes.pip.supported = false;
    const session = setup();
    useSettingsStore().audioSource = 'mic';

    await expect(session.start('es')).resolves.toBe(true);

    expect(session.inPage).toBe(true);
    expect(session.active).toBe(true);
    expect(fakes.calls).toEqual(['share']);
    expect(fakes.pipOpen).not.toHaveBeenCalled();
  });

  it('ends with its own message when the microphone is unplugged', async () => {
    const session = setup();
    useSettingsStore().audioSource = 'mic';
    await session.start('es');

    fakes.state.handlers?.onEnded('mic');

    expect(session.active).toBe(false);
    expect(session.liveError).toBe('errors.micEnded');
  });

  describe('back from the background', () => {
    let visibility: DocumentVisibilityState = 'visible';

    function leaveFor(ms: number, heardMs = 0): void {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      // 100 ms chunks at 24 kHz: real sound, or the exact zeros of a muted track
      for (let t = 0; t < ms; t += 100) {
        fakes.state.handlers?.onChunk(new Int16Array(2400).fill(t < heardMs ? 300 : 0));
      }
      vi.advanceTimersByTime(ms);
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    }

    beforeEach(() => {
      vi.useFakeTimers();
      visibility = 'visible';
      vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    });
    afterEach(() => vi.useRealTimers());

    async function startMic(): Promise<ReturnType<typeof useLiveSession>> {
      const session = setup();
      useSettingsStore().audioSource = 'mic';
      await session.start('es');
      return session;
    }

    it('wakes the microphone and says what may be missing when it stopped hearing', async () => {
      fakes.captureRecover.mockResolvedValue(true);
      const session = await startMic();

      leaveFor(10_000);
      await vi.waitFor(() => expect(useOverlayStore().notice).toBe('errors.awayResumed'));

      expect(fakes.captureRecover).toHaveBeenCalledOnce();
      expect(session.active).toBe(true);
    });

    it('stops with a way to start again when the microphone does not come back', async () => {
      fakes.captureRecover.mockResolvedValue(false);
      const session = await startMic();

      leaveFor(10_000);
      await vi.waitFor(() => expect(session.liveError).toBe('errors.awayPaused'));
      expect(session.active).toBe(false);
    });

    it('says nothing when it kept hearing, or for a short glance away', async () => {
      const session = await startMic();

      leaveFor(10_000, 10_000);
      leaveFor(1000);
      await Promise.resolve();

      expect(fakes.captureRecover).not.toHaveBeenCalled();
      expect(useOverlayStore().notice).toBeNull();
      expect(session.active).toBe(true);
    });

    it('stops watching once the session is over', async () => {
      const session = await startMic();
      session.stop();

      leaveFor(10_000);
      await Promise.resolve();

      expect(fakes.captureRecover).not.toHaveBeenCalled();
    });
  });
});

describe('useLiveSession and where the captions go', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakes.calls.length = 0;
    fakes.pip.supported = true;
    fakes.pipOpen.mockResolvedValue(null);
    fakes.captureStart.mockResolvedValue(null);
    fakes.verifyApiKey.mockResolvedValue(null);
    fakes.connect.mockImplementation(async (_options, callbacks) => {
      fakes.state.stt = callbacks;
      return { append: vi.fn(), close: fakes.sessionClose };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts in the page when that is the preference, without opening the window', async () => {
    const session = setup();
    useOverlayStore().placement = 'page';

    await expect(session.start('es')).resolves.toBe(true);

    expect(fakes.calls).toEqual(['share']);
    expect(fakes.pipOpen).not.toHaveBeenCalled();
    expect(session.inPage).toBe(true);
    expect(session.canFloat).toBe(true);
    expect(session.active).toBe(true);
  });

  it('tells the start screen whether the window will open', () => {
    const session = setup();
    const overlay = useOverlayStore();

    expect(session.wantsFloating).toBe(true);
    overlay.placement = 'page';
    expect(session.wantsFloating).toBe(false);
  });

  it('never wants the window where the browser has none, whatever the preference', () => {
    fakes.pip.supported = false;
    const session = setup();
    useOverlayStore().placement = 'floating';

    expect(session.canFloat).toBe(false);
    expect(session.wantsFloating).toBe(false);
    expect(session.inPage).toBe(true);
  });

  it('floats the captions from the page, and remembers the choice', async () => {
    const session = setup();
    const overlay = useOverlayStore();
    overlay.placement = 'page';
    await session.start('es');

    await expect(session.popOut()).resolves.toBeNull();

    expect(useFloatingWindow().isOpen).toBe(true);
    expect(session.inPage).toBe(false);
    expect(overlay.placement).toBe('floating');
    expect(session.active).toBe(true);
  });

  it('brings the captions back to the page, and remembers the choice', async () => {
    const session = setup();
    await session.start('es');
    expect(session.inPage).toBe(false);

    session.popIn();

    expect(useFloatingWindow().isOpen).toBe(false);
    expect(session.inPage).toBe(true);
    expect(useOverlayStore().placement).toBe('page');
    expect(session.active).toBe(true);
  });

  it('shows the captions in the page when the user closes the window, keeping the preference', async () => {
    const session = setup();
    await session.start('es');

    useFloatingWindow().close();

    expect(session.inPage).toBe(true);
    expect(session.active).toBe(true);
    expect(useOverlayStore().placement).toBe('floating');
  });

  it('shows the bar again when a session starts', async () => {
    const session = setup();
    const overlay = useOverlayStore();
    overlay.hidden = true;

    await session.start('es');

    expect(overlay.hidden).toBe(false);
  });
});

describe('useLiveSession, free demo', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fakes.pip.supported = true;
    fakes.pipOpen.mockResolvedValue(null);
    fakes.captureStart.mockResolvedValue(null);
    fakes.connect.mockImplementation(async (_options, callbacks) => {
      fakes.state.stt = callbacks;
      return { append: vi.fn(), close: fakes.sessionClose };
    });
    demoFakes.requestDemo.mockResolvedValue({ key: 'temp-demo-key', seconds: 180 });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs on the demo key and the cheapest models, without a key of its own', async () => {
    const settings = useSettingsStore();
    settings.models.transcription = 'gpt-live-transcribe';
    const session = useLiveSession();

    await expect(session.start('es', { demo: true })).resolves.toBe(true);

    expect(fakes.verifyApiKey).not.toHaveBeenCalled();
    expect(fakes.connect.mock.calls[0]?.[0]).toMatchObject({
      apiKey: 'temp-demo-key',
      endpoint: '/api/demo',
      model: 'gpt-transcribe',
    });
    expect(session.demo).toBe(true);
    expect(session.demoEndsAt).toBe(Date.now() + 180_000);
  });

  it('stops itself when its time is up and says so on the home screen', async () => {
    const session = useLiveSession();
    await session.start('es', { demo: true });

    vi.advanceTimersByTime(180_000);

    expect(session.active).toBe(false);
    expect(session.demoEndsAt).toBeNull();
    expect(session.errorKey).toBe('errors.demoEnded');
  });

  it('shows why no demo could start', async () => {
    demoFakes.requestDemo.mockResolvedValue(
      new AppError('none left', { userMessageKey: 'errors.demoQuota' }),
    );
    const session = useLiveSession();

    await expect(session.start('es', { demo: true })).resolves.toBe(false);

    expect(session.errorKey).toBe('errors.demoQuota');
    expect(fakes.connect).not.toHaveBeenCalled();
  });

  it('goes back to the user key when started normally after a demo', async () => {
    useSettingsStore().apiKey = 'test-key';
    fakes.verifyApiKey.mockResolvedValue(null);
    const session = useLiveSession();
    await session.start('es', { demo: true });
    session.stop();

    await session.start('es', { demo: false });

    expect(fakes.connect.mock.calls[1]?.[0]).toMatchObject({ apiKey: 'test-key' });
    expect(session.demoEndsAt).toBeNull();
  });
});
