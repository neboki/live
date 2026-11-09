<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onRadioKeydown, radioTabIndex } from '../../composables/radioGroup';
import { LISTENING_MODES } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';

/**
 * A conversation the user takes part in, or a talk, class or video they follow. It
 * changes what the summary keeps and turns reply suggestions into questions to ask.
 * It can change mid-session: it applies from the next sentence.
 */
const store = useOverlayStore();
const { t } = useI18n();
</script>

<template>
  <div class="lg-segment" role="radiogroup" :aria-label="t('overlay.listenMode.title')">
    <span class="lg-segment__title">{{ t('overlay.listenMode.title') }}</span>
    <div class="lg-segment__options" @keydown="onRadioKeydown">
      <button
        v-for="(mode, index) in LISTENING_MODES"
        :key="mode"
        class="lg-segment__option"
        type="button"
        role="radio"
        :aria-checked="store.mode === mode"
        :tabindex="radioTabIndex(store.mode === mode, index === 0, true)"
        @click="store.mode = mode"
      >
        {{ t(`overlay.listenMode.${mode}.label`) }}
        <small>{{ t(`overlay.listenMode.${mode}.hint`) }}</small>
      </button>
    </div>
  </div>
</template>
