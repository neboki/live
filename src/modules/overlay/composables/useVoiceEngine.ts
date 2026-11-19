import { computed, type ComputedRef } from 'vue';
import { useSettingsStore } from '@/modules/settings';
import { useOverlayStore } from '../store/useOverlayStore';
import type { VoiceEngineName } from '../types';

export interface VoiceEngineState {
  name: VoiceEngineName;
  /** i18n key of why the browser reads instead of the chosen engine; null when it does not */
  reason: string | null;
}

/** Why the browser reads when the chosen engine has no key */
export const MISSING_KEY_REASON: Readonly<Record<'openai' | 'elevenlabs', string>> = {
  openai: 'overlay.voiceTag.noOpenAiKey',
  elevenlabs: 'overlay.voiceTag.noElevenLabsKey',
};
/** The browser read after the chosen engine failed, without a more precise reason */
const FAILED_REASON = 'errors.ttsFailed';

/**
 * Who reads the translation aloud, for the tag beside the voice control; null while the
 * voice is off. What actually read the last sentence wins; before one is read, the engine
 * that will (the chosen one, or the browser's own voice when the chosen one has no key).
 */
export function useVoiceEngine(): ComputedRef<VoiceEngineState | null> {
  const store = useOverlayStore();
  const settings = useSettingsStore();

  return computed(() => {
    if (!store.options.voice) return null;
    if (store.selfVoiced) return { name: 'interpreter', reason: null };
    const chosen = settings.tts.engine;
    const hasKey = chosen === 'elevenlabs' ? !!settings.voiceKey : !!settings.apiKey;
    const used = store.voiceEngine;
    if (used === 'browser') {
      return {
        name: 'browser',
        reason: store.voiceProblem ?? (hasKey ? FAILED_REASON : MISSING_KEY_REASON[chosen]),
      };
    }
    if (used) return { name: used, reason: null };
    return hasKey
      ? { name: chosen, reason: null }
      : { name: 'browser', reason: MISSING_KEY_REASON[chosen] };
  });
}
