<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ListeningBadge,
  SettingsPanel,
  useOverlayStore,
  useQuickControls,
} from '@/modules/overlay';
import { useSessionRecord } from '@/modules/session';
import { createScreenWakeLock, exitImmersive, immersive, toggleImmersive } from '@/shared/device';
import { logError } from '@/shared/errors';
import { useFitText } from '../../composables/fitText';
import { stopVoiceNote } from '../../composables/voiceNote';
import { useLiveSession } from '../../store/useLiveSession';
import TalkView from '../TalkView/TalkView.vue';
import FullscreenIcon from './FullscreenIcon.vue';

/**
 * The live screen on a phone: big text and the same quick controls as the bar elsewhere
 * (pause, volume, text size, settings, stop) plus full screen. Listening (and a voice note)
 * shows the lines as a running transcript with who said each; presenting shows the last
 * line huge on black, for the room or a projector; talking splits the screen in two.
 */
interface Line {
  key: string;
  text: string;
  speaker: number | null;
  live: boolean;
}

const MAX_LINES = 30;

const session = useLiveSession();
const overlay = useOverlayStore();
const record = useSessionRecord();
const { t } = useI18n();
const list = ref<HTMLElement | null>(null);
const renaming = ref<number | null>(null);
const draft = ref('');

const presenting = computed(() => session.mode === 'present');
const current = computed(() => {
  const { id, text, done, speaker } = overlay.translation;
  return id > 0 && !done && text.trim() ? { text, speaker: speaker ?? null } : null;
});
const lines = computed<Line[]>(() => {
  const done = record.lines.slice(-MAX_LINES).map((line, index) => ({
    key: `${line.at}-${index}`,
    text: line.translation || line.source,
    speaker: line.speaker ?? null,
    live: false,
  }));
  if (current.value) done.push({ key: 'live', ...current.value, live: true });
  return done;
});
const last = computed(() => lines.value.at(-1) ?? null);
/** What the presenter just said, small, so they can check they were understood */
const heard = computed(() => overlay.source.text || record.lines.at(-1)?.source || '');
const voiceTip = computed(() =>
  overlay.options.voice && !session.headset ? 'mobile.headphonesTip' : null,
);

function nameOf(speaker: number): string {
  return overlay.speakerNames[speaker] ?? t('session.view.speaker', { n: speaker + 1 });
}

async function rename(speaker: number): Promise<void> {
  renaming.value = speaker;
  draft.value = overlay.speakerNames[speaker] ?? '';
  await nextTick();
  document.getElementById('live-rename')?.focus();
}

function saveName(): void {
  if (renaming.value !== null) overlay.setSpeakerName(renaming.value, draft.value);
  renaming.value = null;
}

// Presenting: the one line shrinks until it all shows, however long it runs
const quick = useQuickControls();
/** The session's settings, in a sheet over the bottom of the screen */
const menuOpen = ref(false);
const stage = ref<HTMLElement | null>(null);
useFitText(stage, () => [last.value?.text, overlay.scale, immersive.value, presenting.value]);

function stop(): void {
  exitImmersive();
  stopVoiceNote();
  session.stop();
}

function restart(): void {
  session.start().catch((err: unknown) => logError('Restart failed', err));
}

// New lines scroll into view, as long as the user has not scrolled up to read
watch(
  () => [lines.value.length, current.value?.text] as const,
  async () => {
    const el = list.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    await nextTick();
    if (atBottom) el.scrollTop = el.scrollHeight;
  },
);

// A phone left on the table or held up to a room: keep its screen on
const wakeLock = createScreenWakeLock();
wakeLock.hold();
onBeforeUnmount(() => {
  wakeLock.release();
  stopVoiceNote();
  exitImmersive();
});
</script>

