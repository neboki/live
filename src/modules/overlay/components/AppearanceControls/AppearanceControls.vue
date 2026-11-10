<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { OPACITY_RANGE, SCALE_RANGE } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';
import { fractionOf, stepTo } from '../../utils/range';
import ThemePicker from '../ThemePicker/ThemePicker.vue';

/**
 * Text size, colour theme and background opacity, first in the settings so they
 * are easy to find. All apply live: the panel floats beside the bar, so the change
 * shows while it is being made. A floating window is always opaque, so there the
 * opacity slider is left out.
 */
withDefaults(
  defineProps<{
    popped?: boolean;
    /** The text size too: left out where the bar has its own Aa − + */
    withSize?: boolean;
  }>(),
  { withSize: true },
);

const store = useOverlayStore();
const { t, locale } = useI18n();

const percent = computed(
  () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }),
);
const scaleLabel = computed(() => percent.value.format(store.scale));
const opacityLabel = computed(() => percent.value.format(store.opacity));
const opacityFill = computed(() => `${fractionOf(OPACITY_RANGE, store.opacity) * 100}%`);
const canShrink = computed(() => store.scale > SCALE_RANGE.min);
const canGrow = computed(() => store.scale < SCALE_RANGE.max);

function bumpScale(direction: 1 | -1): void {
  store.scale = stepTo(SCALE_RANGE, store.scale + direction * SCALE_RANGE.step);
}

// No instanceof: inside the floating window the input belongs to another window
function onOpacity(event: Event): void {
  const value = Number((event.target as HTMLInputElement | null)?.value);
  if (Number.isFinite(value)) store.opacity = stepTo(OPACITY_RANGE, value);
}
</script>

<template>
  <section class="look" :aria-label="t('overlay.look.title')">
    <h3 class="look__title">{{ t('overlay.look.title') }}</h3>

    <div v-if="withSize" class="look__row">
      <span id="lg-look-size" class="look__label">{{ t('overlay.look.textSize') }}</span>
      <div class="look__stepper" role="group" aria-labelledby="lg-look-size">
        <button
          type="button"
          :disabled="!canShrink"
          :title="t('overlay.look.smaller')"
          :aria-label="t('overlay.look.smaller')"
          @click="bumpScale(-1)"
        >
          <span class="look__glyph look__glyph--small" aria-hidden="true">A</span>
        </button>
        <output class="look__value" aria-live="polite">{{ scaleLabel }}</output>
        <button
          type="button"
          :disabled="!canGrow"
          :title="t('overlay.look.larger')"
          :aria-label="t('overlay.look.larger')"
          @click="bumpScale(1)"
        >
          <span class="look__glyph" aria-hidden="true">A</span>
        </button>
      </div>
    </div>

    <ThemePicker />

    <label v-if="!popped" class="look__row look__row--slider">
      <span class="look__label">{{ t('overlay.look.opacity') }}</span>
      <output class="look__value">{{ opacityLabel }}</output>
      <input
        class="look__range"
        type="range"
        :min="OPACITY_RANGE.min"
        :max="OPACITY_RANGE.max"
        :step="OPACITY_RANGE.step"
        :value="store.opacity"
        :aria-valuetext="opacityLabel"
        :style="{ '--fill': opacityFill }"
        @input="onOpacity"
      />
    </label>

    <div class="look__row look__row--hint">
      <span class="look__hint">{{ t('overlay.look.resizeHint') }}</span>
      <button v-if="store.resized" class="look__reset" type="button" @click="store.resetSize()">
        {{ t('overlay.look.resetSize') }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../../styles/glass-range' as range;

.look {
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

  &__row {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    color: var(--glass-fg);
    font-size: 13px;
  }

  // Label and value on one line, the slider full width under them
  &__row--slider {
    display: grid;
    grid-template-columns: 1fr auto;
    row-gap: 8px;
  }

  &__row--hint {
    min-height: 20px;
  }

  &__value {
    min-width: 4ch;
    color: var(--glass-fg);
    font-family: var(--font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  &__stepper {
    display: flex;
    align-items: center;
    padding: 2px;
    border: 1px solid var(--glass-line);
    border-radius: var(--radius);
    background: var(--glass-field);

    button {
      display: grid;
      place-items: center;
      width: 30px;
      height: 26px;
      border: 0;
      border-radius: calc(var(--radius) - 2px);
      background: transparent;
      color: var(--glass-fg);
      cursor: pointer;
      appearance: none;
      transition: background 0.12s;

      &:hover:not(:disabled) {
        background: var(--glass-hover);
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      &:focus-visible {
        outline: 2px solid var(--glass-accent);
        outline-offset: 1px;
      }
    }

    .look__value {
      min-width: 5ch;
    }
  }

  &__glyph {
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
  }

  &__glyph--small {
    font-size: 11px;
  }

  &__range {
    @include range.slider;
  }

  &__hint {
    color: var(--glass-muted);
    font-size: 11.5px;

    // The edges are thin strips meant for a mouse; on a touch screen the hint misleads
    @media (hover: none) and (pointer: coarse) {
      display: none;
    }
  }

  &__reset {
    flex: none;
    padding: 2px 0;
    border: 0;
    background: none;
    color: var(--glass-accent);
    font: 500 12px var(--font-ui);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: 1px;
    }
  }
}
</style>
