<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { downloadText } from '@/modules/session';
import { logError } from '@/shared/errors';
import {
  BACKUP_EXTENSION,
  backupFilename,
  createBackup,
  resetPreferences,
  restoreBackup,
} from '../../utils/settingsBackup';

type Status = { tone: 'ok' | 'error'; key: string } | null;

/** How long "Reset" waits for its confirming second click */
const CONFIRM_MS = 5000;
/** Long enough to read "Restored" before the page reloads with the new values */
const RELOAD_DELAY_MS = 900;

/**
 * Saves every preference to a file, restores them from one, or puts them back to
 * their defaults. The API key is never saved nor reset here. Restoring and resetting
 * reload the page, since each store reads its values once.
 */
const props = withDefaults(defineProps<{ reload?: () => void }>(), {
  reload: () => window.location.reload(),
});

const { t } = useI18n();
const input = ref<HTMLInputElement | null>(null);
const status = ref<Status>(null);
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | undefined;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

function onExport(): void {
  const backup = createBackup();
  const done = downloadText(
    backupFilename(),
    `${JSON.stringify(backup, null, 2)}\n`,
    'application/json',
  );
  status.value = done
    ? { tone: 'ok', key: 'settingsPage.backup.exported' }
    : { tone: 'error', key: 'settingsPage.backup.exportFailed' };
}

function pick(): void {
  status.value = null;
  input.value?.click();
}

function reloadSoon(key: string): void {
  status.value = { tone: 'ok', key };
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(props.reload, RELOAD_DELAY_MS);
}

async function onPicked(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (target) target.value = '';
  if (!file) return;
  try {
    const result = restoreBackup(await file.text());
    if (result.ok) reloadSoon('settingsPage.backup.restored');
    else status.value = { tone: 'error', key: `settingsPage.backup.errors.${result.error}` };
  } catch (err) {
    logError('Restoring settings failed', err);
    status.value = { tone: 'error', key: 'settingsPage.backup.errors.unreadable' };
  }
}

// Two clicks, no dialog: the first arms the button for a few seconds
function onReset(): void {
  if (!confirming.value) {
    confirming.value = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => (confirming.value = false), CONFIRM_MS);
    return;
  }
  clearTimeout(confirmTimer);
  confirming.value = false;
  resetPreferences();
  reloadSoon('settingsPage.backup.resetDone');
}

onBeforeUnmount(() => {
  clearTimeout(confirmTimer);
  clearTimeout(reloadTimer);
});
</script>

<template>
  <div class="backup">
    <p class="backup__hint">{{ t('settingsPage.backup.hint') }}</p>
    <div class="backup__actions">
      <button class="lg-btn" type="button" @click="onExport">
        {{ t('settingsPage.backup.export') }}
      </button>
      <button class="lg-btn" type="button" @click="pick">
        {{ t('settingsPage.backup.import') }}
      </button>
      <button
        class="lg-btn backup__reset"
        :class="{ 'backup__reset--armed': confirming }"
        type="button"
        @click="onReset"
      >
        {{ confirming ? t('settingsPage.backup.resetConfirm') : t('settingsPage.backup.reset') }}
      </button>
    </div>
    <input
      ref="input"
      class="backup__file"
      type="file"
      :accept="`${BACKUP_EXTENSION},application/json`"
      tabindex="-1"
      aria-hidden="true"
      @change="onPicked"
    />
    <p
      class="backup__status"
      :class="status && `backup__status--${status.tone}`"
      :role="status?.tone === 'error' ? 'alert' : 'status'"
    >
      {{ status ? t(status.key) : '' }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.backup {
  display: grid;
  gap: 10px;

  &__hint {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__reset--armed {
    border-color: var(--danger);
    color: var(--danger);
  }

  &__file {
    display: none;
  }

  &__status {
    min-height: 1.4em;
    margin: 0;
    font-size: 12.5px;

    &--ok {
      color: var(--muted);
    }

    &--error {
      color: var(--danger);
    }
  }
}
</style>
