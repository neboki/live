<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStickToBottom } from '../../composables/useStickToBottom';
import { useOverlayStore } from '../../store/useOverlayStore';
import ActivityHint from '../ActivityHint/ActivityHint.vue';
import LatestButton from '../LatestButton/LatestButton.vue';
import SpeakerTag from '../SpeakerTag/SpeakerTag.vue';

/** Earlier sentences kept on screen; older ones are still in the export */
const HISTORY_LINES = 40;
/** Words of one streamed chunk come in one after another, this far apart (ms) */
const WORD_STAGGER_MS = 45;

withDefaults(
  defineProps<{
    /** i18n key of an error that ended the session; replaces the captions */
    error?: string | null;
    /**
     * The caption area has a set height (resized, or the floating window): earlier
     * sentences fill it and can be scrolled, newest at the bottom. Otherwise only the
     * previous one shows.
     */
    tall?: boolean;
    /** i18n key shown until the first sentence arrives */
    waitingKey?: string;
  }>(),
  { error: null, waitingKey: 'overlay.waiting' },
);

const emit = defineEmits<{ restart: []; 'dismiss-error': [] }>();

const store = useOverlayStore();
const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);

// Each word is its own element so it fades in as it streams
const words = computed(() => store.translation.text.split(/\s+/).filter(Boolean));
const earlier = computed(() => store.history.slice(-HISTORY_LINES));
const speaker = computed(() => store.translation.speaker ?? null);
/** The current sentence is someone else's than the last one: say who it is */
const newTurn = computed(() => earlier.value.at(-1)?.speaker !== speaker.value);
/** Words already on screen before the latest chunk: only the new ones get a delay */
const shown = ref(0);
/**
 * What screen readers get: each sentence once, when it is complete. The visible caption
 * is rebuilt word by word and per sentence, which a live region cannot follow.
 */
const announced = ref('');
watch(
  () => store.translation.done,
  (done) => {
    if (done && store.translation.text.trim()) announced.value = store.translation.text.trim();
  },
);

const { detached, scrollToEnd } = useStickToBottom(scroller, [
  () => store.translation.text,
  () => store.history.length,
  () => store.source.text,
  () => store.activity,
]);

/** Earlier lines name the speaker only where the turn changes, like a script */
function turnAt(index: number): boolean {
  const line = earlier.value[index];
  if (line?.speaker === null || line?.speaker === undefined) return false;
  return index === 0 || earlier.value[index - 1]?.speaker !== line.speaker;
}

function wordDelay(index: number): string {
  return `${Math.max(0, index - shown.value) * WORD_STAGGER_MS}ms`;
}

watch(
  [() => store.translation.id, () => words.value.length],
  ([id], [oldId, oldLength]) => {
    shown.value = id === oldId ? (oldLength ?? 0) : 0;
  },
  { flush: 'pre' },
);
</script>

