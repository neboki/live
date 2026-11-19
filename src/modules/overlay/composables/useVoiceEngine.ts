import { computed, type ComputedRef } from 'vue';
import { useSettingsStore } from '@/modules/settings';
import { useOverlayStore } from '../store/useOverlayStore';
import type { VoiceEngineName } from '../types';

export interface VoiceEngineState {
  name: VoiceEngineName;
  /** i18n key of why the chosen engine is not the one reading; null when it is */
  reason: string | null;
}

const NO_OPENAI_KEY = 'overlay.voiceTag.noOpenAiKey';
const NO_ELEVENLABS_KEY = 'overlay.voiceTag.noElevenLabsKey';
/** The browser read after the chosen engine failed, without a more precise reason */
const FAILED_REASON = 'errors.ttsFailed';

/**
 * Who reads the translation aloud, for the tag beside the voice control; null while the
 * voice is off. What actually read the last sentence wins; before one is read, the engine
 * that will: ElevenLabs when chosen with its key, otherwise OpenAI's voice with the OpenAI
 * key, otherwise the browser's own voice (as useVoiceOutput picks it).
 */
export function useVoiceEngine(): ComputedRef<VoiceEngineState | null> {
  const store = useOverlayStore();
  const settings = useSettingsStore();

  return computed(() => {
    if (!store.options.voice) return null;
    if (store.selfVoiced) return { name: 'interpreter', reason: null };
    const wantsElevenLabs = settings.tts.engine === 'elevenlabs';
    const elevenLabs = wantsElevenLabs && !!settings.voiceKey;
    const openAi = !!settings.apiKey;
    const used = store.voiceEngine;
    if (used === 'browser') {
      const missing = wantsElevenLabs ? NO_ELEVENLABS_KEY : NO_OPENAI_KEY;
      return {
        name: 'browser',
        reason: store.voiceProblem ?? (elevenLabs || openAi ? FAILED_REASON : missing),
      };
    }
    const name = used ?? (elevenLabs ? 'elevenlabs' : openAi ? 'openai' : 'browser');
    if (name === 'elevenlabs') return { name, reason: null };
    if (name === 'openai') return { name, reason: wantsElevenLabs ? NO_ELEVENLABS_KEY : null };
    return { name, reason: wantsElevenLabs ? NO_ELEVENLABS_KEY : NO_OPENAI_KEY };
  });
}
