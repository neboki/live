import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useFloatingWindow, useOverlayStore } from '@/modules/overlay';
import { costUsd, hasUnpricedUsage, usdToEur, useSessionRecord } from '@/modules/session';
import { useSettingsStore } from '@/modules/settings';
import { createAudioCapture } from '@/shared/audio/audioCapture';
import { endedMessageKey, needsShare, startingMessageKey, type AudioSource } from '@/shared/audio';
import { logError, type AppError } from '@/shared/errors';
import { DEMO_API, TIER_MODELS } from '@/shared/providers/openai/config';
import { type DemoGrant, requestDemo } from '@/shared/providers/openai/demo';
import { verifyApiKey } from '@/shared/providers/openai/llm/chat';
import { openAiLlm } from '@/shared/providers/openai/llm/openAiLlm';
import { openAiRealtimeStt } from '@/shared/providers/openai/realtime/realtimeStt';
import { createSessionPipeline } from '../pipeline/sessionPipeline';
import { languageName } from '../utils/language';
import { createAwayWatch } from '../watchers/awayWatch';
import { createTabSilenceWatch } from '../watchers/tabSilenceWatch';
import { createVideoSync } from '../watchers/videoSync';

const AUTO_DETECT = 'AUTO';
/** How long a non-fatal notice (rate limit, outage) stays in the bar */
const NOTICE_TTL_MS = 8000;
/** Back from the background with less real sound than this: what was said was missed */
const HEARD_ENOUGH = 0.5;
const UNPRICED_KEY = 'overlay.cost.unpricedLimit';
const NEAR_LIMIT_KEY = 'overlay.cost.nearLimit';
/** Share of the spending limit at which the bar gives a warning */
const NEAR_LIMIT = 0.8;
/** Shown while the shared tab sends no sound at all: its video is most likely paused */
const TAB_SILENT_KEY = 'live.tabSilent';
/** Shown as the free demo starts, and on the home screen once its time is up */
const DEMO_STARTED_KEY = 'live.demoStarted';
const DEMO_ENDED_KEY = 'errors.demoEnded';

export interface StartOptions {
  /** The free demo: no key needed, the cheapest models, a few minutes. Default: as last time */
  demo?: boolean;
}

/**
 * A live session: captures a shared tab, the microphone or both, and turns it into
 * translated captions. They show where the user chose: in the floating window, which
 * opens with the session and closes when it ends, or in the live page. They can be moved
 * from one to the other meanwhile. Without a floating window (phones) the page it is,
 * and only the microphone can be listened to.
 */
