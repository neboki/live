<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { SYNC_DELAY_AUTO, SYNC_DELAY_CHOICES } from '@/modules/overlay';
import type { SessionLine } from '@/modules/session';
import type { DelayedPlayback } from '@/shared/media/delayedPlayback';
import { usePlayerChrome } from '../../composables/usePlayerChrome';
import { suggestedDelay } from '../../utils/sync';

/** Lines on the picture at once: the current one, and the one before it */
const SHOWN_LINES = 2;
/** A line leaves the picture this long after its sentence ended, if none follows */
const LINGER_MS = 4000;
/** How often the picture's time is looked at, for lines to leave on time */
const CLOCK_MS = 500;
/** Further behind the delay than this, the player offers to go back to live */
const CATCH_UP_BEYOND_SECONDS = 2;

/**
 * The shared tab, played in the page a few seconds behind real time with its sound, as
 * a video player: the captions on the picture like subtitles, and the controls over its
 * foot, hidden while nobody touches it. It is a copy of the tab, so it can be paused
 * like a recording and goes on from there, further behind, until sent back to live.
 */
const props = defineProps<{
  playback: DelayedPlayback;
  /** Seconds the picture is held back */
  delaySeconds: number;
  /** The delay is set automatically from the first captions */
  auto?: boolean;
  /** …and is still being worked out: the picture is held meanwhile */
  calibrating?: boolean;
  /** Seconds the picture is behind real time; null while its buffer fills */
  lagSeconds: number | null;
  /** Paused by the user */
  paused: boolean;
  /** Held until a late caption arrives, then it goes on */
  waiting?: boolean;
  /** The lines the picture has reached, oldest first */
  lines: readonly SessionLine[];
  /** The shared tab sends no sound: most likely its video is paused there */
  silent?: boolean;
}>();

const emit = defineEmits<{
  /** The user chose another delay (SYNC_DELAY_AUTO: automatic); it stays from then on */
  delay: [seconds: number];
}>();

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const frame = ref<HTMLElement | null>(null);
const captionsOn = ref(true);
const now = ref(Date.now());
/** When the picture began to be held back: the countdown until it shows starts there */
const shownOn = Date.now();
const clock = window.setInterval(() => (now.value = Date.now()), CLOCK_MS);
const { fullscreen, canFullscreen, awake, toggleFullscreen, wake } = usePlayerChrome(root);

const buffering = computed(() => props.lagSeconds === null);
/** Seconds left before the picture shows, while it is held */
const remaining = computed(() =>
  Math.max(1, Math.ceil(props.delaySeconds - (now.value - shownOn) / 1000)),
);
const lag = computed(() => (props.lagSeconds ?? props.delaySeconds).toFixed(1));
const canCatchUp = computed(
  () =>
    props.lagSeconds !== null &&
    (props.paused || props.lagSeconds - props.delaySeconds > CATCH_UP_BEYOND_SECONDS),
);
/** The controls show while in use, and whenever the picture is not simply playing */
const chromeShown = computed(() => awake.value || props.paused || buffering.value);
/** The picture's own time: lines whose sentence ended long before it have left */
const shown = computed(() => {
  if (props.lagSeconds === null) return [];
  const shownAt = now.value - props.lagSeconds * 1000;
  return props.lines.slice(-SHOWN_LINES).filter((line) => line.at + LINGER_MS >= shownAt);
});

/** A longer delay to offer while the captions keep landing late; null while on time */
const suggestion = computed(() =>
  props.lagSeconds === null || props.paused || props.auto
    ? null
    : suggestedDelay(props.lines, props.delaySeconds, SYNC_DELAY_CHOICES),
);

function chooseDelay(event: Event): void {
  const seconds = Number((event.target as HTMLSelectElement).value);
  if (seconds === SYNC_DELAY_AUTO || SYNC_DELAY_CHOICES.includes(seconds)) emit('delay', seconds);
}

function togglePause(): void {
  if (buffering.value) return;
  if (props.paused) props.playback.resume();
  else props.playback.pause();
}

/** The keys of a web video player, while the player has the focus */
function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === ' ' || key === 'k') {
    if (event.target instanceof HTMLButtonElement && key === ' ') return;
    togglePause();
  } else if (key === 'f') toggleFullscreen();
  else if (key === 'c') captionsOn.value = !captionsOn.value;
  else return;
  event.preventDefault();
  wake();
}

