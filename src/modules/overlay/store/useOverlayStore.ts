import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import type { PipSize } from '@/shared/pip/useDocumentPip';
import { writeStorage } from '@/shared/storage/safeStorage';
import { BAR_HEIGHT, BAR_WIDTH, PREFS_STORAGE_KEY } from '../constants';
import type {
  BarSize,
  CaptionActivity,
  CaptionPlacement,
  HistoryLine,
  LanguagePair,
  ListeningMode,
  OverlayOption,
  OverlayPrefs,
  OverlayTheme,
  Suggestion,
  Translation,
} from '../types';
import { clampTo } from '../utils/range';
import { loadPrefs, storedPrefs } from './overlayPrefs';

const MAX_HISTORY = 50;
const MAX_SUMMARY_POINTS = 4;
/** Original audio under the translated voice: still there, but out of its way */
const ORIGINAL_UNDER_VOICE = 0.25;

export const useOverlayStore = defineStore('overlay', () => {
  // Preferences (remembered on this device)
  const saved = loadPrefs();
  const options = reactive<Record<OverlayOption, boolean>>(saved.options);
  /** A conversation or a talk: what the summary keeps, and replies or questions */
  const mode = ref<ListeningMode>(saved.mode);
  const glossary = ref(saved.glossary);
  const scale = ref(saved.scale);
  const opacity = ref(saved.opacity);
  const theme = ref<OverlayTheme>(saved.theme);
  const voiceVolume = ref(saved.voiceVolume);
  const originalLevel = ref(saved.originalLevel);
  /** Bumped by clearConversation(), so a running session can forget its voices and context */
  const conversation = ref(0);
  const size = ref<BarSize>(saved.size);
  const pipSize = ref<PipSize | null>(saved.pipSize);
  /** The shared tab shows in the page, behind time, in step with the captions */
  const syncVideo = ref(saved.syncVideo);
  /** Seconds it is held behind real time: fixed, so picture and sound run smoothly */
  const syncDelay = ref(saved.syncDelay);
  /** It holds its picture for a late caption, then goes on further behind */
  const syncWait = ref(saved.syncWait);
  /** Where the captions go when a session starts: the page or the floating window */
  const placement = ref<CaptionPlacement>(saved.placement);

  // Bar state
  const paused = ref(false);
  const minimized = ref(false);
  /** Hidden with Ctrl+Shift+Space, wherever the bar is; the session goes on */
  const hidden = ref(false);
  /** The caption text is put away (CC off) while the bar, the voice and the session go on */
  const captionsHidden = ref(false);
  /**
   * What the user hears of the shared tab. Turning the translated voice on silences
   * the original, turning it off brings it back; either can then be changed by hand.
   */
  const hearOriginal = ref(!saved.options.voice);
  /** Only a shared tab's audio can be controlled (a shared screen keeps playing it) */
  const canHearOriginal = ref(false);
  /** The shared tab came with its picture, and this browser can play it behind time */
  const canSyncVideo = ref(false);
  /** The translator speaks by itself (interpreter mode): nothing else reads the captions aloud */
  const selfVoiced = ref(false);
  /** A translation is being read aloud right now */
  const voiceBusy = ref(false);
  /** i18n key of a transient, non-fatal message (rate limit, reconnecting…) */
  const notice = ref<string | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  // Live content
  const pair = ref<LanguagePair>({ from: '', to: '' });
  const latencyMs = ref<number | null>(null);
  const level = ref(0);
  const activity = ref<CaptionActivity | null>(null);
  const source = reactive({ text: '', partial: false });
  const translation = ref<Translation>({ id: 0, text: '', done: false });
  const history = ref<HistoryLine[]>([]);
  /** Names the user gave to the voices told apart ("Voice 1" → "Jim"); this session only */
  const speakerNames = ref<Readonly<Record<number, string>>>({});
  const suggestions = ref<Suggestion[]>([]);
  const summary = ref<string[]>([]);

  const waiting = computed(() => translation.value.id === 0);
  const previous = computed(() => history.value.at(-1)?.text ?? '');
  // Telling speakers apart is on by default and not an extra panel
  const activeExtras = computed(
    () => Object.entries(options).filter(([key, on]) => on && key !== 'speakers').length,
  );
  const visibleSummary = computed(() => summary.value.slice(-MAX_SUMMARY_POINTS));
  const resized = computed(() => size.value.width !== null || size.value.height !== null);
  const originalVolume = computed(() => {
    if (!hearOriginal.value) return 0;
    return originalLevel.value * (options.voice ? ORIGINAL_UNDER_VOICE : 1);
  });

  function toggleOption(option: OverlayOption): void {
    options[option] = !options[option];
  }

  /** Shows `key` (null clears it). With `ttlMs` it clears itself after that time. */
  function setNotice(key: string | null, ttlMs?: number): void {
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
    notice.value = key;
    if (key === null || ttlMs === undefined) return;
    noticeTimer = setTimeout(() => {
      noticeTimer = undefined;
      notice.value = null;
    }, ttlMs);
  }

  /** The transcriber reported the spoken language ("ja" → "JA"). */
  function setDetectedLanguage(code: string): void {
    const trimmed = code.trim();
    if (trimmed) pair.value = { ...pair.value, from: trimmed.toUpperCase() };
  }

  function reset(nextPair: LanguagePair): void {
    pair.value = nextPair;
    latencyMs.value = null;
    level.value = 0;
    activity.value = null;
    source.text = '';
    source.partial = false;
    translation.value = { id: 0, text: '', done: false };
    history.value = [];
    speakerNames.value = {};
    suggestions.value = [];
    summary.value = [];
    setNotice(null);
  }

  function setSource(text: string, partial: boolean): void {
    source.text = text;
    source.partial = partial;
  }

  /** Starts a new sentence; the previous one moves to the history. */
  function startTranslation(text = '', speaker: number | null = null): void {
    const current = translation.value;
    if (current.id > 0 && current.text.trim()) {
      const line = { id: current.id, text: current.text.trim(), speaker: current.speaker ?? null };
      history.value = [...history.value, line].slice(-MAX_HISTORY);
    }
    translation.value = { id: current.id + 1, text, done: false, speaker };
  }

  /** Empty screen, same session: captions, voices, summary and suggestions start over */
  function clearConversation(): void {
    reset({ ...pair.value });
    conversation.value++;
  }

  function setSpeakerName(speaker: number, name: string): void {
    const trimmed = name.trim();
    const rest = Object.fromEntries(
      Object.entries(speakerNames.value).filter(([key]) => Number(key) !== speaker),
    );
    speakerNames.value = trimmed ? { ...rest, [speaker]: trimmed } : rest;
  }

  function appendTranslation(chunk: string): void {
    translation.value = { ...translation.value, text: translation.value.text + chunk };
  }

  function finishTranslation(): void {
    translation.value = { ...translation.value, done: true };
  }

  function setLatency(ms: number): void {
    latencyMs.value = ms;
  }

  function setActivity(next: CaptionActivity | null): void {
    activity.value = next;
  }

  function setLevel(value: number): void {
    level.value = Math.min(1, Math.max(0, value));
  }

  /** Resizes the bar; a missing side keeps its current value. */
  function setSize(next: Partial<BarSize>): void {
    const width = next.width === undefined ? size.value.width : next.width;
    const height = next.height === undefined ? size.value.height : next.height;
    size.value = {
      width: width === null ? null : Math.round(clampTo(BAR_WIDTH, width)),
      height: height === null ? null : Math.round(clampTo(BAR_HEIGHT, height)),
    };
  }

  function resetSize(): void {
    size.value = { width: null, height: null };
  }

  function setSuggestions(next: Suggestion[]): void {
    suggestions.value = next;
  }

  function setSummary(points: string[]): void {
    summary.value = points;
  }

  watch(
    () => options.voice,
    (voice) => (hearOriginal.value = !voice),
  );
  // Replies to a conversation make no sense as questions about a talk, nor the other way
  watch(mode, () => (suggestions.value = []));
  watch(
    [
      options,
      mode,
      glossary,
      scale,
      opacity,
      theme,
      voiceVolume,
      originalLevel,
      size,
      pipSize,
      syncVideo,
      syncDelay,
      syncWait,
      placement,
    ],
    () => {
      const prefs: OverlayPrefs = {
        options: { ...options },
        mode: mode.value,
        glossary: glossary.value,
        scale: scale.value,
        opacity: opacity.value,
        theme: theme.value,
        voiceVolume: voiceVolume.value,
        originalLevel: originalLevel.value,
        size: size.value,
        pipSize: pipSize.value,
        syncVideo: syncVideo.value,
        syncDelay: syncDelay.value,
        syncWait: syncWait.value,
        placement: placement.value,
      };
      writeStorage(PREFS_STORAGE_KEY, JSON.stringify(storedPrefs(prefs)));
    },
    { deep: true },
  );

  return {
    options,
    mode,
    glossary,
    scale,
    opacity,
    theme,
    voiceVolume,
    originalLevel,
    conversation,
    size,
    pipSize,
    syncVideo,
    syncDelay,
    syncWait,
    placement,
    paused,
    minimized,
    hidden,
    captionsHidden,
    hearOriginal,
    canHearOriginal,
    canSyncVideo,
    selfVoiced,
    voiceBusy,
    originalVolume,
    notice,
    pair,
    latencyMs,
    level,
    activity,
    source,
    translation,
    history,
    speakerNames,
    suggestions,
    summary,
    waiting,
    previous,
    activeExtras,
    visibleSummary,
    resized,
    toggleOption,
    setNotice,
    setDetectedLanguage,
    reset,
    setSource,
    startTranslation,
    setSpeakerName,
    clearConversation,
    appendTranslation,
    finishTranslation,
    setLatency,
    setLevel,
    setActivity,
    setSize,
    resetSize,
    setSuggestions,
    setSummary,
  };
});
