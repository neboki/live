<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CAPTION_PLACEMENTS, useOverlayStore, type CaptionPlacement } from '@/modules/overlay';

interface PlacementOption {
  value: CaptionPlacement;
  disabled: boolean;
}

/**
 * Where the captions will show: in a floating window above everything, or in the app's
 * own page. Where the browser has no floating window the page it is, and the choice
 * says so instead of offering it.
 */
const props = defineProps<{
  /** This browser can open the floating window */
  canFloat: boolean;
  disabled?: boolean;
}>();

const store = useOverlayStore();
const { t } = useI18n();

const options = computed<PlacementOption[]>(() =>
  CAPTION_PLACEMENTS.map((value) => ({
    value,
    disabled: value === 'floating' && !props.canFloat,
  })),
);
/** What the next session will do: the page, where floating is not possible */
const effective = computed<CaptionPlacement>(() => (props.canFloat ? store.placement : 'page'));
const hintKey = computed(() =>
  props.canFloat ? `start.where.hint.${store.placement}` : 'start.where.unavailable',
);

function choose(value: CaptionPlacement): void {
  store.placement = value;
}
</script>

<template>
  <fieldset class="lg-choice" :disabled="disabled">
    <legend class="lg-choice__label">{{ t('start.where.heading') }}</legend>

    <div class="lg-choice__options">
      <label
        v-for="option in options"
        :key="option.value"
        class="lg-choice__option"
        :class="{
          'lg-choice__option--on': effective === option.value,
          'lg-choice__option--off': option.disabled,
        }"
      >
        <input
          class="lg-choice__radio"
          type="radio"
          name="caption-placement"
          :value="option.value"
          :checked="effective === option.value"
          :disabled="option.disabled"
          @change="choose(option.value)"
        />
        <svg class="lg-choice__icon" viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="option.value === 'floating'">
            <rect x="2.5" y="4" width="15" height="11" rx="2" />
            <rect x="11" y="12" width="10.5" height="8" rx="2" class="lg-choice__icon-fill" />
          </template>
          <template v-else>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 8.5h18" />
            <rect x="6" y="13" width="12" height="4" rx="1.5" class="lg-choice__icon-fill" />
          </template>
        </svg>
        <span class="lg-choice__name">{{ t(`start.where.${option.value}.name`) }}</span>
        <span class="lg-choice__for">{{ t(`start.where.${option.value}.for`) }}</span>
      </label>
    </div>

    <p class="lg-choice__hint">{{ t(hintKey) }}</p>
  </fieldset>
</template>
