import { onScopeDispose, watch } from 'vue';
import { useSessionRecord } from '@/modules/session';
import { useSettingsStore } from '@/modules/settings';
import { createElevenLabsTts } from '@/shared/providers/elevenlabs/tts';
import { createBrowserTts } from '@/shared/speech/browserTts';
import { spokenUpTo } from '@/shared/speech/sentences';
import type { TtsProvider } from '@/shared/speech/types';
import { useSpeech } from '@/shared/speech/useSpeech';
import { useOverlayStore } from '../store/useOverlayStore';
import { dueLines, type PictureClock } from './pictureVoice';

const NOTICE_TTL_MS = 8000;

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
  const browser = createBrowserTts(() => store.voiceVolume);
  // ElevenLabs speech is billed to the user's ElevenLabs key, so it counts in the session cost
  const elevenLabs = createElevenLabsTts(
    () => ({
      apiKey: settings.voiceKey,
      model: settings.tts.model,
      voice: settings.tts.voice,
      volume: store.voiceVolume,
    }),
    (usage) => record.addUsage(usage),
  );
  /** The line being read and how much of its text is already queued */
  let spokenId = 0;
  let spokenChars = 0;
  /** With the picture behind time: the first line of the record it has not reached yet */
  let nextLine = 0;

  function activeEngine(): TtsProvider {
    return settings.tts.engine === 'elevenlabs' && settings.voiceKey ? elevenLabs : browser;
  }

  const { speak, stop } = useSpeech({
    engine: activeEngine,
    fallback: browser,
    onError: (key) => store.setNotice(key, NOTICE_TTL_MS),
    onBusy: (busy) => (store.voiceBusy = busy),
  });

  function stopAll(): void {
    stop();
    elevenLabs.stop();
  }

  function voiceOn(speaker: number | null): boolean {
    return wants ? wants(speaker) : store.options.voice;
  }

  function canSpeak(speaker: number | null = store.translation.speaker ?? null): boolean {
    return live() && voiceOn(speaker) && !store.paused && !store.selfVoiced;
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
      if (canSpeak(speaker)) speak(line.translation.trim(), lang(speaker));
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
      speakUpTo(done ? text.length : spokenUpTo(text, spokenChars));
    },
  );
  watch(
    () => live() && store.options.voice && !store.paused,
    (on) => {
      if (!on) stopAll();
    },
  );
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
      const { id, done, text } = store.translation;
      if (on && done && text.trim() && !picture() && canSpeak()) {
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
  onScopeDispose(() => {
    stopAll();
    elevenLabs.close?.();
  });
}
