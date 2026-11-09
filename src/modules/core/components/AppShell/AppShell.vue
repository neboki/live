<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLiveSession } from '@/modules/live';
import {
  useSessionRecord,
  useSessionViewer,
  SESSION_FILE_EXTENSION,
  elapsed,
  sessionDuration,
} from '@/modules/session';
import { UiLocaleSelect, UiBrandSelect, UiThemeSelect } from '@/modules/settings';
import { logError } from '@/shared/errors';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { useAppPage } from '../../store/useAppPage';
import BrandMark from '../BrandMark/BrandMark.vue';
import { brand } from '@/shared/brand/brand';
import { HOME_URL, PRIVACY_URL, REPO_URL } from '@/shared/links';

/** Which page the main area shows, mirrored from App's own choice */
type Page = 'live' | 'recent' | 'file' | 'settings' | 'start';

/** The picker suggests our files; a renamed .json still opens */
const ACCEPT = `${SESSION_FILE_EXTENSION},.json,application/json`;
const TICK_MS = 1000;
/** Below this width the sidebar is a drawer (kept in step with the SCSS $drawer-at) */
const DRAWER_QUERY = '(width < 900px)';
/** Remembers whether the user opened the sidebar out; it starts as a column of icons */
const EXPANDED_KEY = 'sidebar-expanded';

/**
 * The app frame: a sidebar to move between a new session, the live one and the
 * conversations, and the page beside it using the rest of the width. On phones the
 * sidebar is a drawer opened from a top bar.
 */
const session = useLiveSession();
const record = useSessionRecord();
const viewer = useSessionViewer();
const appPage = useAppPage();
const { t, locale } = useI18n();
const menuOpen = ref(false);
const input = ref<HTMLInputElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const burger = ref<HTMLButtonElement | null>(null);
/** The sidebar is a drawer: when closed it is off-screen and must be out of reach too */
const isDrawer = ref(false);
let drawerQuery: MediaQueryList | null = null;
const onDrawerChange = (): void => {
  isDrawer.value = drawerQuery?.matches ?? false;
};
/** The desktop sidebar shows its names; folded, only icons (a drawer always shows them) */
const expanded = ref(readStorage(EXPANDED_KEY) === 'true');
const compact = computed(() => !expanded.value && !isDrawer.value);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const page = computed<Page>(() => {
  if (session.showLive) return 'live';
  if (viewer.snapshot) return viewer.source;
  if (appPage.settingsOpen) return 'settings';
  return 'start';
});
const hasRecent = computed(() => record.startedAt !== null && record.endedAt !== null);
const recentLabel = computed(() => {
  if (record.startedAt === null) return '';
  const time = new Intl.DateTimeFormat(locale.value, { timeStyle: 'short' }).format(
    record.startedAt,
  );
  return `${time} · ${elapsed(sessionDuration(record))}`;
});
// While live the record has no end yet: count up to now
const elapsedLabel = computed(() =>
  record.startedAt === null ? '' : elapsed(now.value - record.startedAt),
);

function toggleExpanded(): void {
  expanded.value = !expanded.value;
  writeStorage(EXPANDED_KEY, String(expanded.value));
}

/** Folded, the names are tooltips */
function tip(label: string): string | undefined {
  return compact.value ? label : undefined;
}

function goStart(): void {
  viewer.close();
  appPage.settingsOpen = false;
  menuOpen.value = false;
}

function goRecent(): void {
  appPage.settingsOpen = false;
  viewer.showRecent();
  menuOpen.value = false;
}

// A conversation on screen would hide the settings page: close it first
function goSettings(): void {
  viewer.close();
  appPage.settingsOpen = true;
  menuOpen.value = false;
}

function pick(): void {
  viewer.clearError();
  input.value?.click();
}

