<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onRadioKeydown } from '../../composables/radioGroup';
import { OVERLAY_THEMES } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';

/** Colour swatches for the bar; the choice applies at once and is remembered. */
const store = useOverlayStore();
const { t } = useI18n();
</script>

<template>
  <div class="themes">
    <span id="lg-look-theme" class="themes__label">{{ t('overlay.look.theme') }}</span>
    <div
      class="themes__swatches"
      role="radiogroup"
      aria-labelledby="lg-look-theme"
      @keydown="onRadioKeydown"
    >
      <button
        v-for="theme in OVERLAY_THEMES"
        :key="theme"
        class="themes__swatch"
        :class="`themes__swatch--${theme}`"
        type="button"
        role="radio"
        :aria-checked="store.theme === theme"
        :tabindex="store.theme === theme ? 0 : -1"
        :title="t(`overlay.look.themes.${theme}`)"
        :aria-label="t(`overlay.look.themes.${theme}`)"
        @click="store.theme = theme"
      ></button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use 'sass:list';

// Same colours as the bar themes (styles/_bar-themes.scss), as two-tone discs
$swatches: (
  aurora: (
    #8b5cf6,
    #22d3ee,
  ),
  sunset: (
    #ff5e62,
    #ffaa40,
  ),
  ocean: (
    #3b82f6,
    #14d6ba,
  ),
  forest: (
    #10b981,
    #bef264,
  ),
  graphite: (
    #ff6b6f,
    #9496a8,
  ),
);

.themes {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  color: var(--glass-fg);
  font-size: 13px;

  &__swatches {
    display: flex;
    gap: 8px;
  }

  &__swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 18%);
    cursor: pointer;
    appearance: none;
    transition:
      transform 0.3s var(--ease-spring),
      box-shadow 0.2s;

    @each $name, $pair in $swatches {
      &--#{$name} {
        background: linear-gradient(135deg, list.nth($pair, 1) 0 50%, list.nth($pair, 2) 50% 100%);
      }
    }

    &:hover {
      transform: scale(1.15);
    }

    // The chosen one gets a white ring with a gap, like a selected colour chip
    &[aria-checked='true'] {
      box-shadow:
        0 0 0 2px rgb(var(--glass-rgb)),
        0 0 0 4px #fff;
    }

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 3px;
    }
  }
}
</style>
