<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  downloadMarkdown,
  downloadSessionFile,
  downloadSubtitles,
} from '../../composables/useExportSession';
import { useSettingsStore } from '@/modules/settings';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { useSessionAi } from '../../composables/useSessionAi';
import { useSessionViewer, type ViewerSource } from '../../store/useSessionViewer';
import type { SessionSnapshot } from '../../types';
import {
  audioSentSeconds,
  costByModel,
  costUsd,
  hasUnpricedUsage,
  perHourUsd,
} from '../../utils/costUsd';
import { formatEur } from '../../utils/formatCost';
import { elapsed, sessionDuration } from '../../utils/toMarkdown';
import SessionDownloadMenu, {
  type DownloadKind,
} from '../SessionDownloadMenu/SessionDownloadMenu.vue';
import SessionSide from '../SessionSide/SessionSide.vue';
import SessionTitle from '../SessionTitle/SessionTitle.vue';
import SessionTranscript from '../SessionTranscript/SessionTranscript.vue';

const emit = defineEmits<{
  /** Its name, its summary or what it cost changed here: whoever keeps it can save it */
  changed: [];
}>();

const SAVED_FEEDBACK_MS = 2500;
const SIDE_HIDDEN_KEY = 'session-side-hidden';
/** The page title, by where the conversation came from */
const TITLES: Readonly<Record<ViewerSource, string>> = {
  recent: 'session.view.ended',
  file: 'session.view.fromFile',
  cloud: 'session.view.fromAccount',
};
const EMPTY: SessionSnapshot = {
  startedAt: null,
  endedAt: null,
  pair: { from: '', to: '' },
  lines: [],
  summary: [],
  glossary: '',
  usage: [],
};

/** A finished or saved conversation: its figures, summary, terms and searchable transcript. */
const viewer = useSessionViewer();
const settings = useSettingsStore();
const { t, locale } = useI18n();
const ai = useSessionAi(() => emit('changed'));
const saved = ref(false);
const failed = ref(false);
const sideHidden = ref(readStorage(SIDE_HIDDEN_KEY) === 'true');
/** The search of the transcript: typed there, or set by pressing a term */
const query = ref('');
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

const session = computed<SessionSnapshot>(() => viewer.snapshot ?? EMPTY);
const dateLabel = computed(() => {
  const start = session.value.startedAt;
  if (start === null) return '—';
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(start);
});
const durationLabel = computed(() => elapsed(sessionDuration(session.value)));
const unpriced = computed(() => hasUnpricedUsage(session.value.usage));
/** What an hour costs at this conversation's pace; nothing for a very short one */
const rateLabel = computed(() => {
  const rate = perHourUsd(costUsd(session.value.usage), sessionDuration(session.value));
  return rate === null || unpriced.value ? null : formatEur(rate, locale.value);
});
const byModel = computed(() =>
  costByModel(session.value.usage).map((entry) => ({
    ...entry,
    label: entry.priced ? formatEur(entry.usd, locale.value) : t('overlay.cost.unknownShort'),
  })),
);
/** Audio sent for transcription against the whole conversation: the silence saved */
const billedLabel = computed(() => {
  const sent = audioSentSeconds(session.value.usage, settings.tts.model);
  if (!sent) return null;
  return t('session.view.audioBilled', {
    sent: elapsed(sent * 1000),
    heard: elapsed(sessionDuration(session.value)),
  });
});
const costLabel = computed(() =>
  hasUnpricedUsage(session.value.usage)
    ? t('overlay.cost.unknown')
    : formatEur(costUsd(session.value.usage), locale.value),
);
const terms = computed(() =>
  session.value.glossary
    .split('\n')
    .map((term) => term.trim())
    .filter(Boolean),
);
/** The side panel only exists when there is something to put in it, or the AI to ask */
const hasSide = computed(
  () => session.value.summary.length > 0 || terms.value.length > 0 || ai.ready.value,
);
const sideOpen = computed(() => hasSide.value && !sideHidden.value);
const sideLabel = computed(() => {
  if (ai.ready.value) return t('session.view.side');
  return session.value.summary.length ? t('session.md.summary') : t('session.md.glossary');
});

