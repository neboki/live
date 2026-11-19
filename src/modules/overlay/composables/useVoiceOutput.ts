import { onScopeDispose, watch } from 'vue';
import { useSessionRecord } from '@/modules/session';
import { ORIGINAL_LANGUAGE, useSettingsStore } from '@/modules/settings';
import { createElevenLabsTts } from '@/shared/providers/elevenlabs/tts';
import { createOpenAiVoice } from '@/shared/providers/openai/realtime/realtimeVoice';
import { createBrowserTts } from '@/shared/speech/browserTts';
import { spokenUpTo } from '@/shared/speech/sentences';
import type { TtsProvider } from '@/shared/speech/types';
import { useSpeech } from '@/shared/speech/useSpeech';
import { useOverlayStore } from '../store/useOverlayStore';
import type { ReadingEngine } from '../types';
import { dueLines, type PictureClock } from './pictureVoice';

const NOTICE_TTL_MS = 8000;
/** Why a line shown as it was said is not read aloud */
const SAME_LANGUAGE_KEY = 'overlay.voiceTag.sameLanguage';
const ONLY_CAPTIONS_KEY = 'overlay.voiceTag.onlyCaptions';

/**
 * Reads the translation aloud while the "voice" option is on, with the engine chosen in
 * settings.tts. Like an interpreter, it starts on each sentence as soon as it is complete,
 * while the rest of the line is still being written, and reads what is left when the line
 * is done. Playback stops and the queue empties when voice is turned off, the bar is
 * paused, the session stops (`live` turns false), the engine changes or the scope ends.
 * While the shared tab plays behind time (`picture`), each finished line is read instead
 * when the picture reaches its sentence, so voice, picture and captions go together.
 */
