<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOverlayStore, useQuickControls } from '@/modules/overlay';
import { logError } from '@/shared/errors';
import { usePlayerChrome } from '../../composables/usePlayerChrome';

/** A finished caption leaves the picture this long after the last new words */
const LINGER_MS = 6000;
/** How often the captions look at the time, to leave on time */
const CLOCK_MS = 500;

/**
 * The shared tab as it plays now, in the page, as a video player: the captions on the
 * picture like subtitles (they grow with the text and never move the picture), and the
 * session's quick controls over its foot, hidden while nobody touches it. Muted: the
 * tab's sound already plays, at the chosen volume.
 */
const props = defineProps<{
  stream: MediaStream;
  /** The browser can float the captions above other windows */
  canPopOut?: boolean;
}>();

const emit = defineEmits<{
  options: [];
  popOut: [];
  stop: [];
}>();

const store = useOverlayStore();
const quick = useQuickControls();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const now = ref(Date.now());
const changedAt = ref(Date.now());
const clock = window.setInterval(() => (now.value = Date.now()), CLOCK_MS);
const { fullscreen, canFullscreen, awake, toggleFullscreen, wake } = usePlayerChrome(root);

const current = computed(() => store.translation.text.trim());
/** Words still coming keep the captions up; finished ones linger, then leave */
const fresh = computed(() => !store.translation.done || now.value - changedAt.value < LINGER_MS);
const shown = computed(() => {
  if (store.captionsHidden || !fresh.value) return [];
  const lines = [store.previous, current.value].filter((line) => line !== '');
  return lines.slice(-2);
});
const chromeShown = computed(() => awake.value || store.paused);

watch(
  () => [store.translation.text, store.previous],
  () => (changedAt.value = Date.now()),
);

watchEffect(() => {
  const element = video.value;
  if (!element) return;
  element.srcObject = props.stream;
  element.play().catch((err: unknown) => logError('Could not show the shared tab', err));
});

/** The keys of a web video player, while the player has the focus */
function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'f') toggleFullscreen();
  else if (key === 'c') store.captionsHidden = !store.captionsHidden;
  else if (key === 'k') store.paused = !store.paused;
  else return;
  event.preventDefault();
  wake();
}

onBeforeUnmount(() => {
  window.clearInterval(clock);
  if (video.value) video.value.srcObject = null;
});
</script>

