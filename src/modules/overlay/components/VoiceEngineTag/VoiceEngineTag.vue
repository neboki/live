<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVoiceEngine } from '../../composables/useVoiceEngine';
import type { VoiceEngineName } from '../../types';

/**
 * Who reads the translation aloud, beside the voice control: OpenAI, ElevenLabs, the
 * translator itself, or the browser's own voice. The browser only reads when the chosen
 * voice has no key or failed, so it is marked as a warning and its tooltip says why.
 * Nothing shows while the voice is off.
 */
defineProps<{
  /** On the page itself (light or dark), not on the bar's dark glass */
  onPage?: boolean;
}>();

const engine = useVoiceEngine();
const { t } = useI18n();

const NAMES: Readonly<Record<VoiceEngineName, string>> = {
  openai: 'overlay.voiceTag.openai',
  elevenlabs: 'overlay.voiceTag.elevenlabs',
  browser: 'overlay.voiceTag.browser',
  interpreter: 'overlay.voiceTag.interpreter',
  asHeard: 'overlay.voiceTag.asHeard',
};

const name = computed(() => (engine.value ? t(NAMES[engine.value.name]) : ''));
const description = computed(() => {
  const state = engine.value;
  if (!state) return '';
  if (state.name === 'asHeard') return t('overlay.voiceTag.asHeardHint');
  const who = t('overlay.voiceTag.reading', { engine: name.value });
  return state.reason ? `${who}. ${t(state.reason)}` : who;
});
</script>

<template>
  <span
    v-if="engine"
    class="voice-tag"
    :class="[`voice-tag--${engine.name}`, { 'voice-tag--page': onPage }]"
    role="status"
    :title="description"
    :aria-label="description"
    data-testid="voice-engine-tag"
  >
    <span v-if="engine.reason" class="voice-tag__warn" aria-hidden="true">!</span>
    {{ name }}
  </span>
</template>

<style scoped lang="scss">
.voice-tag {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgb(255 255 255 / 10%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 22%);
  color: var(--glass-fg, #fff);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;

  // The interpreter is OpenAI's model: same colour
  &--openai,
  &--interpreter {
    background: rgb(16 163 127 / 18%);
    box-shadow: inset 0 0 0 1px rgb(16 163 127 / 55%);
  }

  &--elevenlabs {
    background: rgb(124 92 255 / 20%);
    box-shadow: inset 0 0 0 1px rgb(124 92 255 / 60%);
  }

  &--browser {
    background: rgb(255 176 32 / 18%);
    box-shadow: inset 0 0 0 1px rgb(255 176 32 / 60%);
    color: #ffd27a;
  }

  &__warn {
    display: grid;
    place-items: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #ffb020;
    color: #1a1a1a;
    font-size: 9px;
    font-weight: 800;
  }

  // On the page the word takes the page's own text colour, readable in light and dark
  &--page,
  &--page.voice-tag--browser {
    padding: 4px 10px;
    color: var(--fg);
    font-size: 12px;
  }
}
</style>