export function useVoiceOutput(
  /** The language to read the line in, given who said it */
  lang: (speaker: number | null) => string,
  live: () => boolean = () => true,
  /**
   * Whether a line said by `speaker` is read aloud; the "voice" option decides when
   * absent. A conversation reads only what goes to the person who wants to hear it.
   */
  wants?: (speaker: number | null) => boolean,
  /** The shared tab playing behind time; null while it is not */
  picture: () => PictureClock | null = () => null,
  now: () => number = () => Date.now(),
): void {
  const store = useOverlayStore();
  const settings = useSettingsStore();
  const record = useSessionRecord();

  /** The same engine, saying in the store that it is the one reading */
  function reporting(engine: TtsProvider, name: ReadingEngine): TtsProvider {
    return {
      ...engine,
      speak: (text, lang, signal) => {
        store.voiceEngine = name;
        return engine.speak(text, lang, signal);
      },
    };
  }

  const browser = reporting(
    createBrowserTts(() => store.voiceVolume),
    'browser',
  );
  // Both voices are billed to the user's own keys, so they count in the session cost
  const openAiVoice = createOpenAiVoice(
    () => ({
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.tts.model,
      voice: settings.tts.voice,
      volume: store.voiceVolume,
    }),
    (usage) => record.addUsage(usage),
  );
  const openAi = reporting(openAiVoice, 'openai');
  const elevenLabsVoice = createElevenLabsTts(
    () => ({
      apiKey: settings.voiceKey,
      model: settings.tts.elevenLabsModel,
      voice: settings.tts.elevenLabsVoice,
      volume: store.voiceVolume,
    }),
    (usage) => record.addUsage(usage),
  );
  const elevenLabs = reporting(elevenLabsVoice, 'elevenlabs');
  /** The line being read and how much of its text is already queued */
  let spokenId = 0;
  let spokenChars = 0;
  /** With the picture behind time: the first line of the record it has not reached yet */
  let nextLine = 0;
  /** The notice about lines shown as said was given this session */
  let toldAsHeard = false;

  function activeEngine(): TtsProvider {
    if (settings.tts.engine === 'elevenlabs' && settings.voiceKey) return elevenLabs;
    // OpenAI's voice is the default, also while ElevenLabs is chosen without its key
    if (settings.apiKey) return openAi;
    return browser;
  }

  const { speak, stop } = useSpeech({
    engine: activeEngine,
    fallback: browser,
    onError: (key) => {
      store.voiceProblem = key;
      store.setNotice(key, NOTICE_TTL_MS);
    },
    onBusy: (busy) => (store.voiceBusy = busy),
  });

  /** After a stop the chosen engine gets its turn again, so what was shown no longer holds */
  function stopAll(): void {
    stop();
    openAi.stop();
    elevenLabs.stop();
    store.voiceEngine = null;
    store.voiceProblem = null;
  }

  function voiceOn(speaker: number | null): boolean {
    return wants ? wants(speaker) : store.options.voice;
  }

  function canSpeak(speaker: number | null = store.translation.speaker ?? null): boolean {
    return live() && voiceOn(speaker) && !store.paused && !store.selfVoiced;
  }

  /**
   * A line shown as it was said (already in the user's language, or only transcribing) is
   * not read: the voice would repeat what can already be heard. Said once per session.
   */
  function skipAsHeard(): void {
    if (toldAsHeard || !store.options.voice) return;
    toldAsHeard = true;
    const onlyCaptions = settings.targetLanguage === ORIGINAL_LANGUAGE;
    store.setNotice(onlyCaptions ? ONLY_CAPTIONS_KEY : SAME_LANGUAGE_KEY, NOTICE_TTL_MS);
  }

  /** Reads the lines the picture behind time has just reached */
  function speakReached(): void {
    const clock = picture();
    if (!clock || clock.lagSeconds === null || clock.paused) return;
    const lines = record.lines;
    const { due, next } = dueLines(
      lines,
      Math.min(nextLine, lines.length),
      now() - clock.lagSeconds * 1000,
    );
    nextLine = next;
    due.forEach((line) => {
      const speaker = line.speaker ?? null;
      if (!canSpeak(speaker)) return;
      const text = line.translation.trim();
      // Recorded as said: no translation, or the very words heard
      if (!text || text === line.source.trim()) skipAsHeard();
      else speak(text, lang(speaker));
    });
  }

  /** Queues the text of the current line between `spokenChars` and `upTo`. */
  function speakUpTo(upTo: number): void {
    const { id, text, speaker } = store.translation;
    const piece = text.slice(spokenChars, upTo).trim();
    spokenId = id;
    spokenChars = upTo;
    if (piece) speak(piece, lang(speaker ?? null));
  }

  watch(
    () => [store.translation.id, store.translation.text, store.translation.done] as const,
    ([id, text, done]) => {
      if (id !== spokenId) {
        spokenId = id;
        spokenChars = 0;
      }
      // Behind time, lines are read when the picture gets to them (speakReached)
      if (!id || picture() || !canSpeak()) return;
      if (store.translation.asHeard) {
        skipAsHeard();
        return;
      }
      speakUpTo(done ? text.length : spokenUpTo(text, spokenChars));
    },
  );
  watch(
    () => live() && store.options.voice && !store.paused,
    (on) => {
      if (!on) stopAll();
    },
  );
  watch(live, (on) => {
    if (!on) toldAsHeard = false;
  });
  // The picture starts or stops playing behind time: what was queued belongs to the other
  // clock, and only lines heard from now on are read on the picture's
  watch(
    () => picture() !== null,
    () => {
      stopAll();
      nextLine = record.lines.length;
    },
  );
  watch(() => [picture()?.lagSeconds, record.lines.length] as const, speakReached);
  watch(
    () => picture()?.paused === true,
    (paused) => {
      if (paused) stopAll();
    },
  );
  // Turned on mid-conversation: read the last finished sentence right away
  watch(
    () => store.options.voice,
    (on) => {
      const { id, done, text, asHeard } = store.translation;
      if (on && done && text.trim() && !asHeard && !picture() && canSpeak()) {
        spokenId = id;
        spokenChars = 0;
        speakUpTo(text.length);
      }
    },
  );
  watch(
    () => settings.tts.engine,
    () => stopAll(),
  );
  // A key added or fixed: the chosen engine gets its turn again with the next sentence
  watch(
    () => [settings.apiKey, settings.voiceKey] as const,
    () => stopAll(),
  );
  onScopeDispose(() => {
    stopAll();
    openAi.close?.();
    elevenLabs.close?.();
  });
}
