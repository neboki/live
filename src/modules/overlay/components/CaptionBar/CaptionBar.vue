<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDismiss } from '../../composables/useDismiss';
import { useIdle } from '../../composables/useIdle';
import { usePanelPlacement } from '../../composables/usePanelPlacement';
import { usePipTitle } from '../../composables/usePipTitle';
import { useResizable, type ResizeEdge } from '../../composables/useResizable';
import { BAR_HEIGHT } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';
import BarHeader from '../BarHeader/BarHeader.vue';
import CaptionLines from '../CaptionLines/CaptionLines.vue';
import SettingsMenu from '../SettingsMenu/SettingsMenu.vue';
import SuggestionChips from '../SuggestionChips/SuggestionChips.vue';
import SummaryPanel from '../SummaryPanel/SummaryPanel.vue';

/** Edges the bar can be dragged from; the bottom one stays put (the bar is anchored there) */
const EDGES: readonly ResizeEdge[] = ['left', 'right', 'top', 'top-left', 'top-right'];

const props = withDefaults(
  defineProps<{
    /** Rendered inside the Picture-in-Picture window */
    popped?: boolean;
    canPopOut?: boolean;
    /** A real session is running (not the demo or the home preview) */
    live?: boolean;
    /** i18n key of an error that ended the session, shown inside the bar */
    error?: string | null;
    /** Off for previews: no resize handles, and the size the user gave the real bar is ignored */
    resizable?: boolean;
    /** A live session's floating window: offers Stop instead of popping back in */
    stoppable?: boolean;
    /** i18n key shown until the first sentence arrives */
    waitingKey?: string;
    /**
     * Fills its container, like the floating window does its own: in the page, where the
     * captions are the main thing, with earlier sentences above to scroll back through
     */
    fill?: boolean;
  }>(),
  { error: null, resizable: true, waitingKey: 'overlay.waiting' },
);

const emit = defineEmits<{
  'pop-out': [];
  'pop-in': [];
  'dismiss-error': [];
  restart: [];
  stop: [];
}>();

const store = useOverlayStore();
const { t } = useI18n();
const bar = ref<HTMLElement | null>(null);
const lines = ref<InstanceType<typeof CaptionLines> | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
/** Where focus was when the settings opened, to give it back when they close */
let opener: HTMLElement | null = null;

const idle = useIdle([() => store.translation.id, () => store.source.text, menuOpen]);
const panel = usePanelPlacement(bar, menuOpen);
const panelSide = panel.side;
const panelMax = panel.maxHeight;
const { resizing, startResize, onResizeKey } = useResizable(
  bar,
  () => (lines.value?.$el as HTMLElement | undefined) ?? null,
);
useDismiss(bar, menuOpen, () => (menuOpen.value = false));
usePipTitle(bar, () => props.popped);

// In the floating window it is the window that gets resized
const canResize = computed(() => props.resizable && !props.popped && !store.minimized);
const size = computed(() => (props.resizable ? store.size : { width: null, height: null }));
// The grip is a window splitter: its value is the height of the caption area (auto counts as the minimum)
const gripValue = computed(() => Math.round(size.value.height ?? BAR_HEIGHT.min));
const tall = computed(() => props.popped || props.fill || size.value.height !== null);
// Summary and suggestions share one compact tray under the captions
const showExtras = computed(
  () => !store.minimized && (store.options.suggestions || store.options.summary),
);

const barClasses = computed(() => ({
  [`bar--theme-${store.theme}`]: true,
  'bar--idle': idle.value && !menuOpen.value && !props.error,
  'bar--paused': store.paused,
  'bar--min': store.minimized,
  'bar--popped': props.popped,
  'bar--fill': props.fill && !store.minimized,
  'bar--resizing': resizing.value,
}));

const barStyle = computed(() => ({
  '--level': store.paused ? 0 : store.level,
  '--scale': store.scale,
  '--user-scale': store.scale,
  // A floating window is always opaque, so there the theme shows at full strength
  '--glass-alpha': props.popped ? 1 : store.opacity,
  ...(size.value.width === null ? {} : { '--bar-width': `${size.value.width}px` }),
}));

const linesStyle = computed(() =>
  props.popped || size.value.height === null ? {} : { height: `${size.value.height}px` },
);

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

// The settings are a dialog: focus goes in when it opens and back out when it closes
watch(menuOpen, async (open) => {
  const doc = bar.value?.ownerDocument;
  if (open) {
    opener = (doc?.activeElement as HTMLElement | null) ?? null;
    await nextTick();
    panelEl.value?.querySelector<HTMLElement>('button, input, select, [tabindex]')?.focus();
  } else if (opener && doc?.contains(opener)) {
    opener.focus();
    opener = null;
  }
});