<template>
  <section
    ref="root"
    class="live-player"
    :class="{
      'live-player--chrome': chromeShown,
      'live-player--full': fullscreen,
      'live-player--paused': store.paused,
    }"
    tabindex="0"
    :aria-label="t('live.picture')"
    @pointermove="wake"
    @pointerdown="wake"
    @keydown="onKey"
  >
    <video
      ref="video"
      class="live-player__video"
      muted
      autoplay
      playsinline
      disablepictureinpicture
    ></video>
    <!-- A double click on the picture fills the screen, as in any player -->
    <div class="live-player__surface" @dblclick="toggleFullscreen"></div>

    <p v-if="store.notice" class="live-player__notice" role="status">{{ t(store.notice) }}</p>

    <div
      v-if="shown.length"
      class="live-player__lines"
      :style="{ '--scale': store.scale }"
      aria-live="polite"
    >
      <p
        v-for="(line, index) in shown"
        :key="index"
        class="live-player__line"
        :class="{ 'live-player__line--current': index === shown.length - 1 }"
      >
        <span>{{ line }}</span>
      </p>
    </div>

    <div class="live-player__controls">
      <button
        class="live-player__btn"
        type="button"
        :aria-label="t(store.paused ? 'overlay.resume' : 'overlay.pause')"
        :title="`${t(store.paused ? 'overlay.resume' : 'overlay.pause')} (K)`"
        @click="store.paused = !store.paused"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="store.paused" d="M8 5.5v13l10.5-6.5z" />
          <path v-else d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
        </svg>
      </button>

      <div class="live-player__group" :aria-label="t('overlay.quick.volume')" role="group">
        <button
          class="live-player__btn live-player__btn--stroke"
          type="button"
          :aria-pressed="store.options.voice"
          :aria-label="t(store.options.voice ? 'overlay.voiceOff' : 'overlay.voiceOn')"
          :title="t(store.options.voice ? 'overlay.voiceOff' : 'overlay.voiceOn')"
          @click="quick.toggleVoice"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9.5h3l4.5-3.8v12.6L7 14.5H4z" />
            <template v-if="store.options.voice">
              <path d="M15 9a4.2 4.2 0 0 1 0 6" />
              <path d="M17.8 6.5a7.8 7.8 0 0 1 0 11" />
            </template>
            <path v-else d="m15.5 9.5 5 5m0-5-5 5" />
          </svg>
        </button>
        <button
          class="live-player__mini"
          type="button"
          :disabled="!quick.canQuieter.value"
          :aria-label="t('overlay.quick.quieter')"
          :title="t('overlay.quick.quieter')"
          @click="quick.quieter"
        >
          −
        </button>
        <span class="live-player__value">{{ quick.volumeLabel.value }}</span>
        <button
          class="live-player__mini"
          type="button"
          :disabled="!quick.canLouder.value"
          :aria-label="t('overlay.quick.louder')"
          :title="t('overlay.quick.louder')"
          @click="quick.louder"
        >
          +
        </button>
      </div>

      <div class="live-player__group" :aria-label="t('overlay.quick.text')" role="group">
        <span class="live-player__aa" aria-hidden="true">Aa</span>
        <button
          class="live-player__mini"
          type="button"
          :disabled="!quick.canSmaller.value"
          :aria-label="t('overlay.look.smaller')"
          :title="t('overlay.look.smaller')"
          @click="quick.smaller"
        >
          −
        </button>
        <span class="live-player__value">{{ quick.scaleLabel.value }}</span>
        <button
          class="live-player__mini"
          type="button"
          :disabled="!quick.canBigger.value"
          :aria-label="t('overlay.look.larger')"
          :title="t('overlay.look.larger')"
          @click="quick.bigger"
        >
          +
        </button>
      </div>

      <span class="live-player__spacer"></span>

      <button
        class="live-player__btn live-player__cc"
        type="button"
        :aria-pressed="!store.captionsHidden"
        :aria-label="t('live.sync.captions')"
        :title="`${t('live.sync.captions')} (C)`"
        @click="store.captionsHidden = !store.captionsHidden"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" class="live-player__cc-box" />
          <path
            d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6"
            class="live-player__cc-text"
          />
        </svg>
      </button>
      <button
        class="live-player__btn live-player__btn--stroke"
        type="button"
        :aria-label="t('overlay.options.title')"
        :title="t('overlay.options.title')"
        @click="emit('options')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
      </button>
      <button
        v-if="canPopOut && !fullscreen"
        class="live-player__btn live-player__btn--stroke"
        type="button"
        :aria-label="t('overlay.popOut')"
        :title="t('overlay.popOut')"
        @click="emit('popOut')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <rect x="12" y="12" width="7" height="5" rx="1" class="live-player__fill" />
        </svg>
      </button>
      <button
        v-if="canFullscreen"
        class="live-player__btn live-player__btn--stroke"
        type="button"
        :aria-label="t(fullscreen ? 'live.sync.exitFullscreen' : 'live.sync.fullscreen')"
        :title="`${t(fullscreen ? 'live.sync.exitFullscreen' : 'live.sync.fullscreen')} (F)`"
        @click="toggleFullscreen"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="fullscreen" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
      <button
        class="live-player__btn live-player__stop"
        type="button"
        :aria-label="t('live.stop')"
        :title="t('live.stop')"
        @click="emit('stop')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
