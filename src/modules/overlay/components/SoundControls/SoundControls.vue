<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { VOICE_VOLUME_RANGE, VOLUME_RANGE } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';
import type { NumberRange } from '../../types';
import { fractionOf, stepTo } from '../../utils/range';

type VolumeKey = 'voiceVolume' | 'originalLevel';

/**
 * How loud the translated voice and the original audio are. The original applies at
 * once; the voice from the next sentence (one already playing keeps its volume).
 */
defineProps<{
  /** A real session: says why the original cannot be adjusted when a screen was shared */
  live?: boolean;
}>();

const store = useOverlayStore();
const { t, locale } = useI18n();
const percent = computed(
  () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }),
);

function label(key: VolumeKey): string {
  return percent.value.format(store[key]);
}

/** The voice can be boosted past 100%; the original cannot */
const RANGES: Readonly<Record<VolumeKey, Readonly<NumberRange>>> = {
  voiceVolume: VOICE_VOLUME_RANGE,
  originalLevel: VOLUME_RANGE,
};

function fill(key: VolumeKey): string {
  return `${fractionOf(RANGES[key], store[key]) * 100}%`;
}

// No instanceof: inside the floating window the input belongs to another window
function onInput(key: VolumeKey, event: Event): void {
  const value = Number((event.target as HTMLInputElement | null)?.value);
  if (Number.isFinite(value)) store[key] = stepTo(RANGES[key], value);
}
</script>

<template>
  <section class="sound" :aria-label="t('overlay.sound.title')">
    <h3 class="sound__title">{{ t('overlay.sound.title') }}</h3>

    <label class="sound__row">
      <span>{{ t('overlay.sound.voice') }}</span>
      <output class="sound__value">{{ label('voiceVolume') }}</output>
      <input
        class="sound__range"
        type="range"
        :min="VOICE_VOLUME_RANGE.min"
        :max="VOICE_VOLUME_RANGE.max"
        :step="VOICE_VOLUME_RANGE.step"
        :value="store.voiceVolume"
        :aria-valuetext="label('voiceVolume')"
        :style="{ '--fill': fill('voiceVolume') }"
        @input="onInput('voiceVolume', $event)"
      />
    </label>

    <label v-if="store.canHearOriginal" class="sound__row">
      <span>{{ t('overlay.sound.original') }}</span>
      <output class="sound__value">{{ label('originalLevel') }}</output>
      <input
        class="sound__range"
        type="range"
        :min="VOLUME_RANGE.min"
        :max="VOLUME_RANGE.max"
        :step="VOLUME_RANGE.step"
        :value="store.originalLevel"
        :aria-valuetext="label('originalLevel')"
        :style="{ '--fill': fill('originalLevel') }"
        @input="onInput('originalLevel', $event)"
      />
    </label>
    <p v-else-if="live" class="sound__hint">{{ t('overlay.sound.screenShared') }}</p>
  </section>
</template>

<style scoped lang="scss">
@use '../../styles/glass-range' as range;

// Same layout as the appearance controls above it
.sound {
  display: grid;
  gap: 10px;
  padding: 4px 8px 6px;

  &__title {
    margin: 0;
    color: var(--glass-muted);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  // Label and value on one line, the slider full width under them
  &__row {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 8px;
    align-items: center;
    color: var(--glass-fg);
    font-size: 13px;
  }

  &__value {
    min-width: 4ch;
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  &__range {
    @include range.slider;
  }

  &__hint {
    margin: 0;
    color: var(--glass-muted);
    font-size: 11.5px;
  }
}
</style>