function togglePopOut(): void {
  if (props.popped) emit('pop-in');
  else emit('pop-out');
}

// The bar moves to another window: the panel was placed for the old one
watch(
  () => props.popped,
  () => (menuOpen.value = false),
);
</script>

<template>
  <section
    ref="bar"
    class="bar"
    :class="barClasses"
    :style="barStyle"
    :aria-label="t('overlay.region')"
  >
    <template v-if="canResize">
      <div
        v-for="edge in EDGES"
        :key="edge"
        class="bar__edge"
        :class="`bar__edge--${edge}`"
        data-no-drag
        aria-hidden="true"
        @pointerdown="startResize(edge, $event)"
      ></div>
      <div
        class="bar__grip"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        :aria-valuemin="BAR_HEIGHT.min"
        :aria-valuemax="BAR_HEIGHT.max"
        :aria-valuenow="gripValue"
        :aria-label="t('overlay.resize')"
        :title="t('overlay.resize')"
        data-no-drag
        @pointerdown="startResize('top', $event)"
        @keydown="onResizeKey"
      ></div>
    </template>

    <BarHeader
      class="bar__top"
      :popped="popped"
      :live="live"
      :can-pop-out="canPopOut"
      :menu-open="menuOpen"
      :stoppable="stoppable"
      :page="fill"
      :error="!!error"
      @toggle-menu="toggleMenu"
      @toggle-pop="togglePopOut"
      @stop="emit('stop')"
    />

    <Transition name="pop">
      <div
        v-if="menuOpen && !store.minimized"
        ref="panelEl"
        class="bar__panel"
        :class="`bar__panel--${panelSide}`"
        :style="{ '--panel-max': `${panelMax}px` }"
        role="dialog"
        :aria-label="t('overlay.options.title')"
        data-no-drag
      >
        <SettingsMenu id="lg-menu" :live="live" :popped="popped" />
      </div>
    </Transition>

    <!-- CC off: the text is put away, the voice and the session go on -->
    <p v-if="store.captionsHidden && !store.minimized && !error" class="bar__cc-off">
      {{ t('overlay.cc.hidden') }}
      <button type="button" @click="store.captionsHidden = false">
        {{ t('overlay.cc.show') }}
      </button>
    </p>
    <CaptionLines
      v-else-if="!store.minimized || error"
      ref="lines"
      class="bar__lines"
      :style="linesStyle"
      :tall="tall"
      :error="error"
      :waiting-key="waitingKey"
      @restart="emit('restart')"
      @dismiss-error="emit('dismiss-error')"
    />
    <Transition name="pop">
      <div v-if="showExtras" class="bar__extras" data-no-drag>
        <SuggestionChips
          v-if="store.options.suggestions"
          :suggestions="store.suggestions"
          :questions="store.mode === 'talk'"
        />
        <SummaryPanel v-if="store.options.summary" :points="store.visibleSummary" />
      </div>
    </Transition>
  </section>
</template>

<style scoped lang="scss">
@use '../../styles/bar-themes' as themes;