<template>
  <TalkView v-if="session.mode === 'talk'" @stop="stop" />

  <main
    v-else
    class="mlive"
    :class="{ 'mlive--present': presenting, 'mlive--full': immersive }"
    :style="{ '--text-scale': String(overlay.scale) }"
  >
    <p class="mlive__status" :style="{ '--level': String(overlay.level) }">
      <ListeningBadge :error="!!session.liveError" on-page />
      <span>{{ overlay.pair.from }} → {{ overlay.pair.to }}</span>
      <span v-if="session.headset">· 🎧</span>
      <span v-if="overlay.notice" class="mlive__notice">{{ t(overlay.notice) }}</span>
    </p>

    <div v-if="session.liveError" class="mlive__error" role="alert">
      <p>{{ t(session.liveError) }}</p>
      <div class="mlive__row">
        <button class="lg-btn" type="button" @click="session.dismissError()">
          {{ t('mobile.cancel') }}
        </button>
        <button class="lg-btn lg-btn--primary" type="button" @click="restart">
          {{ t('mobile.start') }}
        </button>
      </div>
    </div>

    <!-- Presenting: one line, as big as the screen allows -->
    <section v-else-if="presenting" class="mlive__stage" aria-live="polite">
      <div ref="stage" class="mlive__big">
        <p>{{ last?.text || t('mobile.waiting') }}</p>
      </div>
      <p v-if="heard" class="mlive__heard">{{ heard }}</p>
    </section>

    <section v-else ref="list" class="mlive__lines" aria-live="polite">
      <p v-if="!lines.length" class="mlive__waiting">
        {{ overlay.source.text || t('mobile.waiting') }}
      </p>
      <article
        v-for="line in lines"
        :key="line.key"
        class="mlive__line"
        :class="{ 'mlive__line--live': line.live }"
      >
        <template v-if="line.speaker !== null">
          <form
            v-if="renaming === line.speaker && !line.live"
            class="mlive__rename"
            @submit.prevent="saveName"
          >
            <label class="mlive__sr" for="live-rename">{{ t('mobile.rename') }}</label>
            <input id="live-rename" v-model="draft" maxlength="30" @blur="saveName" />
          </form>
          <button
            v-else
            class="mlive__who"
            type="button"
            :aria-label="`${t('mobile.rename')}: ${nameOf(line.speaker)}`"
            @click="rename(line.speaker)"
          >
            {{ nameOf(line.speaker) }}
          </button>
        </template>
        <p class="mlive__text">{{ line.text }}</p>
      </article>
    </section>

    <p v-if="voiceTip && !presenting" class="mlive__tip">{{ t(voiceTip) }}</p>

    <!-- The same quick controls as the bar: pause, volume, text size; then settings and stop -->
    <footer class="mlive__controls">
      <div class="mlive__quick">
        <button
          class="mlive__btn"
          type="button"
          :aria-label="overlay.paused ? t('overlay.resume') : t('overlay.pause')"
          :title="overlay.paused ? t('overlay.resume') : t('overlay.pause')"
          :aria-pressed="overlay.paused"
          @click="overlay.paused = !overlay.paused"
        >
          <span aria-hidden="true">{{ overlay.paused ? '▶' : '⏸' }}</span>
        </button>
        <div class="mlive__group" role="group" :aria-label="t('overlay.quick.volume')">
          <button
            class="mlive__btn"
            type="button"
            :aria-label="overlay.options.voice ? t('overlay.voiceOff') : t('overlay.voiceOn')"
            :title="overlay.options.voice ? t('overlay.voiceOff') : t('overlay.voiceOn')"
            :aria-pressed="overlay.options.voice"
            @click="quick.toggleVoice"
          >
            <span aria-hidden="true">{{ overlay.options.voice ? '🔊' : '🔇' }}</span>
          </button>
          <button
            class="mlive__btn"
            type="button"
            :disabled="!quick.canQuieter.value"
            :aria-label="t('overlay.quick.quieter')"
            :title="t('overlay.quick.quieter')"
            @click="quick.quieter"
          >
            −
          </button>
          <button
            class="mlive__btn"
            type="button"
            :disabled="!quick.canLouder.value"
            :aria-label="t('overlay.quick.louder')"
            :title="t('overlay.quick.louder')"
            @click="quick.louder"
          >
            +
          </button>
        </div>
        <div class="mlive__group" role="group" :aria-label="t('overlay.quick.text')">
          <button
            class="mlive__btn"
            type="button"
            :disabled="!quick.canSmaller.value"
            :aria-label="t('mobile.smaller')"
            :title="t('mobile.smaller')"
            @click="quick.smaller"
          >
            A−
          </button>
          <button
            class="mlive__btn"
            type="button"
            :disabled="!quick.canBigger.value"
            :aria-label="t('mobile.bigger')"
            :title="t('mobile.bigger')"
            @click="quick.bigger"
          >
            A+
          </button>
        </div>
        <button
          class="mlive__btn"
          type="button"
          :aria-label="immersive ? t('mobile.exitFullScreen') : t('mobile.fullScreen')"
          :title="immersive ? t('mobile.exitFullScreen') : t('mobile.fullScreen')"
          :aria-pressed="immersive"
          @click="toggleImmersive"
        >
          <FullscreenIcon :on="immersive" />
        </button>
      </div>
      <div class="mlive__row">
        <button
          class="mlive__btn"
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="menuOpen"
          @click="menuOpen = true"
        >
          ⚙ {{ t('overlay.options.title') }}
        </button>
        <button class="mlive__btn mlive__btn--stop" type="button" @click="stop">
          ■ {{ t('mobile.stop') }}
        </button>
      </div>
    </footer>

    <!-- Settings: a sheet over the bottom, closed by its button, the backdrop or Esc -->
    <div
      v-if="menuOpen"
      class="mlive__sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="t('overlay.options.title')"
      @click.self="menuOpen = false"
      @keydown.esc="menuOpen = false"
    >
      <div class="mlive__sheet-body">
        <button
          class="mlive__sheet-close"
          type="button"
          :aria-label="t('live.side.hide')"
          :title="t('live.side.hide')"
          @click="menuOpen = false"
        >
          ✕
        </button>
        <SettingsPanel :live="session.active" hint="mobile.optionsHint" />
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
.mlive {
  --text-scale: 1;

  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 10px;
  height: calc(100dvh - 52px);
  padding: 10px 16px 14px;
  background: var(--bg);
  color: var(--fg);

  // Nothing above it: the screen is all text, clear of notches and bars
  &--full {
    height: 100dvh;
    padding: max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(14px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }

  &--present {
    background: #000;
    color: #fff;
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    font-weight: 600;
  }

  &--present &__status {
    color: rgb(255 255 255 / 60%);
  }

  &__notice {
    color: var(--accent-text);
  }

  &__lines {
    display: grid;
    align-content: end;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &__waiting {
    margin: 0;
    color: var(--muted);
    font-size: calc(20px * var(--text-scale));
  }

  &__line {
    display: grid;
    gap: 2px;
    justify-items: start;
    color: var(--muted);
  }

  &__line:last-child,
  &__line--live {
    color: var(--fg);
  }

  &__who {
    padding: 2px 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  &__rename input {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    font-size: 16px;
  }

  &__text {
    margin: 0;
    font-size: calc(22px * var(--text-scale));
    font-weight: 600;
    line-height: 1.3;
  }

  &__stage {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 18px;
    min-height: 0;
  }

  // The box keeps its size; the line inside shrinks (--fit) until all of it shows
  &__big {
    --fit: 1;

    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    font-size: calc(34px * var(--text-scale) * var(--fit));
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;

    p {
      margin: auto 0;
    }
  }

  &__heard {
    margin: 0;
    color: rgb(255 255 255 / 55%);
    font-size: 15px;
  }

  &__tip {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--fg);
    font-size: 15px;
  }

  &__error {
    display: grid;
    align-content: center;
    gap: 14px;
    font-size: 18px;
  }

  &__row,
  &__controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  &__controls {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  // Pause · volume · text size · full screen: one row the thumb reaches
  &__quick {
    display: flex;
    gap: 6px;
    justify-content: space-between;

    > .mlive__btn {
      flex: 0 0 48px;
    }
  }

  // Buttons that belong together sit joined in one pill
  &__group {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;

    .mlive__btn {
      flex: 1 1 44px;
      border-radius: 0;
    }

    .mlive__btn + .mlive__btn {
      border-left-width: 0;
    }

    .mlive__btn:first-child {
      border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    }

    .mlive__btn:last-child {
      border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
    }
  }

  &__sheet {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-end;
    background: rgb(0 0 0 / 45%);
  }

  &__sheet-body {
    position: relative;
    width: 100%;
    max-height: 85dvh;
    padding: 8px 8px max(8px, env(safe-area-inset-bottom));
    overflow-y: auto;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--bg);

    :deep(.settings-panel) {
      max-height: none;
    }

    // Room for the close button beside the title
    :deep(.settings-panel__head) {
      padding-right: 60px;
    }
  }

  &__sheet-close {
    position: absolute;
    top: 12px;
    right: 14px;
    z-index: 1;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--panel);
    color: var(--fg);
    font-size: 16px;
    cursor: pointer;
  }

  &__btn {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 56px;
    padding: 0 6px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    background: var(--panel);
    color: var(--fg);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;

    &[aria-pressed='true'] {
      border-color: var(--accent-fill);
      background: var(--accent-fill);
      color: #fff;
    }

    &--stop {
      border-color: transparent;
      background: var(--danger-fill);
      color: #fff;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }

  &--present &__status :deep(.badge) {
    color: #fff;
  }

  &--present &__btn:not(&__btn--stop) {
    border-color: rgb(255 255 255 / 25%);
    background: rgb(255 255 255 / 8%);
    color: #fff;
  }

  &__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
}
</style>
