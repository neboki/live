<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CaptionBar, SettingsPanel, SYNC_DELAY_AUTO, useOverlayStore } from '@/modules/overlay';
import { createScreenWakeLock } from '@/shared/device';
import { logError } from '@/shared/errors';
import { useLiveSession } from '../../store/useLiveSession';
import LivePlayer from '../LivePlayer/LivePlayer.vue';
import SyncedTab from '../SyncedTab/SyncedTab.vue';

/**
 * The tab during a live session. The captions show here, as a bar across the page,
 * unless they are in the floating window: then this page says so, shows the last
 * sentence and offers to bring them back. Either way the bar moves from one place to
 * the other from its own buttons. Beside it, the bar's settings (while they are out of
 * reach in the window) and what is being heard. With the sync option on, the shared
 * tab itself plays here behind time, above the captions.
 */
const session = useLiveSession();
const overlay = useOverlayStore();
const { t } = useI18n();
/** i18n key of why the floating window could not open */
const openError = ref<string | null>(null);
/** The options and notes beside the captions: out of the way until asked for */
const sideOpen = ref(false);
/** The panel holds the options only where the bar's own menu is not at hand */
const sideHasOptions = computed(
  () => !session.inPage || session.syncedTab !== null || session.livePicture !== null,
);
const sideLabelKey = computed(() => (sideHasOptions.value ? 'live.side.label' : 'live.side.help'));
/** What is being heard */
const noticeKey = computed(() => `live.notice.${session.source}`);
/** Where the captions are */
const whereKey = computed(() => `live.where.${session.inPage ? 'page' : 'floating'}`);
/**
 * How to keep reading: the floating window, or this tab beside the call. Listening to
 * the microphone only (a phone on the table) there is no call to follow beside it.
 */
const tipKey = computed(() => {
  if (!session.inPage) return 'live.tip';
  return session.source === 'mic' ? 'live.micPageTip' : 'live.pageTip';
});
/** The last sentence: while the captions float, the page still shows they are coming */
const lastLine = computed(() => overlay.translation.text.trim() || overlay.previous);

/** Straight from the click: the floating window needs it. */
function popOut(): void {
  session
    .popOut()
    .then((error) => (openError.value = error?.userMessageKey ?? null))
    .catch((err: unknown) => logError('Floating the captions failed', err));
}

/** Opens the share dialog and the floating window again, so it needs the click too. */
function restart(): void {
  session.start().catch((err: unknown) => logError('Restart failed', err));
}

// Captions in the page may be on a phone left on the table: keep its screen on
const wakeLock = createScreenWakeLock();
watch(
  () => session.inPage,
  (inPage) => (inPage ? wakeLock.hold() : wakeLock.release()),
  { immediate: true },
);
onBeforeUnmount(() => wakeLock.release());
</script>

<template>
  <main class="live">
    <header class="lg-head">
      <h1 class="lg-head__title">
        <i class="live__dot" aria-hidden="true"></i>{{ t('nav.live') }}
      </h1>
      <div class="lg-head__actions">
        <button
          class="live__panel-toggle lg-btn lg-btn--quiet"
          type="button"
          :aria-expanded="sideOpen"
          aria-controls="live-side"
          :title="t(sideOpen ? 'live.side.hide' : 'live.side.show')"
          @click="sideOpen = !sideOpen"
        >
          <svg v-if="sideHasOptions" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
            <circle cx="13" cy="6" r="2" />
            <circle cx="7" cy="14" r="2" />
          </svg>
          <svg v-else viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" />
            <path d="M8 8a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1v.6M10 14v.1" />
          </svg>
          <span class="live__panel-label">{{ t(sideLabelKey) }}</span>
        </button>
        <!-- With the bar in the page, Stop is its last button; here only while it is away -->
        <button
          v-if="session.active && (!session.inPage || session.syncedTab)"
          class="live__stop lg-btn"
          type="button"
          @click="session.stop()"
        >
          <span class="live__square" aria-hidden="true"></span> {{ t('live.stop') }}
        </button>
      </div>
    </header>

    <div class="live__content lg-page" :class="{ 'live__content--side': sideOpen }">
      <div class="live__main">
        <!-- Synced, the player is the captions: they show on its picture, in step -->
        <SyncedTab
          v-if="session.syncedTab"
          :playback="session.syncedTab"
          :delay-seconds="session.syncDelaySeconds ?? 0"
          :auto="overlay.syncDelay === SYNC_DELAY_AUTO"
          :calibrating="session.syncCalibrating"
          :lag-seconds="session.syncLagSeconds"
          :paused="session.syncPaused"
          :waiting="session.syncWaiting"
          :lines="session.syncedLines"
          :silent="session.tabSilent"
          @delay="overlay.syncDelay = $event"
        />

        <!-- A shared tab plays here as it plays there, a player with the captions on it -->
        <LivePlayer
          v-else-if="session.inPage && session.livePicture"
          :stream="session.livePicture"
          :can-pop-out="session.canFloat"
          @options="sideOpen = true"
          @pop-out="popOut"
          @stop="session.stop()"
        />

        <!-- The bar itself, as wide as the page allows; its Float button moves it to the window -->
        <section v-else-if="session.inPage" class="live__captions">
          <CaptionBar
            v-show="!overlay.hidden"
            :stoppable="session.active"
            :resizable="false"
            fill
            :can-pop-out="session.canFloat"
            :live="session.active"
            :error="session.liveError"
            :waiting-key="session.starting ? session.startingKey : 'overlay.waiting'"
            @stop="session.stop()"
            @pop-out="popOut"
            @restart="restart"
            @dismiss-error="session.dismissError()"
          />
          <p v-if="openError" class="live__error" role="alert">{{ t(openError) }}</p>
        </section>

        <!-- The captions are in the floating window: say so, and offer to bring them back -->
        <section v-else class="live__stage">
          <svg class="live__icon" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="4" y="8" width="40" height="30" rx="5" />
            <rect x="20" y="22" width="20" height="12" rx="3" class="live__icon-pip" />
          </svg>
          <h2 class="live__title">{{ t('live.floating.open.title') }}</h2>
          <p v-if="lastLine" class="live__last">{{ lastLine }}</p>
          <p class="live__text">{{ t('live.floating.open.text') }}</p>
          <div class="live__actions">
            <button class="live__bring lg-btn" type="button" @click="session.popIn()">
              {{ t('live.floating.bring') }}
            </button>
          </div>
        </section>

        <p v-if="session.syncFailed" class="live__error" role="alert">
          {{ t('live.sync.failed') }}
        </p>
      </div>

      <aside
        v-show="sideOpen"
        id="live-side"
        class="live__side"
        :aria-label="t(sideLabelKey)"
        @keydown.esc="sideOpen = false"
      >
        <button
          class="live__side-close"
          type="button"
          :aria-label="t('live.side.hide')"
          :title="t('live.side.hide')"
          @click="sideOpen = false"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
        <!-- In the page the bar has its own menu; this one stands in for the window's -->
        <SettingsPanel v-if="sideHasOptions" :live="session.active" />
        <div class="live__notes">
          <p class="live__notice">{{ t(noticeKey) }} {{ t(whereKey) }}</p>
          <p v-if="session.source !== 'tab'" class="live__tip">{{ t('live.roomTip') }}</p>
          <p v-if="session.syncedTab" class="live__tip">{{ t('live.sync.hint') }}</p>
          <p v-else class="live__tip">{{ t(tipKey) }}</p>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped lang="scss">