// A video player: the picture, the captions on it and the controls over its foot. Always
// dark, whatever the page's theme. Sizes follow the player's width (cqw), so the captions
// grow with it, fullscreen included.
.live-player {
  --controls-h: 52px;

  position: relative;
  container-type: inline-size;
  overflow: hidden;
  width: min(100%, (100dvh - 150px) * 16 / 9);
  max-height: calc(100dvh - 150px);
  margin-inline: auto;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-lg);
  outline: none;
  background: #000;
  color: #fff;
  color-scheme: dark;

  &:focus-visible {
    box-shadow: 0 0 0 3px var(--accent);
  }

  &--full {
    width: 100%;
    max-height: none;
    aspect-ratio: auto;
    border-radius: 0;
  }

  &__video {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  &__surface {
    position: absolute;
    inset: 0;
    cursor: none;
  }

  &--chrome &__surface {
    cursor: default;
  }

  &__notice {
    position: absolute;
    top: 14px;
    left: 50%;
    width: max-content;
    max-width: min(90%, 32em);
    margin: 0;
    padding: 8px 14px;
    border-radius: var(--radius-lg);
    background: rgb(0 0 0 / 65%);
    font-size: 14px;
    text-align: center;
    transform: translateX(-50%);
    pointer-events: none;
  }

  // Captions as subtitles: centred near the foot, lifted over the controls when they show.
  // They grow upward with the text; the picture never moves
  &__lines {
    position: absolute;
    right: 6%;
    bottom: 5%;
    left: 6%;
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    align-items: center;
    justify-content: flex-end;
    max-height: 45%;
    overflow: hidden;
    font-size: calc(clamp(15px, 2.4cqw, 42px) * var(--scale, 1));
    line-height: 1.3;
    text-align: center;
    pointer-events: none;
    transition: bottom 0.2s ease;
  }

  &--chrome &__lines {
    bottom: calc(var(--controls-h) + 3%);
  }

  &__line {
    margin: 0;

    span {
      padding: 0.08em 0.4em;
      border-radius: var(--radius-xs);
      background: rgb(0 0 0 / 70%);
      box-decoration-break: clone;
    }
  }

  &__line:not(&__line--current) {
    font-size: 0.72em;
    opacity: 0.7;
  }

  &__line--current {
    font-weight: 500;
  }

  // The controls, over a shade at the foot of the picture
  &__controls {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    min-height: var(--controls-h);
    padding: 16px 12px 8px;
    background: linear-gradient(transparent, rgb(0 0 0 / 75%));
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }

  &--chrome &__controls {
    opacity: 1;
    pointer-events: auto;
  }

  &__spacer {
    flex: 1;
  }

  &__group {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    margin-left: 6px;
  }

  &__btn,
  &__mini {
    display: grid;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: #fff;
    cursor: pointer;
    place-items: center;

    &:hover:not(:disabled) {
      background: rgb(255 255 255 / 16%);
    }

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }

    &:focus-visible {
      outline: 2px solid #fff;
    }
  }

  &__btn {
    width: 36px;
    height: 36px;

    svg {
      width: 22px;
      height: 22px;
      fill: currentcolor;
    }
  }

  &__btn--stroke svg {
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  &__fill {
    fill: currentcolor;
  }

  &__mini {
    width: 26px;
    height: 26px;
    font: 600 16px/1 var(--font-ui);
  }

  &__value,
  &__aa {
    min-width: 3.2em;
    font: 500 12px var(--font-ui);
    font-variant-numeric: tabular-nums;
    text-align: center;
    opacity: 0.85;
  }

  &__aa {
    min-width: auto;
    font-size: 14px;
    font-weight: 700;
  }

  &__cc {
    .live-player__cc-box {
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.8;
    }

    .live-player__cc-text {
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.6;
    }

    &[aria-pressed='true'] .live-player__cc-box {
      fill: currentcolor;
    }

    &[aria-pressed='true'] .live-player__cc-text {
      stroke: #000;
    }
  }

  &__stop {
    color: #ff6b62;
  }
}
</style>
