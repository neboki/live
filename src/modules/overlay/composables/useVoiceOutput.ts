import { onScopeDispose, watch } from 'vue';
import { useSessionRecord } from '@/modules/session';
import { useSettingsStore } from '@/modules/settings';
import { createOpenAiTts } from '@/shared/providers/openai/tts/tts';
import { createBrowserTts } from '@/shared/speech/browserTts';
import { spokenUpTo } from '@/shared/speech/sentences';
import type { TtsProvider } from '@/shared/speech/types';
import { useSpeech } from '@/shared/speech/useSpeech';
import { useOverlayStore } from '../store/useOverlayStore';

const NOTICE_TTL_MS = 8000;

/**
 * Reads the translation aloud while the "voice" option is on, with the engine chosen in
 * settings.tts. Like an interpreter, it starts on each sentence as soon as it is complete,
 * while the rest of the line is still being written, and reads what is left when the line
 * is done. Playback stops and the queue empties when voice is turned off, the bar is
 * paused, the session stops (`live` turns false), the engine changes or the scope ends.
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
): void {
  const store = useOverlayStore();
  const settings = useSettingsStore();
  const record = useSessionRecord();
  const browser = createBrowserTts(() => store.voiceVolume);
  // OpenAI speech is billed to the key, so it counts in the session cost
  const openAi = createOpenAiTts(
    () => ({
      apiKey: settings.apiKey,
      endpoint: settings.endpoint,
      model: settings.tts.model,
      voice: settings.tts.voice,
      volume: store.voiceVolume,
    }),
    (usage) => record.addUsage(usage),
  );
  /** The line being read and how much of its text is already queued */
  let spokenId = 0;
  let spokenChars = 0;

  function activeEngine(): TtsProvider {
    return settings.tts.engine === 'openai' && settings.apiKey ? openAi : browser;
  }

  const { speak, stop } = useSpeech({
    engine: activeEngine,
    fallback: browser,
    onError: (key) => store.setNotice(key, NOTICE_TTL_MS),
    onBusy: (busy) => (store.voiceBusy = busy),
  });

  function stopAll(): void {
    stop();
    openAi.stop();
  }

  function voiceOn(): boolean {
    const speaker = store.translation.speaker ?? null;
    return wants ? wants(speaker) : store.options.voice;
  }

  function canSpeak(): boolean {
    return live() && voiceOn() && !store.paused && !store.selfVoiced;
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
      if (!id || !canSpeak()) return;
      speakUpTo(done ? text.length : spokenUpTo(text, spokenChars));
    },
  );
  watch(
    () => live() && store.options.voice && !store.paused,
    (on) => {
      if (!on) stopAll();
    },
  );
  // Turned on mid-conversation: read the last finished sentence right away
  watch(
    () => store.options.voice,
    (on) => {
      const { id, done, text } = store.translation;
      if (on && done && text.trim() && canSpeak()) {
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
    openAi.close?.();
  });
}
