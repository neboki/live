<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { downloadMarkdownBundle, elapsed, formatEur } from '@/modules/session';
import { useTwoStep } from '../../composables/useTwoStep';
import { useAccount } from '../../store/useAccount';
import { useCloudHistory } from '../../store/useCloudHistory';
import { useCloudSave } from '../../store/useCloudSave';
import { useConversationsPage } from '../../store/useConversationsPage';
import { HISTORY_SORTS, historyTotals, languagePairs } from '../../utils/historyFilter';
import ConversationRow from '../ConversationRow/ConversationRow.vue';

/**
 * Every conversation kept in the account, to find and look after them: totals, a search
 * (also inside what was said), filters by languages, stars and days, an order, and
 * actions on one or on a whole selection (download, delete).
 */
const { t, locale } = useI18n();
const account = useAccount();
const cloudSave = useCloudSave();
const history = useCloudHistory();
const page = useConversationsPage();
const search = ref<HTMLInputElement | null>(null);
/** Downloading the ticked ones: they may have to be read from the account first */
const exporting = ref(false);
const exportFailed = ref(false);

const signedIn = computed(() => account.user !== null);
const pairs = computed(() => languagePairs(history.items));
const totals = computed(() => historyTotals(page.filtering ? page.shown : history.items));
const totalsCost = computed(() =>
  totals.value.unpriced
    ? t('overlay.cost.unknown')
    : `≈ ${formatEur(totals.value.usd, locale.value)}`,
);
const busy = computed(() => history.deleting || exporting.value);
const removeSelected = useTwoStep(() => removeIds([...page.selected]));

function pairLabel(from: string, to: string): string {
  return `${from || 'AUTO'} → ${to || '—'}`;
}

async function download(ids: readonly string[]): Promise<void> {
  if (ids.length === 0 || exporting.value) return;
  exporting.value = true;
  exportFailed.value = false;
  try {
    const snapshots = await history.read(ids);
    exportFailed.value = snapshots === null || !downloadMarkdownBundle(snapshots);
  } finally {
    exporting.value = false;
  }
}

async function removeIds(ids: readonly string[]): Promise<void> {
  if (await history.removeMany(ids)) page.clearSelection();
}