function onPicked(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  // The same file can be picked again after closing it
  target.value = '';
  if (!file) return;
  menuOpen.value = false;
  appPage.settingsOpen = false;
  viewer.openFile(file).catch((err: unknown) => logError('Opening a session failed', err));
}

watch(
  () => session.active,
  (active) => {
    clearInterval(ticker);
    if (active) ticker = setInterval(() => (now.value = Date.now()), TICK_MS);
  },
  { immediate: true },
);
// A drawer is a modal: focus goes in with it, Escape closes it, and comes back out
watch(menuOpen, async (open) => {
  if (!isDrawer.value) return;
  await nextTick();
  if (open) closeButton.value?.focus();
  else burger.value?.focus();
});
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && menuOpen.value) menuOpen.value = false;
}
onMounted(() => {
  // Older test environments have no matchMedia; the sidebar then behaves as on a desktop
  drawerQuery = typeof matchMedia === 'function' ? matchMedia(DRAWER_QUERY) : null;
  drawerQuery?.addEventListener('change', onDrawerChange);
  onDrawerChange();
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  clearInterval(ticker);
  drawerQuery?.removeEventListener('change', onDrawerChange);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="shell" :class="{ 'shell--open': menuOpen, 'shell--compact': compact }">
    <!-- Phones: the sidebar is a drawer behind this bar -->
    <header class="shell__mobile" :inert="isDrawer && menuOpen">
      <button
        ref="burger"
        class="shell__burger"
        type="button"
        :aria-label="t('nav.menu')"
        :aria-expanded="menuOpen"
        aria-controls="lg-sidebar"
        @click="menuOpen = true"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" /></svg>
      </button>
      <span class="shell__brand">
        <BrandMark />
        {{ brand.name }}
      </span>
      <span v-if="session.showLive" class="shell__live-pill"
        ><i class="shell__dot"></i>{{ t('live.badge') }}</span
      >
    </header>

    <div class="shell__backdrop" aria-hidden="true" @click="menuOpen = false"></div>

    <aside id="lg-sidebar" class="shell__side" :inert="isDrawer && !menuOpen">
      <div class="shell__top">
        <a v-if="!compact" class="shell__brand" :href="HOME_URL" :aria-label="t('nav.home')">
          <BrandMark />
          {{ brand.name }}
        </a>
        <!-- Desktop only: folds the sidebar to its icons, or opens it out -->
        <button
          class="shell__fold"
          type="button"
          :aria-label="t(compact ? 'nav.expand' : 'nav.collapse')"
          :title="t(compact ? 'nav.expand' : 'nav.collapse')"
          :aria-expanded="!compact"
          aria-controls="lg-sidebar"
          @click="toggleExpanded"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3" y="4" width="14" height="12" rx="2.5" />
            <path d="M8 4v12" />
            <path v-if="compact" d="m11.5 8.5 1.5 1.5-1.5 1.5" />
            <path v-else d="M13 8.5 11.5 10l1.5 1.5" />
          </svg>
        </button>
        <button
          ref="closeButton"
          class="shell__close"
          type="button"
          :aria-label="t('nav.closeMenu')"
          @click="menuOpen = false"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>

      <nav class="shell__nav" :aria-label="t('nav.label')">
        <button
          class="shell__item"
          :class="{ 'shell__item--on': page === 'start' }"
          type="button"
          :disabled="session.showLive"
          :aria-current="page === 'start' ? 'page' : undefined"
          :title="tip(t('nav.newSession'))"
          @click="goStart"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>
          <span class="shell__label">{{ t('nav.newSession') }}</span>
        </button>

        <button
          v-if="session.showLive"
          class="shell__item shell__item--on"
          type="button"
          aria-current="page"
          :title="tip(`${t('nav.live')} · ${elapsedLabel}`)"
          @click="menuOpen = false"
        >
          <i class="shell__dot shell__dot--item"></i>
          <span class="shell__label">{{ t('nav.live') }}</span>
          <span class="shell__tag shell__label">{{ elapsedLabel }}</span>
        </button>

        <p class="shell__group lg-label">{{ t('nav.conversations') }}</p>

        <button
          v-if="hasRecent"
          class="shell__item"
          :class="{ 'shell__item--on': page === 'recent' }"
          type="button"
          :disabled="session.showLive"
          :aria-current="page === 'recent' ? 'page' : undefined"
          :title="tip(t('nav.recent'))"
          @click="goRecent"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 5.5h12M4 10h12M4 14.5h7" />
          </svg>
          <span class="shell__text shell__label">
            {{ t('nav.recent') }}
            <small>{{ recentLabel }}</small>
          </span>
        </button>

        <button
          v-if="viewer.snapshot && viewer.source === 'file'"
          class="shell__item shell__item--on"
          type="button"
          aria-current="page"
          :title="viewer.fileName ?? undefined"
          @click="menuOpen = false"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 3h6l3 3v11h-9z M11.5 3v3h3" />
          </svg>
          <span class="shell__text shell__label">{{ viewer.fileName }}</span>
        </button>

        <button
          class="shell__item shell__item--quiet"
          type="button"
          :disabled="session.showLive || viewer.opening"
          :title="tip(t('nav.openFile'))"
          @click="pick"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5.5v10h14V7.5h-7L8.5 5.5z" />
          </svg>
          <span class="shell__label">{{
            viewer.opening ? t('nav.opening') : t('nav.openFile')
          }}</span>
        </button>
        <input
          ref="input"
          class="shell__input"
          type="file"
          :accept="ACCEPT"
          tabindex="-1"
          aria-hidden="true"
          @change="onPicked"
        />

        <button
          class="shell__item shell__item--settings"
          :class="{ 'shell__item--on': page === 'settings' }"
          type="button"
          :disabled="session.showLive"
          :aria-current="page === 'settings' ? 'page' : undefined"
          :title="tip(t('nav.settings'))"
          @click="goSettings"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
            <circle cx="13" cy="6" r="2" />
            <circle cx="7" cy="14" r="2" />
          </svg>
          <span class="shell__label">{{ t('nav.settings') }}</span>
        </button>
      </nav>

      <footer v-if="!compact" class="shell__foot">
        <UiLocaleSelect class="shell__locale" />
        <UiThemeSelect class="shell__locale" />
        <UiBrandSelect class="shell__locale" />
        <a class="shell__link" :href="PRIVACY_URL" target="_blank" rel="noopener noreferrer">
          {{ t('nav.privacy') }}
        </a>
        <a class="shell__link" :href="REPO_URL" target="_blank" rel="noopener noreferrer">
          {{ t('nav.github') }}
        </a>
      </footer>
    </aside>

    <div class="shell__main" :inert="isDrawer && menuOpen">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
// Sidebar on the left, the page using the rest of the width. Below 900px the sidebar
// slides in as a drawer from a slim top bar.
$side-width: 248px;
$drawer-at: 900px;

.shell {
  --side-width: #{$side-width};

  min-height: 100vh;
  min-height: 100dvh;

  @media (width >= $drawer-at) {
    display: grid;
    grid-template-columns: var(--side-width) minmax(0, 1fr);
  }

  // Phone bar
  &__mobile {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    gap: 10px;
    align-items: center;
    height: 52px;
    padding: 0 12px 0 6px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);

    @media (width >= $drawer-at) {
      display: none;
    }
  }

  &__burger,
  &__close {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--fg);
    cursor: pointer;

    &:hover {
      background: var(--hover);
    }

    svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-width: 1.6;
    }
  }

  // Folds the desktop sidebar: a quiet icon at the right of its top row
  &__fold {
    display: none;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-left: auto;
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
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
    }

    @media (width >= $drawer-at) {
      display: grid;
    }
  }

  &__close {
    margin-left: auto;

    @media (width >= $drawer-at) {
      display: none;
    }
  }

  &__live-pill {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  // Sidebar
  &__backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
    background: rgb(0 0 0 / 40%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;

    @media (width >= $drawer-at) {
      display: none;
    }
  }

  &--open &__backdrop {
    opacity: 1;
    pointer-events: auto;
  }

  &__side {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    width: min(var(--side-width) + 32px, 85vw);
    border-right: 1px solid var(--line);
    background: var(--panel-2);
    transform: translateX(-100%);
    transition: transform 0.25s var(--ease-out);

    @media (width >= $drawer-at) {
      position: sticky;
      top: 0;
      width: auto;
      height: 100vh;
      height: 100dvh;
      transform: none;
      transition: none;
    }
  }

  &--open &__side {
    box-shadow: var(--shadow-lg);
    transform: none;
  }

  &__top {
    display: flex;
    align-items: center;
    height: 60px;
    padding: 0 10px 0 20px;
    border-bottom: 1px solid var(--line-soft);
  }

  &__brand {
    display: inline-flex;
    gap: 10px;
    align-items: center;
    color: var(--fg);
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.01em;

    &:hover {
      text-decoration: none;
    }
  }

  &__nav {
    display: grid;
    flex: 1;
    gap: 2px;
    align-content: start;
    padding: 14px 10px;
    overflow-y: auto;
  }

  &__group {
    margin: 18px 10px 6px;
  }

  &__item {
    position: relative;
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 38px;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    font: 500 13.5px var(--font-ui);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;

    &:hover:not(:disabled) {
      background: var(--hover);
      color: var(--fg);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    svg {
      flex: none;
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
    }

    // The current page: a panel tile with a coral edge
    &--on,
    &--on:hover:not(:disabled) {
      background: var(--panel);
      box-shadow:
        0 0 0 1px var(--line),
        var(--shadow-xs);
      color: var(--fg);

      &::before {
        content: '';
        position: absolute;
        top: 9px;
        bottom: 9px;
        left: -10px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--brand-gradient);
      }
    }

    &--quiet {
      color: var(--subtle);
    }

    // Settings sit apart from the conversations
    &--settings {
      margin-top: 18px;
    }
  }

  &__text {
    display: grid;
    min-width: 0;
    overflow-wrap: anywhere;

    small {
      color: var(--subtle);
      font: 400 11.5px var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
  }

  &__tag {
    margin-left: auto;
    color: var(--accent-text);
    font: 500 11.5px var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentcolor;
    animation: shell-pulse 1.6s ease-in-out infinite;

    &--item {
      flex: none;
      width: 8px;
      height: 8px;
      margin: 0 5px;
      background: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft);
    }
  }

  &__input {
    display: none;
  }

  &__foot {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    padding: 14px 20px 18px;
    border-top: 1px solid var(--line-soft);
  }

  // The interface language and the look take a line each; the links share the last
  &__locale {
    flex-basis: 100%;
    margin-bottom: 6px;
  }

  &__link {
    color: var(--subtle);
    font-size: 12.5px;

    &:hover {
      color: var(--fg);
      text-decoration: none;
    }
  }

  &__main {
    min-width: 0;
  }

  // Folded: a column of icons, the names kept for screen readers and as tooltips
  &--compact {
    --side-width: 64px;
  }

  &--compact &__top {
    justify-content: center;
    padding: 0;
  }

  &--compact &__fold {
    margin: 0;
  }

  &--compact &__nav {
    padding: 14px 10px;
  }

  &--compact &__group {
    height: 1px;
    margin: 12px 6px;
    overflow: hidden;
    background: var(--line-soft);
    color: transparent;
  }

  &--compact &__item {
    justify-content: center;
    padding: 7px 0;
  }

  &--compact &__item--settings {
    margin-top: 12px;
  }

  &--compact &__dot--item {
    margin: 0;
  }

  &--compact &__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

@keyframes shell-pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
