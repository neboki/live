<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useVoiceEngine } from '../../composables/useVoiceEngine';
import type { VoiceEngineName } from '../../types';

/**
 * Who reads the translation aloud, as a small dot beside the voice control: green for
 * OpenAI (and its interpreter), violet for ElevenLabs, amber for the browser's own voice,
 * hollow when nobody reads the line. The tooltip names it and, when the chosen voice is
 * not the one reading, says why (an amber ring marks that). Nothing shows while the voice
 * is off.
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
    :class="[
      `voice-tag--${engine.name === 'asHeard' ? 'as-heard' : engine.name}`,
      { 'voice-tag--warn': engine.reason, 'voice-tag--page': onPage },
    ]"
    role="status"
    :title="description"
    :aria-label="description"
    data-testid="voice-engine-tag"
  >
    <span class="voice-tag__dot" aria-hidden="true"></span>
    <span class="voice-tag__name">{{ name }}</span>
  </span>
</template>

<style scoped lang="scss">
// A small dot beside the speaker: its colour says who reads, the tooltip says it in words
.voice-tag {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 16px;
  height: 16px;
  cursor: help;

  &__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #8b8f98;
  }

  // The name stays for screen readers and the tooltip, not on screen
  &__name {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  // The interpreter is OpenAI's model: same colour
  &--openai &__dot,
  &--interpreter &__dot {
    background: #10a37f;
  }

  &--elevenlabs &__dot {
    background: #8b6cff;
  }

  &--browser &__dot {
    background: #ffb020;
  }

  // Nobody reads this line: a hollow dot
  &--as-heard &__dot {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px #8b8f98;
  }

  // Not the voice chosen (no key, or it failed): an amber ring says to look at the tooltip
  &--warn &__dot {
    box-shadow: 0 0 0 2px rgb(255 176 32 / 70%);
  }

  &--page &__dot {
    width: 10px;
    height: 10px;
  }
}
</style>
