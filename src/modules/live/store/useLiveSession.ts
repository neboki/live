import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { NEAR_SPEND_LIMIT, useFloatingWindow, useOverlayStore } from '@/modules/overlay';
import { costUsd, hasUnpricedUsage, usdToEur, useSessionRecord } from '@/modules/session';
import { useSettingsStore } from '@/modules/settings';
import { createAudioCapture } from '@/shared/audio/audioCapture';
import { unlockAudio } from '@/shared/audio/unlockAudio';
import { endedMessageKey, needsShare, startingMessageKey, type AudioSource } from '@/shared/audio';
import { logError, type AppError } from '@/shared/errors';
import { DEMO_API, TIER_MODELS } from '@/shared/providers/openai/config';
import { type DemoGrant, requestDemo } from '@/shared/providers/openai/demo';
import { verifyApiKey } from '@/shared/providers/openai/llm/chat';
import { openAiLlm } from '@/shared/providers/openai/llm/openAiLlm';
import { openAiRealtimeStt } from '@/shared/providers/openai/realtime/realtimeStt';
import { createSessionPipeline } from '../pipeline/sessionPipeline';
import type { ModelRole } from '../pipeline/types';
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
/** Shown while the shared tab sends no sound at all: its video is most likely paused */
const TAB_SILENT_KEY = 'live.tabSilent';
/** Shown as the free demo starts, and on the home screen once its time is up */
const DEMO_STARTED_KEY = 'live.demoStarted';
const DEMO_ENDED_KEY = 'errors.demoEnded';

export interface StartOptions {
  /** The free demo: no key needed, the cheapest models, a few minutes. Default: as last time */
  demo?: boolean;
  /** What the session is for; 'listen' by default */
  mode?: LiveMode;
  /** Conversation: the other person's language (ISO 639-1) */
  partner?: string;
  /** Translating a voice note: the audio the app plays, listened to instead of a microphone */
  stream?: MediaStream;
  /**
   * Speak the translation as people talk (the interpreter model) rather than read each
   * sentence aloud once it is translated. Ignored in a conversation, which goes both ways.
   */
  interpret?: boolean;
}

/**
 * listen: others talk, the user reads or hears them in their language.
 * talk: two people, two languages, the screen split between them.
 * present: the user talks, the room reads (big screen) or hears them in its language.
 * audio: a voice note or recording, subtitled while it plays.
 */
export type LiveMode = 'listen' | 'talk' | 'present' | 'audio';

/** What each person in a conversation gets of the other's words */
export type Receive = 'read' | 'hear' | 'none';

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
  const sync = createVideoSync({
    capture,
    overlay,
    lines: () => record.lines,
    captionDueFrom: () => pipeline.captionDueFrom(),
  });
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
  /** What the running (or last) session is for */
  const mode = ref<LiveMode>('listen');
  /** Conversation: the other person's language (ISO 639-1), '' outside one */
  const partner = ref('');
  /** Conversation: what the user and the other person get of each other's words */
  const receive = reactive<{ user: Receive; partner: Receive }>({ user: 'read', partner: 'read' });
  /** Headphones were found as the microphone opened: the voice won't echo into it */
  const headset = ref(false);
  /** The running session speaks as people talk (interpreter) */
  const interpreting = ref(false);
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

  /** The app is reading aloud with no headphones to keep its voice out of the microphone */
  function hearsItself(): boolean {
    return overlay.voiceBusy && !headset.value && !source.value.includes('tab');
  }

  /**
   * The demo server only takes the cheapest models; the user's choice is for their key.
   * Asked to speak as people talk, the interpreter does it; a conversation goes both
   * ways, which the interpreter (one target language) cannot, so it reads aloud instead.
   */
  function modelsFor(): Partial<Record<ModelRole, string>> {
    if (demo.value) return { ...TIER_MODELS.low };
    const chosen = { ...settings.models };
    const twoWay = partner.value !== '';
    if (twoWay && settings.tier === 'interpreter') return { ...TIER_MODELS.low };
    if (interpreting.value && !twoWay) return { ...TIER_MODELS.interpreter };
    return chosen;
  }

  async function connect(
    apiKey: string,
    endpoint: string | undefined,
    target: string,
  ): Promise<AppError | null> {
    recording = true;
    record.begin({ pair: { ...overlay.pair }, startedAt: Date.now(), glossary: overlay.glossary });
    const other = partner.value;
    return pipeline.start({
      apiKey,
      endpoint,
      targetLanguage: languageName(target),
      targetCode: target,
      models: modelsFor(),
      // A conversation tells the transcriber which two languages to expect
      languages: other ? [target, other] : [...settings.meeting.languages],
      topic: settings.meeting.topic,
      ...(other
        ? {
            partner: {
              code: other,
              language: languageName(other) ?? other,
              toUser: () => receive.user !== 'none',
              toPartner: () => receive.partner !== 'none',
            },
          }
        : {}),
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
    // Phones only let a page make sound from a tap: the voice's output opens now
    unlockAudio();
    mode.value = options.mode ?? 'listen';
    const listening = mode.value === 'listen';
    // Only listening can take a shared tab; the other modes hear the room (or a voice note)
    const wanted: AudioSource = listening ? settings.audioSource : 'mic';
    if (!canFloat && needsShare(wanted) && !options.stream) {
      fail('errors.pipUnsupported');
      return false;
    }
    const token = ++startToken;
    starting.value = true;
    demo.value = options.demo ?? demo.value;
    errorKey.value = null;
    source.value = wanted;
    partner.value = mode.value === 'talk' ? (options.partner ?? '') : '';
    interpreting.value = (options.interpret ?? false) && mode.value !== 'talk';
    headset.value = false;
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
            // Reading aloud through the speaker, the microphone would hear the app itself:
            // it hears silence until the voice is done
            pipeline.pushAudio(hearsItself() ? new Int16Array(pcm.length) : pcm);
            away.chunk(pcm);
            silence.chunk(pcm);
          },
          onLevel: (level) => overlay.setLevel(level),
          // A voice note that played to its end is done, not broken
          onEnded: (input) => (options.stream ? stop() : fail(endedMessageKey(input))),
        },
        {
          source: source.value,
          micDeviceId: settings.micDeviceId,
          ...(options.stream ? { stream: options.stream } : {}),
        },
      );
      const opening = wantsFloating.value && listening ? floating.open() : Promise.resolve(null);
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
      headset.value = capture.hasHeadset();
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
      const line = limit * NEAR_SPEND_LIMIT;
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
    /** The synced picture holds until a late caption arrives */
    syncWaiting: sync.waiting,
    syncFailed: sync.failed,
    /** The captions the synced picture has reached */
    syncedLines: sync.reached,
    /** The shared tab sends no sound: the user should press play in it */
    tabSilent,
    /** The session is the free demo */
    demo,
    /** When the demo stops itself (epoch milliseconds), while one runs */
    demoEndsAt,
    mode,
    partner,
    receive,
    headset,
    interpreting,
    start,
    stop,
    dismissError,
    popOut,
    popIn,
  };
});