/** Why the last download or summary failed, for the reader */
const errorLabel = computed(() => {
  if (failed.value) return t('session.view.downloadFailed');
  return ai.errorKey.value ? t(ai.errorKey.value) : null;
});

/** Shown or hidden as the reader left it last time */
function toggleSide(): void {
  sideHidden.value = !sideHidden.value;
  writeStorage(SIDE_HIDDEN_KEY, sideHidden.value ? 'true' : null);
}

function download(kind: DownloadKind): void {
  const ok =
    kind === 'file'
      ? downloadSessionFile(session.value)
      : kind === 'markdown'
        ? downloadMarkdown(session.value)
        : downloadSubtitles(session.value, kind);
  saved.value = ok;
  failed.value = !ok;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    saved.value = false;
    failed.value = false;
  }, SAVED_FEEDBACK_MS);
}

function rename(title: string): void {
  viewer.setTitle(title);
  emit('changed');
}

// A conversation gets its name as soon as it is on screen: the one that just ended, or an
// older one from the account that never had one. A file is only named when asked to: its
// name would be gone with the page.
watch(
  () => [viewer.snapshot?.startedAt, ai.canName.value] as const,
  () => {
    if (viewer.snapshot && !viewer.snapshot.title && viewer.source !== 'file') {
      void ai.name({ quiet: true });
    }
  },
  { immediate: true },
);

function close(): void {
  viewer.close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(feedbackTimer);
});
</script>

<template>
  <main class="session">
    <header class="lg-head">
      <SessionTitle
        :title="session.title ?? ''"
        :fallback="t(TITLES[viewer.source])"
        :can-generate="ai.canName.value"
        :generating="ai.naming.value"
        @rename="rename"
        @generate="ai.name()"
      />
      <div class="lg-head__actions">
        <span v-if="errorLabel" class="session__failed" role="alert">{{ errorLabel }}</span>
        <!-- What other modules add for their own conversations (deleting one from the account) -->
        <slot name="actions" />
        <SessionDownloadMenu :saved="saved" @pick="download" />
      </div>
    </header>

    <div class="session__content lg-page">
      <section class="session__head">
        <p v-if="viewer.fileName" class="session__file">{{ viewer.fileName }}</p>
        <dl class="session__facts">
          <div class="session__fact">
            <dt>{{ t('session.md.date') }}</dt>
            <dd>{{ dateLabel }}</dd>
          </div>
          <div class="session__fact">
            <dt>{{ t('session.md.pair') }}</dt>
            <dd class="session__mono">
              {{ session.pair.from || 'AUTO' }} → {{ session.pair.to || '—' }}
            </dd>
          </div>
          <div class="session__fact">
            <dt>{{ t('session.md.duration') }}</dt>
            <dd class="session__mono">{{ durationLabel }}</dd>
          </div>
          <div class="session__fact">
            <dt>{{ t('session.view.lines') }}</dt>
            <dd class="session__mono">{{ session.lines.length }}</dd>
          </div>
          <div class="session__fact session__fact--cost" :title="t('overlay.cost.hint')">
            <dt>{{ t('session.md.cost') }}</dt>
            <dd class="session__mono">≈ {{ costLabel }}</dd>
          </div>
          <div v-if="rateLabel" class="session__fact">
            <dt>{{ t('session.view.rate') }}</dt>
            <dd class="session__mono">≈ {{ rateLabel }}</dd>
          </div>
        </dl>
        <p v-if="billedLabel" class="session__billed">{{ billedLabel }}</p>
        <ul
          v-if="byModel.length > 1"
          class="session__models"
          :aria-label="t('overlay.cost.byModel')"
        >
          <li v-for="entry in byModel" :key="entry.model">
            <span class="session__mono">{{ entry.model }}</span>
            <span class="session__mono">{{ entry.label }}</span>
          </li>
        </ul>
      </section>

      <div class="session__grid" :class="{ 'session__grid--side': sideOpen }">
        <SessionSide
          v-if="sideOpen"
          id="session-side"
          class="session__side"
          :summary="session.summary"
          :terms="terms"
          :assistant="ai.ready.value"
          :can-summarize="ai.canSummarize.value"
          :summarizing="ai.summarizing.value"
          :turns="ai.turns.value"
          :asking="ai.asking.value"
          :started-at="session.startedAt"
          @term="query = $event"
          @summarize="ai.summarize()"
          @ask="(request, label) => ai.ask(request, label)"
          @stop="ai.stop()"
        />

        <SessionTranscript v-model:query="query" class="session__transcript" :lines="session.lines">
          <template v-if="hasSide" #tools>
            <button
              class="lg-btn session__toggle"
              type="button"
              aria-controls="session-side"
              :aria-expanded="sideOpen"
              @click="toggleSide"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="3" width="12" height="10" rx="2" />
                <path d="M10 3v10" />
              </svg>
              {{ sideLabel }}
            </button>
          </template>
        </SessionTranscript>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