/** The video element is owned by the playback: it is only put in the frame */
function show(): void {
  frame.value?.replaceChildren(props.playback.element);
}

onMounted(() => {
  show();
  root.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => window.clearInterval(clock));
watch(() => props.playback, show);
</script>

<template>
  <section
    ref="root"
    class="synced-tab"
    :class="{
      'synced-tab--chrome': chromeShown,
      'synced-tab--full': fullscreen,
      'synced-tab--paused': paused,
    }"
    tabindex="0"
    :aria-label="t('live.sync.title')"
    @pointermove="wake"
    @pointerdown="wake"
    @keydown="onKey"
  >
    <div ref="frame" class="synced-tab__frame"></div>

    <!-- The picture is a copy: the player's own buttons in it cannot be clicked, so a
         click on it pauses or resumes the copy, and a double click fills the screen -->
    <button
      class="synced-tab__surface"
      type="button"
      tabindex="-1"
      :disabled="buffering"
      :aria-label="t(paused ? 'live.sync.resume' : 'live.sync.pause')"
      @click="togglePause"
      @dblclick="toggleFullscreen"
    ></button>

    <!-- The page cannot press play in the other tab: it says so, above all else -->
    <p v-if="silent" class="synced-tab__notice synced-tab__notice--wide" role="status">
      {{ t('live.tabSilent') }}
    </p>
    <p v-else-if="buffering" class="synced-tab__notice">
      {{ t(calibrating ? 'live.sync.calibrating' : 'live.sync.buffering', { seconds: remaining }) }}
    </p>
    <p v-else-if="waiting && !paused" class="synced-tab__notice" role="status">
      {{ t('live.sync.waiting') }}
    </p>
    <span v-else-if="paused" class="synced-tab__big" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>
    </span>

    <div v-if="captionsOn && shown.length" class="synced-tab__lines" aria-live="polite">
      <p
        v-for="(line, index) in shown"
        :key="`${line.at}-${index}`"
        class="synced-tab__line"
        :class="{ 'synced-tab__line--current': index === shown.length - 1 }"
      >
        <span>{{ line.translation || line.source }}</span>
      </p>
    </div>

    <div class="synced-tab__controls">
      <button
        class="synced-tab__btn synced-tab__pause"
        type="button"
        :disabled="buffering"
        :aria-label="t(paused ? 'live.sync.resume' : 'live.sync.pause')"
        :title="`${t(paused ? 'live.sync.resume' : 'live.sync.pause')} (K)`"
        @click="togglePause"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="paused" d="M8 5.5v13l10.5-6.5z" />
          <path v-else d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
        </svg>
      </button>

      <button
        v-if="canCatchUp"
        class="synced-tab__live synced-tab__catch-up"
        type="button"
        @click="playback.catchUp()"
      >
        <i aria-hidden="true"></i>{{ t('live.sync.catchUp') }}
        <small>−{{ lag }} s</small>
      </button>
      <span
        v-else
        class="synced-tab__live synced-tab__live--on"
        :title="t('live.sync.lag', { seconds: lag })"
      >
        <i aria-hidden="true"></i>{{ t('live.sync.live') }}
        <small>−{{ lag }} s</small>
      </span>

      <label class="synced-tab__delay" :title="t('live.sync.delayHint')">
        <span>{{ t('live.sync.delay') }}</span>
        <select :value="auto ? SYNC_DELAY_AUTO : delaySeconds" @change="chooseDelay">
          <option :value="SYNC_DELAY_AUTO">
            {{
              auto && !calibrating
                ? t('live.sync.autoAt', { seconds: delaySeconds })
                : t('live.sync.auto')
            }}
          </option>
          <option v-for="seconds in SYNC_DELAY_CHOICES" :key="seconds" :value="seconds">
            {{ t('live.sync.seconds', { seconds }) }}
          </option>
        </select>
      </label>

      <!-- Captions keep landing after their sentence: a longer delay, one click away -->
      <button
        v-if="suggestion !== null"
        class="synced-tab__live synced-tab__suggest"
        type="button"
        :title="t('live.sync.lateHint', { seconds: suggestion })"
        @click="emit('delay', suggestion)"
      >
        {{ t('live.sync.late', { seconds: suggestion }) }}
      </button>

      <button
        class="synced-tab__btn synced-tab__cc"
        type="button"
        :aria-pressed="captionsOn"
        :aria-label="t('live.sync.captions')"
        :title="`${t('live.sync.captions')} (C)`"
        @click="captionsOn = !captionsOn"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2.5" class="synced-tab__cc-box" />
          <path
            d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6"
            class="synced-tab__cc-text"
          />
        </svg>
      </button>

      <button
        v-if="canFullscreen"
        class="synced-tab__btn synced-tab__full"
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
    </div>
  </section>