export const useLiveSession = defineStore('live', () => {
  const overlay = useOverlayStore();
  const floating = useFloatingWindow();
  const settings = useSettingsStore();
  const record = useSessionRecord();
  const capture = createAudioCapture();
  const pipeline = createSessionPipeline({
    stt: openAiRealtimeStt,
    llm: openAiLlm,
    overlay,
    record,
  });
  const sync = createVideoSync({ capture, overlay, lines: () => record.lines });
  const away = createAwayWatch({
    onBack: (heard) => {
      if (heard < HEARD_ENOUGH)
        comeBack().catch((err: unknown) => logError('Coming back failed', err));
    },
  });
  /** True while the shared tab has sent pure silence for a while (its video is paused) */
  const tabSilent = ref(false);
  const silence = createTabSilenceWatch({
    onChange: (silent) => {
      tabSilent.value = silent;
      if (silent) overlay.setNotice(TAB_SILENT_KEY);
      else if (overlay.notice === TAB_SILENT_KEY) overlay.setNotice(null);
    },
  });
  const active = ref(false);
  const starting = ref(false);
  /** Shown on the home screen (a failed start or a dismissed live error) */
  const errorKey = ref<string | null>(null);
  /** A fatal error during a session; the bar stays mounted to show it */
  const liveError = ref<string | null>(null);
  const showLive = computed(() => active.value || liveError.value !== null);
  /** This browser can open the floating window (Chrome and Edge on a computer) */
  const canFloat = floating.isSupported;
  /** The next start opens the floating window: the user asked for it and the browser can */
  const wantsFloating = computed(() => canFloat && overlay.placement === 'floating');
  /** The captions show in the live page: no floating window is open to hold them */
  const inPage = computed(() => !floating.isOpen);
  /** What the running (or last) session listens to */
  const source = ref<AudioSource>(settings.audioSource);
  const startingKey = computed(() => startingMessageKey(settings.audioSource));
  /** Bumped by every start and stop, so a start that was overtaken knows it */
  let startToken = 0;
  let recording = false;
  /** The running (or last) session is the free demo; a restart from the bar keeps it */
  const demo = ref(false);
  /** Epoch milliseconds when the demo stops itself, while one runs */
  const demoEndsAt = ref<number | null>(null);
  let demoTimer: ReturnType<typeof setTimeout> | null = null;

  function clearDemoTimer(): void {
    if (demoTimer !== null) clearTimeout(demoTimer);
    demoTimer = null;
    demoEndsAt.value = null;
  }

  /** The demo's time is up: end it as the user would, and say why on the home screen */
  function endDemo(): void {
    stop();
    errorKey.value = DEMO_ENDED_KEY;
  }

  function endRecord(): void {
    if (!recording) return;
    recording = false;
    record.setGlossary(overlay.glossary);
    record.end();
  }

  /** Graceful stops let the last sentence finish translating; fatal ones cancel at once. */
  function teardown(graceful: boolean): void {
    startToken++;
    clearDemoTimer();
    away.stop();
    silence.stop();
    capture.stop();
    overlay.canHearOriginal = false;
    sync.ended();
    if (graceful && active.value) pipeline.stop();
    else pipeline.abort();
    active.value = false;
    starting.value = false;
    overlay.setLevel(0);
    endRecord();
  }

  function stop(): void {
    teardown(true);
    liveError.value = null;
    floating.close();
  }

  function fail(messageKey: string): void {
    // A restart from the bar's error keeps the bar mounted, so its failure shows there too
    const inBar = active.value || liveError.value !== null;
    teardown(false);
    if (inBar) {
      liveError.value = messageKey;
      return;
    }
    // A start that never got going: the home page says why, not an empty floating window
    errorKey.value = messageKey;
    floating.close();
  }

  const failWith = (error: AppError): void => fail(error.userMessageKey);

  /** Back in the app after it stopped hearing: wake the capture, or say it cannot. */
  async function comeBack(): Promise<void> {
    const token = startToken;
    const hears = await capture.recover();
    if (token !== startToken || !active.value) return;
    if (hears) overlay.setNotice('errors.awayResumed', NOTICE_TTL_MS);
    else fail('errors.awayPaused');
  }

  /** Leaves the error shown in the bar and goes back home, keeping the message. */
  function dismissError(): void {
    if (liveError.value === null) return;
    errorKey.value = liveError.value;
    liveError.value = null;
    floating.close();
  }

  /** stop() or fail() ran while start() was waiting: clean up what it left behind. */
  function overtaken(token: number): boolean {
    if (token === startToken) return false;
    if (!starting.value && !active.value) {
      capture.stop();
      pipeline.abort();
    }
    return true;
  }

  async function connect(
    apiKey: string,
    endpoint: string | undefined,
    target: string,
  ): Promise<AppError | null> {
    // The demo server only takes the cheapest models; the user's choice is for their key
    const models = demo.value ? { ...TIER_MODELS.low } : { ...settings.models };
    recording = true;
    record.begin({ pair: { ...overlay.pair }, startedAt: Date.now(), glossary: overlay.glossary });
    return pipeline.start({
      apiKey,
      endpoint,
      targetLanguage: languageName(target),
      targetCode: target,
      models,
      languages: [...settings.meeting.languages],
      topic: settings.meeting.topic,
      onFatal: failWith,
      onNotice: (error) => overlay.setNotice(error.userMessageKey, NOTICE_TTL_MS),
    });
  }

  /**
   * Must be called from a click, with nothing awaited before it: the share dialog and
   * the floating window both need the click, and nothing in here awaits before them.
   * Translates into `target` (ISO 639-1), the chosen language by default.
   */
  async function start(
    target: string = settings.targetLanguage,
    options: StartOptions = {},
  ): Promise<boolean> {
    if (starting.value || active.value) return active.value;
    if (!canFloat && needsShare(settings.audioSource)) {
      fail('errors.pipUnsupported');
      return false;
    }
    const token = ++startToken;
    starting.value = true;
    demo.value = options.demo ?? demo.value;
    errorKey.value = null;
    source.value = settings.audioSource;
    // liveError stays until the restart succeeds, so the bar (and its PiP window) stay mounted
    try {
      // A previous run may still be draining: end it so it can't write into the new overlay
      pipeline.abort();
      overlay.reset({ from: AUTO_DETECT, to: target.toUpperCase() });
      overlay.hidden = false;
      let apiKey = settings.apiKey.trim();
      const endpoint = demo.value ? DEMO_API : settings.endpoint;

      // The share dialog opens first: the floating window uses the click up, so it goes
      // right after. The key is checked meanwhile. A window that fails to open is not
      // fatal: the captions show in the page, which offers to float them again.
      capture.setOriginalVolume(overlay.originalVolume);
      const sharing = capture.start(
        {
          onChunk: (pcm) => {
            pipeline.pushAudio(pcm);
            away.chunk(pcm);
            silence.chunk(pcm);
          },
          onLevel: (level) => overlay.setLevel(level),
          onEnded: (input) => fail(endedMessageKey(input)),
        },
        { source: source.value, micDeviceId: settings.micDeviceId },
      );
      const opening = wantsFloating.value ? floating.open() : Promise.resolve(null);
      // The demo asks its server for a key meanwhile; a key of the user's own is checked
      const access: Promise<DemoGrant | AppError | null> = demo.value
        ? requestDemo()
        : verifyApiKey({ apiKey, endpoint });
      const [captureError, granted] = await Promise.all([sharing, access, opening]);
      if (overtaken(token)) return false;
      let keyError: AppError | null = null;
      let grant: DemoGrant | null = null;
      if (granted && 'key' in granted) grant = granted;
      else keyError = granted;
      if (grant) apiKey = grant.key;
      const startError = captureError ?? keyError ?? (await connect(apiKey, endpoint, target));
      if (overtaken(token)) return false;
      if (startError) {
        failWith(startError);
        return false;
      }
      overlay.canHearOriginal = capture.canControlOriginal();
      sync.started();
      liveError.value = null;
      active.value = true;
      away.start();
      // Only a tab alone: a microphone is never exactly silent, so it would never trip
      if (source.value === 'tab') silence.start();
      if (grant) {
        demoEndsAt.value = Date.now() + grant.seconds * 1000;
        demoTimer = setTimeout(endDemo, grant.seconds * 1000);
        overlay.setNotice(DEMO_STARTED_KEY, NOTICE_TTL_MS);
      }
      return true;
    } catch (err) {
      const error = logError('Could not start the live session', err);
      if (token === startToken) failWith(error);
      return false;
    } finally {
      if (token === startToken) starting.value = false;
    }
  }

  /**
   * Moves the captions to the floating window, and remembers the choice. Uses the click
   * up (the window needs it), so it must run synchronously in the click handler.
   * Resolves with why the window could not open, or null.
   */
  function popOut(): Promise<AppError | null> {
    overlay.placement = 'floating';
    return floating.open();
  }

  /** Brings the captions back to the live page, and remembers the choice; the session goes on. */
  function popIn(): void {
    overlay.placement = 'page';
    floating.close();
  }

  // SEC-1: forgetting the key ends the session that uses it
  watch(
    () => settings.apiKey,
    (key) => {
      // The demo runs on the demo server's key, not this one
      if (!key.trim() && !demo.value && (active.value || starting.value)) stop();
    },
  );
  // "Start over" in the bar: the screen is cleared there, the pipeline forgets here
  watch(
    () => overlay.conversation,
    () => pipeline.resetConversation(),
  );
  // The spending limit ends the session; lowering it below what was spent ends it too
  watch(
    () => [usdToEur(costUsd(record.usage)), settings.spendLimitEur] as const,
    ([spentEur, limit], [wasSpent]) => {
      if (!active.value || limit === null) return;
      if (spentEur >= limit) {
        fail('errors.spendLimit');
        return;
      }
      // Once, as the estimate crosses the line; a raised limit may cross it again later
      const line = limit * NEAR_LIMIT;
      if (spentEur >= line && (wasSpent ?? 0) < line) {
        overlay.setNotice(NEAR_LIMIT_KEY, NOTICE_TTL_MS);
      }
    },
  );
  // A model the price table does not know makes the limit blind: say so once per session
  watch(
    () => active.value && settings.spendLimitEur !== null && hasUnpricedUsage(record.usage),
    (blind) => {
      if (blind) overlay.setNotice(UNPRICED_KEY, NOTICE_TTL_MS);
    },
  );
  watch(
    () => overlay.originalVolume,
    (volume) => capture.setOriginalVolume(volume),
  );
  // A new target language applies from the next sentence, without restarting
  watch(
    () => settings.targetLanguage,
    (code) => {
      if (!active.value && !starting.value) return;
      pipeline.setTargetLanguage(languageName(code), code);
      overlay.pair = { ...overlay.pair, to: code.toUpperCase() };
    },
  );

  return {
    active,
    starting,
    errorKey,
    liveError,
    showLive,
    canFloat,
    wantsFloating,
    inPage,
    source,
    startingKey,
    /** The shared tab playing behind time in the page, while the sync option is on */
    syncedTab: sync.playback,
    syncDelaySeconds: sync.delaySeconds,
    syncLagSeconds: sync.lagSeconds,
    syncPaused: sync.paused,
    syncFailed: sync.failed,
    /** The captions the synced picture has reached */
    syncedLines: sync.reached,
    /** The shared tab sends no sound: the user should press play in it */
    tabSilent,
    /** The session is the free demo */
    demo,
    /** When the demo stops itself (epoch milliseconds), while one runs */
    demoEndsAt,
    start,
    stop,
    dismissError,
    popOut,
    popIn,
  };
});