// Wide and tall enough: the page fills the window and stays put; the summary and the
// transcript scroll on their own, so the figures and the downloads never leave sight
$fixed-at: '(width >= 900px) and (height >= 560px)';

.session {
  min-height: 100vh;
  min-height: 100dvh;

  @media #{$fixed-at} {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }

  &__content {
    display: grid;
    gap: 24px;
    max-width: none;

    @media #{$fixed-at} {
      flex: 1;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      padding-bottom: clamp(16px, 3vw, 32px);
    }
  }

  &__failed {
    color: var(--danger);
    font-size: 12.5px;
  }

  &__head {
    display: grid;
    gap: 6px;
  }

  &__file {
    margin: 0;
    color: var(--subtle);
    font: 12px var(--font-mono);
    word-break: break-all;
  }

  // Key figures in one row of tiles, cost highlighted. Flex, not grid: when they wrap, the
  // last row stretches instead of leaving an empty grey cell
  &__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--line);

    > * {
      flex: 1 1 150px;
    }
  }

  // Below the tiles: the silence saved and the cost per model, as quiet footnotes
  &__billed {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__models {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    color: var(--muted);
    font-size: 12px;

    li {
      display: inline-flex;
      gap: 8px;
    }
  }

  &__fact {
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    background: var(--panel);

    dt {
      color: var(--subtle);
      font-size: 11.5px;
    }

    dd {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
    }

    &--cost dd {
      color: var(--accent);
    }
  }

  &__mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  &__grid {
    display: grid;
    gap: 20px;
    align-items: start;

    // The summary sits to the right of the transcript, and only takes a column when shown:
    // a conversation without one gives the transcript the whole width
    @media (width >= 860px) {
      &--side {
        grid-template-columns: minmax(0, 1fr) clamp(340px, 28vw, 440px);
      }
    }

    @media #{$fixed-at} {
      align-items: stretch;
      min-height: 0;
    }
  }

  // First in the page on a narrow screen (summary before a long transcript), right when wide
  &__transcript {
    @media (width >= 860px) {
      grid-row: 1;
      grid-column: 1;
    }
  }

  &__toggle {
    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentcolor;
      stroke-linejoin: round;
      stroke-width: 1.4;
    }

    &[aria-expanded='true'] {
      border-color: var(--accent);
      color: var(--accent);
    }
  }

  // Where the side panel goes; what is in it is SessionSide's own business
  &__side {
    @media (width >= 860px) {
      position: sticky;
      top: 84px;
      grid-row: 1;
      grid-column: 2;
    }

    @media #{$fixed-at} {
      position: static;
      min-height: 0;
      overflow-y: auto;
    }
  }
}
</style>