</template>

<style scoped lang="scss">
// A video player: picture, captions on it, and controls over its foot. Always dark,
// whatever the page's theme, like any player. Sizes follow the player's width (cqw),
// so the captions grow with it, fullscreen included.
.synced-tab {
  --controls-h: 52px;

  position: relative;
  container-type: inline-size;
  overflow: hidden;

  // As wide as the page allows, as long as it fits the screen's height
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

  &__frame {
    position: absolute;
    inset: 0;

    // The element comes from the playback, outside this template
    :deep(video) {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  // Covers the picture so a click on it pauses or resumes
  &__surface {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: none;

    &:disabled {
      cursor: progress;
    }
  }

  &--chrome &__surface:not(:disabled) {
    cursor: pointer;
  }

  &__notice,
  &__big {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  &__notice {
    margin: 0;
    padding: 10px 16px;
    border-radius: var(--radius-pill);
    background: rgb(0 0 0 / 60%);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    animation: synced-tab-pulse 1.6s ease-in-out infinite;
  }

  &__notice--wide {
    width: max-content;
    max-width: min(90%, 32em);
    border-radius: var(--radius-lg);
    text-align: center;
    animation: none;
  }

  &__big {
    display: grid;
    width: 72px;
    height: 72px;
    border-radius: var(--radius-pill);
    background: rgb(0 0 0 / 55%);
    place-items: center;

    svg {
      width: 36px;
      fill: #fff;
    }
  }

  &--paused :deep(video) {
    filter: brightness(0.75);
  }

  // Captions as subtitles: centred near the foot, lifted over the controls when they show
  &__lines {
    position: absolute;
    right: 6%;
    bottom: 5%;
    left: 6%;
    display: grid;
    gap: 0.3em;
    justify-items: center;
    font-size: clamp(15px, 2.6cqw, 46px);
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
      background: rgb(0 0 0 / 72%);
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
    gap: 6px;
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

  &__btn {
    display: grid;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: #fff;
    cursor: pointer;
    place-items: center;

    svg {
      width: 22px;
      height: 22px;
      fill: currentcolor;
    }

    &:hover:not(:disabled) {
      background: rgb(255 255 255 / 16%);
    }

    &:disabled {
      opacity: 0.4;
      cursor: progress;
    }

    &:focus-visible {
      outline: 2px solid #fff;
    }
  }

  &__full svg {
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
  }

  &__cc {
    .synced-tab__cc-box {
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.8;
    }

    .synced-tab__cc-text {
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.6;
    }

    &[aria-pressed='true'] .synced-tab__cc-box {
      fill: currentcolor;
    }

    &[aria-pressed='true'] .synced-tab__cc-text {
      stroke: #000;
    }
  }

  // Live, a few seconds behind on purpose; or further behind, offering to go back
  &__live {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 5px 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 14%);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;

    i {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-pill);
      background: #9aa0a6;
    }

    small {
      font-size: 12px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }

    &:focus-visible {
      outline: 2px solid #fff;
    }
  }

  &__live--on i {
    background: #ff3b30;
  }

  button.synced-tab__live {
    cursor: pointer;

    &:hover {
      background: rgb(255 255 255 / 24%);
    }
  }

  &__suggest {
    margin-right: 6px;
    background: rgb(255 159 10 / 85%);
    color: #000;

    &:hover {
      background: rgb(255 159 10);
    }
  }

  &__delay {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin: 0 6px 0 auto;
    font-size: 12.5px;
    opacity: 0.85;

    select {
      padding: 3px 6px;
      border: 1px solid rgb(255 255 255 / 30%);
      border-radius: var(--radius-sm);
      background: rgb(0 0 0 / 50%);
      color: #fff;
      font: inherit;
      font-variant-numeric: tabular-nums;
    }
  }

  // Narrow: the delay is the first to go
  @container (width < 460px) {
    &__delay span {
      display: none;
    }

    &__live small {
      display: none;
    }
  }
}

@keyframes synced-tab-pulse {
  50% {
    opacity: 0.5;
  }
}
</style>