.live {
  min-height: 100vh;
  min-height: 100dvh;

  // The captions (or where they went) take the page; the notes sit beside them when there is room
  // The captions take the whole width; the panel, when asked for, sits beside them
  // on a wide screen and slides over them on a narrow one
  &__content {
    display: grid;
    gap: 20px;
    align-items: start;
    max-width: none;
    padding-bottom: 24px;
  }

  &__content--side {
    @media (width >= 1200px) {
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 24px;
    }
  }

  &__panel-toggle {
    display: inline-flex;
    gap: 6px;
    align-items: center;

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-width: 1.5;
    }

    &[aria-expanded='true'] {
      background: var(--hover);
    }
  }

  &__panel-label {
    @media (width < 600px) {
      display: none;
    }
  }

  // The synced picture, then the captions or their stand-in
  &__main {
    display: grid;
    gap: 20px;
    min-width: 0;
  }

  // Live: a red dot before the title, as on the session in the side bar
  &__dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 10px;
    border-radius: var(--radius-pill);
    background: var(--danger);
    vertical-align: middle;
    animation: live-pulse 1.6s ease-in-out infinite;
  }

  &__square {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--danger);
  }

  // The bar itself, as wide as the page allows
  // The page is the captions: the bar fills the screen under the header, and what
  // was said earlier scrolls back inside it
  &__captions {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    justify-items: center;
    height: calc(100dvh - 60px - clamp(16px, 3vw, 32px) - 24px);
    min-height: 320px;

    // Under the phone bar (see AppShell)
    @media (width < 900px) {
      height: calc(100dvh - 52px - 60px - 16px - 16px);
    }

    // The bar is a fixed-width overlay elsewhere; here it fills the column
    > * {
      width: 100%;
    }
  }

  // Where the captions would be: it points to the floating window instead
  &__stage {
    display: grid;
    gap: 10px;
    place-content: center;
    place-items: center;
    min-height: max(320px, calc(100vh - 160px));
    padding: 40px 24px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-lg);
    background: linear-gradient(180deg, var(--wall-a), var(--wall-b));
    text-align: center;
  }

  &__icon {
    width: 56px;
    height: 56px;
    margin-bottom: 4px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 2.5;
  }

  &__icon-pip {
    fill: var(--accent);
    stroke: none;
  }

  &__title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }

  // The last sentence, as the window shows it
  &__last {
    max-width: 60ch;
    margin: 4px 0;
    color: var(--fg);
    font-size: 17px;
    font-weight: 500;
    line-height: 1.4;
  }

  &__text {
    max-width: 52ch;
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 6px;
  }

  &__error {
    max-width: 52ch;
    margin: 0;
    color: var(--danger);
    font-size: 14px;
  }

  // Settings first, the notes under them
  &__side {
    position: relative;
    display: grid;
    gap: 20px;
    align-content: start;
    min-width: 0;

    @media (width < 1200px) {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 40;
      width: min(380px, 92vw);
      padding: 52px 16px 16px;
      overflow-y: auto;
      background: var(--bg);
      box-shadow: var(--shadow-lg);
    }
  }

  &__side-close {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--subtle);
    cursor: pointer;

    &:hover {
      background: var(--hover);
      color: var(--fg);
    }

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-width: 1.6;
    }

    // Beside the captions the header's button closes it; over them it needs its own
    @media (width >= 1200px) {
      display: none;
    }
  }

  &__notes {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);
  }

  &__notice,
  &__tip {
    max-width: 68ch;
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  &__tip {
    color: var(--subtle);
    font-size: 12.5px;
  }
}

@keyframes live-pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