<template>
  <div class="lines" :class="{ 'lines--tall': tall }">
    <div ref="scroller" class="lines__scroll" :tabindex="tall ? 0 : undefined">
      <TransitionGroup tag="ol" name="settle" class="lines__history">
        <li
          v-for="(line, index) in earlier"
          :key="line.id"
          :class="{ 'lines__past--last': index === earlier.length - 1 }"
        >
          <SpeakerTag v-if="turnAt(index)" :speaker="line.speaker ?? 0" />{{ line.text }}
        </li>
      </TransitionGroup>

      <div v-if="error" class="lines__error" role="alert">
        <p>{{ t(error) }}</p>
        <button type="button" @click="emit('restart')">{{ t('live.error.restart') }}</button>
        <button type="button" @click="emit('dismiss-error')">{{ t('live.error.dismiss') }}</button>
      </div>
      <p v-else-if="store.waiting" class="lines__translation lines__translation--waiting">
        <span class="lines__text">{{ t(waitingKey) }}</span>
      </p>
      <p
        v-else
        :key="store.translation.id"
        class="lines__translation"
        :class="[
          { 'lines__translation--streaming': !store.translation.done },
          speaker === null ? '' : `lines__translation--speaker-${speaker % 6}`,
        ]"
        aria-hidden="true"
      >
        <SpeakerTag v-if="speaker !== null && newTurn" class="lines__tag" :speaker="speaker" />
        <span class="lines__text">
          <template v-for="(word, index) in words" :key="index">
            <span class="lines__word" :style="{ animationDelay: wordDelay(index) }">{{ word }}</span
            >{{ index < words.length - 1 ? ' ' : '' }}
          </template>
        </span>
      </p>

      <ActivityHint v-if="!error" :activity="store.activity" />

      <p
        v-if="store.options.source && !error"
        class="lines__source"
        :class="{ 'lines__source--partial': store.source.partial }"
      >
        {{ store.source.text }}
      </p>
    </div>

    <p class="lg-sr-only" aria-live="polite" aria-atomic="true">{{ announced }}</p>

    <LatestButton :visible="tall && detached" @jump="scrollToEnd(true)" />

    <p v-if="store.notice && !error" class="lines__notice" role="status">{{ t(store.notice) }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/caption-motion';
@use '../../styles/speaker-colors';

// Newest at the bottom, like subtitles. A soft shadow keeps the text sharp
// however transparent the background is made.
.lines {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  text-shadow: 0 1px 2px rgb(0 0 0 / calc((1 - var(--glass-alpha)) * 90%));

  // History, current sentence and original text scroll together
  &__scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    outline: none;
  }

  &--tall &__scroll {
    overflow: hidden auto;
    overscroll-behavior: contain;
    padding-right: 6px;
    margin-right: -6px;
    scrollbar-color: rgb(255 255 255 / 18%) transparent;

    // Earlier lines fade out under the header instead of being cut
    mask-image: linear-gradient(to bottom, transparent, #000 2.2em);

    // The first lines sit at the bottom until there are enough to fill the area
    > :first-child {
      margin-top: auto;
    }
  }

  &__history {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    justify-content: flex-end;
    min-height: 1.4em;
    max-height: 1.4em;
    margin: 0;
    padding: 0;
    overflow: hidden;
    color: var(--glass-muted);
    font-size: calc(15px * var(--scale));
    line-height: 1.45;
    list-style: none;

    li {
      flex: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 0.4s ease;
    }
  }

  // The sentence that just ended is still close in mind: a step brighter
  &__past--last {
    color: rgb(255 255 255 / 78%);
  }

  &--tall &__history {
    max-height: none;
    overflow: visible;

    li {
      white-space: normal;
      text-wrap: pretty;
    }
  }

  // The sentence being said: bright, bigger, marked by the theme's colour strip
  &__translation {
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    justify-content: flex-end;
    min-height: 2.64em;
    margin: 0;
    padding-left: 14px;
    color: #fff;
    font-size: calc(22px * var(--scale));
    font-weight: 550;
    line-height: 1.32;
    letter-spacing: -0.01em;

    // No text-wrap balancing here: it would reflow the lines on every new word
    &::before {
      content: '';
      position: absolute;
      top: 0.18em;
      bottom: 0.18em;
      left: 0;
      width: 3px;
      border-radius: 3px;
      background: linear-gradient(180deg, rgb(var(--tint-a)), rgb(var(--tint-b)));
      box-shadow: 0 0 12px rgb(var(--tint-a) / 60%);
      transition: opacity 0.4s ease;
    }
  }

  &__translation {
    @include speaker-colors.strip;
  }

  &__tag {
    margin-bottom: 2px;
  }

  // While it streams, the strip breathes
  &__translation--streaming::before {
    animation: breathe 1.4s ease-in-out infinite alternate;
  }

  &__translation--waiting {
    min-height: calc(2.64em * 22 / 16);
    color: var(--glass-muted);
    font-size: calc(16px * var(--scale));
    font-weight: 400;
    letter-spacing: 0;

    &::before {
      opacity: 0.35;
    }
  }

  &__source {
    flex: none;
    min-height: 1.4em;
    margin: 0;
    padding-left: 14px;
    color: var(--glass-muted);
    font-family: var(--font-cjk), var(--font-ui);
    font-size: calc(13.5px * var(--scale));
    line-height: 1.4;
  }

  &__source--partial::after {
    content: '▍';
    margin-left: 1px;
    opacity: 0.6;
    animation: blink 1s steps(1) infinite;
  }

  &__notice {
    flex: none;
    margin: 0;
    color: var(--glass-muted);
    font-size: calc(12.5px * var(--scale));
  }

  // A fatal error replaces the captions until it's dismissed
  &__error {
    flex: none;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: rgb(220 38 38 / 85%);
    color: #fff;
    font-size: 13.5px;
    text-shadow: none;

    p {
      margin: 0 0 6px;
    }

    button {
      margin-right: 14px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: 600 12.5px var(--font-ui);
      text-decoration: underline;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }
    }
  }

  // Words come into focus one after another (the delay is set per word)
  &__word {
    display: inline-block;
    opacity: 0;
    filter: blur(3px);
    animation: focus-in 0.32s var(--ease-out) forwards;
  }
}
</style>