// "/" goes to the search, as in most apps with a list to search
function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    search.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  // Coming back to the page shows what changed elsewhere
  if (signedIn.value && !history.loading) void history.load();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <main class="convs">
    <header class="lg-head">
      <h1 class="lg-head__title">{{ t('conversations.title') }}</h1>
      <div v-if="signedIn" class="lg-head__actions">
        <span v-if="history.errorKey" class="convs__error" role="alert">
          {{ t(history.errorKey) }}
        </span>
        <span v-if="exportFailed" class="convs__error" role="alert">
          {{ t('session.view.downloadFailed') }}
        </span>
        <button
          class="lg-btn lg-btn--quiet"
          type="button"
          :disabled="history.loading"
          @click="history.load()"
        >
          {{ history.loading ? t('conversations.loading') : t('conversations.refresh') }}
        </button>
      </div>
    </header>

    <div class="convs__content lg-page">
      <!-- Without an account nothing is kept: say how to start -->
      <section v-if="!signedIn" class="convs__empty">
        <h2>{{ t('conversations.signedOut.title') }}</h2>
        <p>{{ t('conversations.signedOut.body') }}</p>
        <button
          v-if="account.enabled"
          class="lg-btn lg-btn--primary"
          type="button"
          :disabled="account.busy"
          @click="account.signIn()"
        >
          {{ t('account.signIn') }}
        </button>
        <p v-if="account.errorKey" class="convs__error" role="alert">{{ t(account.errorKey) }}</p>
      </section>

      <template v-else>
        <p v-if="!cloudSave.enabled" class="convs__notice">
          {{ t('conversations.savingOff') }}
          <button class="lg-btn" type="button" @click="cloudSave.setEnabled(true)">
            {{ t('conversations.turnOn') }}
          </button>
        </p>

        <dl class="convs__totals" :aria-label="t('conversations.totals')">
          <div>
            <dt>{{ t(page.filtering ? 'conversations.found' : 'conversations.count') }}</dt>
            <dd>{{ totals.count }}<span v-if="history.hasMore && !page.filtering">+</span></dd>
          </div>
          <div>
            <dt>{{ t('conversations.time') }}</dt>
            <dd class="convs__mono">{{ elapsed(totals.durationMs) }}</dd>
          </div>
          <div>
            <dt>{{ t('session.view.lines') }}</dt>
            <dd class="convs__mono">{{ totals.lines.toLocaleString(locale) }}</dd>
          </div>
          <div class="convs__cost" :title="t('overlay.cost.hint')">
            <dt>{{ t('session.md.cost') }}</dt>
            <dd class="convs__mono">{{ totalsCost }}</dd>
          </div>
        </dl>

        <form class="convs__tools" role="search" @submit.prevent>
          <label class="convs__search">
            <span class="lg-sr-only">{{ t('conversations.search') }}</span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13 13 4 4" />
            </svg>
            <input
              ref="search"
              v-model="page.filter.query"
              type="search"
              :placeholder="t('conversations.searchPlaceholder')"
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <label class="convs__toggle">
            <input v-model="page.inContent" type="checkbox" />
            {{ t('conversations.inContent') }}
            <small v-if="page.inContent && history.indexing">{{
              t('conversations.reading')
            }}</small>
          </label>

          <div class="convs__filters">
            <label>
              <span class="lg-label">{{ t('conversations.pair') }}</span>
              <select v-model="page.filter.pair">
                <option value="">{{ t('conversations.allPairs') }}</option>
                <option v-for="option in pairs" :key="option.key" :value="option.key">
                  {{ pairLabel(option.pair.from, option.pair.to) }} ({{ option.count }})
                </option>
              </select>
            </label>
            <label>
              <span class="lg-label">{{ t('conversations.fromDay') }}</span>
              <input
                v-model="page.filter.fromDay"
                type="date"
                :max="page.filter.toDay || undefined"
              />
            </label>
            <label>
              <span class="lg-label">{{ t('conversations.toDay') }}</span>
              <input
                v-model="page.filter.toDay"
                type="date"
                :min="page.filter.fromDay || undefined"
              />
            </label>
            <label>
              <span class="lg-label">{{ t('conversations.sortLabel') }}</span>
              <select v-model="page.filter.sort">
                <option v-for="sort in HISTORY_SORTS" :key="sort" :value="sort">
                  {{ t(`conversations.sort.${sort}`) }}
                </option>
              </select>
            </label>
            <label class="convs__toggle convs__toggle--chip">
              <input v-model="page.filter.starredOnly" type="checkbox" />
              {{ t('conversations.starredOnly') }}
            </label>
            <button
              v-if="page.filtering"
              class="lg-btn lg-btn--quiet"
              type="button"
              @click="page.clearFilter()"
            >
              {{ t('conversations.clearFilter') }}
            </button>
          </div>
        </form>

        <!-- Acts on every ticked conversation at once -->
        <div class="convs__bar" :class="{ 'convs__bar--on': page.selected.length > 0 }">
          <label class="convs__toggle">
            <input
              type="checkbox"
              :checked="page.allShownSelected"
              :indeterminate="page.selected.length > 0 && !page.allShownSelected"
              :disabled="page.shown.length === 0"
              @change="page.toggleAllShown()"
            />
            {{
              page.selected.length > 0
                ? t('conversations.selected', page.selected.length)
                : t('conversations.selectAll')
            }}
          </label>
          <template v-if="page.selected.length > 0">
            <button class="lg-btn" type="button" :disabled="busy" @click="download(page.selected)">
              {{ exporting ? t('conversations.preparing') : t('conversations.downloadSelected') }}
            </button>
            <button
              class="lg-btn convs__delete"
              :class="{ 'convs__delete--armed': removeSelected.armed.value }"
              type="button"
              :disabled="busy"
              @click="removeSelected.press"
            >
              {{
                history.deleting
                  ? t('account.history.deleting')
                  : removeSelected.armed.value
                    ? t('account.history.deleteConfirm')
                    : t('conversations.deleteSelected')
              }}
            </button>
            <button class="lg-btn lg-btn--quiet" type="button" @click="page.clearSelection()">
              {{ t('conversations.clearSelection') }}
            </button>
          </template>
        </div>

        <p v-if="history.loading && history.items.length === 0" class="convs__hint">
          {{ t('conversations.loading') }}
        </p>
        <p v-else-if="history.items.length === 0" class="convs__hint">
          {{ t('conversations.none') }}
        </p>
        <p v-else-if="page.shown.length === 0" class="convs__hint">
          {{ t('conversations.noMatch') }}
        </p>

        <ul v-if="page.shown.length > 0" class="convs__list">
          <ConversationRow
            v-for="item in page.shown"
            :key="item.id"
            :item="item"
            :selected="page.isSelected(item.id)"
            :query="page.inContent ? page.filter.query : ''"
            :text="history.texts.get(item.id)"
            :opening="history.openingId === item.id"
            :busy="busy"
            @toggle="page.toggle(item.id)"
            @open="history.open(item.id)"
            @star="history.setStarred(item.id, !item.starred)"
            @rename="(title) => history.rename(item.id, title)"
            @download="download([item.id])"
            @remove="removeIds([item.id])"
          />
        </ul>

        <div v-if="history.hasMore" class="convs__more">
          <p v-if="page.filtering" class="convs__hint">
            {{ t('conversations.filteringLoaded', { count: history.items.length }) }}
          </p>
          <button
            class="lg-btn"
            type="button"
            :disabled="history.loadingMore"
            @click="history.loadMore()"
          >
            {{ history.loadingMore ? t('conversations.loading') : t('conversations.loadMore') }}
          </button>
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped lang="scss">
.convs {
  min-height: 100vh;
  min-height: 100dvh;

  &__content {
    display: grid;
    gap: 18px;
    align-content: start;
  }

  &__error {
    color: var(--danger);
    font-size: 12.5px;
  }

  &__mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  &__empty {
    display: grid;
    gap: 12px;
    justify-items: start;
    max-width: 560px;
    padding: 28px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);

    h2 {
      margin: 0;
      font-size: 17px;
    }

    p {
      margin: 0;
      color: var(--muted);
    }
  }

  &__notice {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    align-items: center;
    margin: 0;
    padding: 12px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel-2);
    color: var(--muted);
    font-size: 13px;
  }

  // Same tiles as the session page
  &__totals {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--line);

    > div {
      display: grid;
      flex: 1 1 140px;
      gap: 4px;
      padding: 14px 16px;
      background: var(--panel);
    }

    dt {
      color: var(--subtle);
      font-size: 11.5px;
    }

    dd {
      margin: 0;
      font-size: 17px;
      font-weight: 650;
    }
  }

  &__cost dd {
    color: var(--accent);
  }

  &__tools {
    display: grid;
    gap: 12px;
  }

  &__search {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 42px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--panel);

    &:focus-within {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    svg {
      flex: none;
      width: 17px;
      height: 17px;
      fill: none;
      stroke: var(--subtle);
      stroke-linecap: round;
      stroke-width: 1.6;
    }

    input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: none;
      color: var(--fg);
      font: 14px var(--font-ui);
    }

    kbd {
      // Only worth showing with a keyboard
      @media (hover: none) {
        display: none;
      }

      padding: 1px 7px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      color: var(--subtle);
      font: 11px var(--font-mono);
    }
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    align-items: end;

    > label:not(.convs__toggle) {
      display: grid;
      gap: 4px;
    }

    select,
    input[type='date'] {
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      background: var(--panel);
      color: var(--fg);
      font: 13px var(--font-ui);
    }
  }

  &__toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;

    input {
      width: 15px;
      height: 15px;
      margin: 0;
      accent-color: var(--accent);
    }

    small {
      color: var(--subtle);
      font-size: 12px;
    }

    &--chip {
      height: 32px;
      padding: 0 12px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
    }
  }

  // Sticky, so the selection's actions stay at hand down a long list
  &__bar {
    position: sticky;
    top: 60px;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    min-height: 48px;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--panel-2);
    margin-bottom: -18px;

    @media (width < 900px) {
      top: 112px;
    }

    &--on {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent-soft) 60%, var(--panel));
    }
  }

  &__delete--armed,
  &__delete--armed:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }

  &__list {
    margin: 0;
    padding: 0;
    overflow: hidden;
    list-style: none;
    border: 1px solid var(--line);
    border-top: 0;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background: var(--panel);
  }

  &__hint {
    margin: 0;
    padding: 18px 2px 0;
    color: var(--muted);
    font-size: 13px;
  }

  &__more {
    display: grid;
    gap: 8px;
    justify-items: center;

    .convs__hint {
      padding: 0;
    }
  }
}
</style>
