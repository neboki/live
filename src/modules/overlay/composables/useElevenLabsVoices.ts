import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { AppError, logError } from '@/shared/errors';
import {
  type ElevenLabsVoice,
  STANDARD_ELEVENLABS_VOICES,
  listElevenLabsVoices,
} from '@/shared/providers/elevenlabs/voices';

/** Shorter than any ElevenLabs key: not worth asking for the voices yet */
export const MIN_ELEVENLABS_KEY_CHARS = 20;

export interface ElevenLabsVoices {
  /** The account's voices; empty until loaded or without a key */
  voices: Ref<ElevenLabsVoice[]>;
  loading: Ref<boolean>;
  /** i18n key of why the voices could not be loaded, or null */
  error: Ref<string | null>;
  /** The key may speak but not list the account's voices: the standard ones are offered */
  limited: Ref<boolean>;
}

/** The voices of the ElevenLabs account behind `key`, reloaded whenever the key changes. */
export function useElevenLabsVoices(key: () => string): ElevenLabsVoices {
  const voices = ref<ElevenLabsVoice[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const limited = ref(false);
  let controller: AbortController | null = null;

  async function load(value: string): Promise<void> {
    controller?.abort();
    voices.value = [];
    error.value = null;
    limited.value = false;
    if (value.trim().length < MIN_ELEVENLABS_KEY_CHARS) return;
    const mine = new AbortController();
    controller = mine;
    loading.value = true;
    try {
      voices.value = await listElevenLabsVoices(value, mine.signal);
    } catch (err) {
      if (mine.signal.aborted) return;
      if (err instanceof AppError && err.userMessageKey === 'errors.ttsPermission') {
        // A key restricted to text to speech works; it just cannot see the voice list
        voices.value = [...STANDARD_ELEVENLABS_VOICES];
        limited.value = true;
        return;
      }
      logError('Loading the ElevenLabs voices failed', err);
      const refused = err instanceof AppError && err.userMessageKey === 'errors.ttsKey';
      error.value = refused ? 'overlay.voice.keyRefused' : 'overlay.voice.loadFailed';
    } finally {
      if (controller === mine) {
        loading.value = false;
        controller = null;
      }
    }
  }

  watch(key, (value) => void load(value), { immediate: true });
  onScopeDispose(() => controller?.abort());

  return { voices, loading, error, limited };
}