// Captions float over someone else's window: the background can fade, the text never does
.bar {
  // The tints come from the theme class (see bar-themes)
  --glass-accent: rgb(var(--tint-a));

  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: var(--bar-width, 640px);
  max-width: 100%;
  padding: 8px 18px 16px;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: var(--radius-xl);

  @include themes.surface;

  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    0 2px 8px rgb(0 0 0 / 18%),
    0 18px 50px rgb(0 0 0 / 30%),
    0 0 calc(4px + var(--level) * 36px) rgb(var(--tint-a) / calc(var(--level) * 40%));
  color: var(--glass-fg);
  font-family: var(--font-ui);
  backdrop-filter: blur(24px) saturate(1.5);
  transition: --level 0.18s linear;

  @include themes.variants;
  @include themes.glow;

  // Idle: only the controls step back; the captions stay fully readable.
  // Without a mouse there is no hover to bring them back, so on touch they stay.
  @media (hover: hover) {
    &--idle:not(:hover, :focus-within) .bar__top {
      opacity: 0;
    }
  }

  &--resizing {
    user-select: none;
  }

  &--min {
    width: auto;
    padding: 6px 8px 6px 14px;
    border-radius: var(--radius-pill);
  }

  &--popped {
    width: 100%;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    padding: 10px 24px 20px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;

    // The window's own frame, in the theme's colours: faint at rest, brighter with the voice
    &::after {
      inset: 0;
      height: auto;
      border: 1px solid transparent;
      background: linear-gradient(135deg, rgb(var(--tint-a)), rgb(var(--tint-b))) border-box;
      opacity: calc(0.3 + var(--level) * 0.5);
      transition: opacity 0.18s linear;
      mask:
        linear-gradient(#000 0 0) padding-box exclude,
        linear-gradient(#000 0 0);
    }
  }

  // A panel of the page that its captions fill, scrolling back through what was said
  &--fill {
    width: 100%;
    max-width: none;
    height: 100%;
    min-height: 0;
    padding: 10px 24px 20px;
  }

  &--popped &__lines,
  &--fill &__lines {
    flex: 1 1 auto;
    min-height: 0;
  }

  &__cc-off {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 14px 8px;
    color: var(--glass-muted);
    font-size: 13px;
    text-align: center;

    button {
      padding: 4px 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: rgb(var(--tint-a) / 22%);
      color: var(--glass-fg);
      font: 600 12.5px var(--font-ui);
      cursor: pointer;

      &:hover {
        background: rgb(var(--tint-a) / 40%);
      }

      &:focus-visible {
        outline: 2px solid rgb(var(--tint-b));
        outline-offset: 1px;
      }
    }
  }

  // A whole page to read from at arm's length: larger text, the user's size on top
  &--fill &__lines {
    --scale: calc(var(--user-scale) * 1.15);

    @media (width >= 1100px) {
      --scale: calc(var(--user-scale) * 1.35);
    }
  }

  // Secondary info: side by side when there is room, stacked when not.
  // Each module keeps its own height and scrolls, so the captions never get pushed away.
  &__extras {
    display: grid;
    flex: none;
    grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
    gap: 8px;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid var(--glass-line);
    cursor: default;
  }

  // Invisible strips along the edges; the bottom one stays put
  &__edge {
    position: absolute;
    z-index: 2;
    touch-action: none;

    &--left,
    &--right {
      top: 16px;
      bottom: 16px;
      width: 10px;
      cursor: ew-resize;
    }

    &--left {
      left: -5px;
    }

    &--right {
      right: -5px;
    }

    &--top {
      top: -5px;
      right: 16px;
      left: 16px;
      height: 10px;
      cursor: ns-resize;
    }

    &--top-left,
    &--top-right {
      top: -5px;
      width: 18px;
      height: 18px;
    }

    &--top-left {
      left: -5px;
      cursor: nwse-resize;
    }

    &--top-right {
      right: -5px;
      cursor: nesw-resize;
    }
  }

  // The visible hint that the bar can be resized; also its keyboard handle
  &__grip {
    position: absolute;
    top: 3px;
    left: 50%;
    z-index: 3;
    width: 40px;
    height: 4px;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 28%);
    opacity: 0;
    cursor: ns-resize;
    transform: translateX(-50%);
    transition:
      opacity 0.2s,
      background 0.2s;
    touch-action: none;

    &::before {
      content: '';
      position: absolute;
      inset: -6px -10px;
    }

    &:hover,
    &:focus-visible {
      background: rgb(255 255 255 / 55%);
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: 3px;
    }
  }

  &:hover &__grip,
  &--resizing &__grip,
  &__grip:focus-visible {
    opacity: 1;
  }

  // Settings float beside the bar instead of pushing the captions away
  &__panel {
    position: absolute;
    right: 0;
    z-index: 10;
    display: flex;
    width: min(380px, 100%);
    max-height: var(--panel-max, 480px);
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: var(--radius-lg);
    background:
      radial-gradient(120% 60% at 100% 0%, rgb(var(--tint-a) / 16%), transparent 70%),
      rgb(var(--glass-rgb) / 97%);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 6%),
      0 24px 60px rgb(0 0 0 / 45%);
    backdrop-filter: blur(24px) saturate(1.5);
    cursor: default;

    &--above {
      bottom: calc(100% + 8px);
      transform-origin: bottom right;
    }

    &--below {
      top: calc(100% + 8px);
      transform-origin: top right;
    }
  }

  &--popped &__panel {
    inset: 46px 10px 10px;
    width: auto;
    max-height: none;
  }

  // Filling the page there is no room around the bar: the panel opens inside it, under
  // the Settings button
  &--fill &__panel {
    top: 52px;
    right: 18px;
    bottom: auto;
    width: min(400px, calc(100% - 36px));
    max-height: calc(100% - 64px);
    transform-origin: top right;
  }
}
</style>
