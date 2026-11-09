<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { logError } from '@/shared/errors';
import { downloadSessionFile } from '../../composables/useExportSession';
import { useSessionRecord } from '../../store/useSessionRecord';
import { useSessionViewer } from '../../store/useSessionViewer';
import { costUsd, hasUnpricedUsage } from '../../utils/costUsd';
import { formatEur } from '../../utils/formatCost';
import { SESSION_FILE_EXTENSION } from '../../utils/sessionFile';
import { elapsed, sessionDuration } from '../../utils/toMarkdown';

/** The picker suggests our files; a renamed .json still opens */
const ACCEPT = `${SESSION_FILE_EXTENSION},.json,application/json`;

/** Home: the conversation that just ended, and a way to open a saved one (pick or drop). */
const record = useSessionRecord();
const viewer = useSessionViewer();
const { t, locale } = useI18n();
const input = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

const hasRecent = computed(() => record.startedAt !== null && record.endedAt !== null);
const recentLabel = computed(() => {
  if (record.startedAt === null) return '';
  const time = new Intl.DateTimeFormat(locale.value, { timeStyle: 'short' }).format(
    record.startedAt,
  );
  return t('session.shelf.recent', {
    time,
    duration: elapsed(sessionDuration(record)),
    lines: record.lines.length,
  });
});
const costLabel = computed(() =>
  hasUnpricedUsage(record.usage)
    ? t('overlay.cost.unknown')
    : formatEur(costUsd(record.usage), locale.value),
);

function open(file: File | undefined): void {
  if (!file) return;
  viewer.openFile(file).catch((err: unknown) => logError('Opening a session failed', err));
}

function pick(): void {
  viewer.clearError();
  input.value?.click();
}

function onPicked(event: Event): void {
  const target = event.target as HTMLInputElement;
  open(target.files?.[0]);
  // The same file can be picked again after closing it
  target.value = '';
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  open(event.dataTransfer?.files[0]);
}

function download(): void {
  downloadSessionFile(record);
}
</script>

<template>
  <div
    class="shelf"
    :class="{ 'shelf--dragging': dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div v-if="hasRecent" class="shelf__recent">
      <span class="shelf__text">
        <strong>{{ t('session.shelf.ended') }}</strong>
        {{ recentLabel }} · ≈ {{ costLabel }}
      </span>
      <span class="shelf__actions">
        <button class="lg-btn" type="button" @click="viewer.showRecent()">
          {{ t('session.shelf.view') }}
        </button>
        <button class="lg-btn" type="button" @click="download">
          {{ t('session.view.download') }}
        </button>
      </span>
    </div>

    <button class="shelf__open" type="button" :disabled="viewer.opening" @click="pick">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 4.5v8h11v-6.5H8L6.5 4.5z" />
      </svg>
      {{ viewer.opening ? t('session.shelf.opening') : t('session.shelf.open') }}
      <small>{{ t('session.shelf.drop') }}</small>
    </button>
    <input
      ref="input"
      class="shelf__input"
      type="file"
      :accept="ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onPicked"
    />
    <p v-if="viewer.errorKey" class="shelf__error" role="alert">{{ t(viewer.errorKey) }}</p>
  </div>
</template>

<style scoped lang="scss">
// A block, not a grid: the open button follows the page's text-align (centred, or left on wide screens)
.shelf {
  padding: 4px;
  border: 1px dashed transparent;
  border-radius: var(--radius-lg);
  transition:
    border-color 0.12s ease,
    background 0.12s ease;

  > * + * {
    margin-top: 8px;
  }

  &--dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  &__recent {
    display: flex;
    text-align: left;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 10px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);
  }

  &__text {
    color: var(--muted);
    font-size: 13px;
    font-variant-numeric: tabular-nums;

    strong {
      margin-right: 4px;
      color: var(--fg);
      font-weight: 600;
    }
  }

  &__actions {
    display: flex;
    gap: 6px;
  }

  // A drop zone that is also the button to pick a file
  &__open {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 18px 16px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel-2);
    color: var(--muted);
    font: 500 13px var(--font-ui);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--accent);
      color: var(--accent-text);
    }

    &:disabled {
      cursor: progress;
    }

    svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentcolor;
      stroke-linejoin: round;
      stroke-width: 1.4;
    }

    small {
      color: var(--subtle);
      font-size: 12px;
      font-weight: 400;
    }
  }

  &__input {
    display: none;
  }

  &__error {
    margin: 0;
    color: var(--danger);
    font-size: 13px;
  }
}
</style>
