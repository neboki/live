import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { AppError, logError } from '@/shared/errors';
import { type ElevenLabsVoice, listElevenLabsVoices } from '@/shared/providers/elevenlabs/voices';

/** Shorter than any ElevenLabs key: not worth asking for the voices yet */
export const MIN_ELEVENLABS_KEY_CHARS = 20;

export interface ElevenLabsVoices {
  /** The account's voices; empty until loaded or without a key */
  voices: Ref<ElevenLabsVoice[]>;
  loading: Ref<boolean>;
  /** i18n key of why the voices could not be loaded, or null */
  error: Ref<string | null>;
}

/** The voices of the ElevenLabs account behind `key`, reloaded whenever the key changes. */
export function useElevenLabsVoices(key: () => string): ElevenLabsVoices {
  const voices = ref<ElevenLabsVoice[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;

  async function load(value: string): Promise<void> {
    controller?.abort();
    voices.value = [];
    error.value = null;
    if (value.trim().length < MIN_ELEVENLABS_KEY_CHARS) return;
    const mine = new AbortController();
    controller = mine;
    loading.value = true;
    try {
      voices.value = await listElevenLabsVoices(value, mine.signal);
    } catch (err) {
      if (mine.signal.aborted) return;
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

  return { voices, loading, error };
}
