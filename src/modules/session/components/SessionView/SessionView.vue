<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  downloadMarkdown,
  downloadSessionFile,
  downloadSubtitles,
} from '../../composables/useExportSession';
import { useSettingsStore } from '@/modules/settings';
import { useSessionViewer } from '../../store/useSessionViewer';
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
import SessionTranscript from '../SessionTranscript/SessionTranscript.vue';

type Saved = 'file' | 'markdown' | 'srt' | 'vtt' | null;

const SAVED_FEEDBACK_MS = 2500;
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
const saved = ref<Saved>(null);
const failed = ref(false);
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

function feedback(kind: Exclude<Saved, null>, ok: boolean): void {
  saved.value = ok ? kind : null;
  failed.value = !ok;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    saved.value = null;
    failed.value = false;
  }, SAVED_FEEDBACK_MS);
}

function saveFile(): void {
  feedback('file', downloadSessionFile(session.value));
}

function saveMarkdown(): void {
  feedback('markdown', downloadMarkdown(session.value));
}

function saveSubtitles(format: 'srt' | 'vtt'): void {
  feedback(format, downloadSubtitles(session.value, format));
}

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
      <h1 class="lg-head__title">
        {{ viewer.source === 'file' ? t('session.view.fromFile') : t('session.view.ended') }}
      </h1>
      <div class="lg-head__actions">
        <span v-if="failed" class="session__failed" role="alert">
          {{ t('session.view.downloadFailed') }}
        </span>
        <button class="lg-btn" type="button" @click="saveMarkdown">
          {{ saved === 'markdown' ? t('session.view.saved') : t('session.view.markdown') }}
        </button>
        <button class="lg-btn" type="button" @click="saveSubtitles('srt')">
          {{ saved === 'srt' ? t('session.view.saved') : t('session.view.srt') }}
        </button>
        <button class="lg-btn" type="button" @click="saveSubtitles('vtt')">
          {{ saved === 'vtt' ? t('session.view.saved') : t('session.view.vtt') }}
        </button>
        <button class="lg-btn session__download" type="button" @click="saveFile">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" />
          </svg>
          {{ saved === 'file' ? t('session.view.saved') : t('session.view.download') }}
        </button>
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

      <div class="session__grid">
        <aside class="session__side">
          <section v-if="session.summary.length" class="session__card">
            <h2 class="lg-label">{{ t('session.md.summary') }}</h2>
            <ul class="session__points">
              <li v-for="(point, i) in session.summary" :key="i">{{ point }}</li>
            </ul>
          </section>
          <section v-if="terms.length" class="session__card">
            <h2 class="lg-label">{{ t('session.md.glossary') }}</h2>
            <ul class="session__terms">
              <li v-for="term in terms" :key="term">{{ term }}</li>
            </ul>
          </section>
        </aside>

        <SessionTranscript :lines="session.lines" />
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

  &__download {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;

    &:hover:not(:disabled) {
      border-color: var(--accent-strong);
      background: var(--accent-strong);
      color: #fff;
    }

    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.6;
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

    @media (width >= 860px) {
      grid-template-columns: 340px minmax(0, 1fr);
    }

    @media #{$fixed-at} {
      align-items: stretch;
      min-height: 0;
    }
  }

  &__side {
    display: grid;
    gap: 20px;
    align-content: start;

    @media (width >= 860px) {
      position: sticky;
      top: 84px;
    }

    @media #{$fixed-at} {
      position: static;
      min-height: 0;
      overflow-y: auto;
    }
  }

  &__card {
    display: grid;
    gap: 12px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);

    h2 {
      margin: 0;
    }
  }

  &__points,
  &__terms {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__points {
    display: grid;
    gap: 8px;
    font-size: 13.5px;

    li {
      padding-left: 12px;
      border-left: 2px solid var(--accent);
    }
  }

  &__terms {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    li {
      padding: 2px 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--panel-2);
      font-size: 12.5px;
    }
  }
}
</style>
