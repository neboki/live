<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { brand } from '@/shared/brand/brand';
import { PRIVACY_CONTACT } from '@/shared/links';
import { hasDemo } from '@/shared/providers/openai/demo';
import { ACCOUNTS_ENABLED } from '../../buildFeatures';

/**
 * What the app does with people's data, in plain words, inside the app (the repository
 * is private, so a link to docs/privacy.md would be a 404). Every statement here is
 * backed by the code: keep it in step with docs/privacy.md and SECURITY.md when the
 * data flows change, and move UPDATED_AT.
 */

/** Day this page last changed (ISO date) */
const UPDATED_AT = '2026-11-09';
/** Rows of the "what is sent" table, in the order of a session */
const DATA_ROWS = ['audio', 'interpreter', 'hints', 'text', 'extras', 'tts', 'key'] as const;
const PROVIDERS = [
  { id: 'openai', url: 'https://openai.com/policies/api-data-usage-policies' },
  {
    id: 'azure',
    url: 'https://learn.microsoft.com/legal/cognitive-services/openai/data-privacy',
  },
  { id: 'google', url: 'https://firebase.google.com/support/privacy' },
] as const;

interface Section {
  id: string;
  title: string;
}

const props = withDefaults(
  defineProps<{
    /** Whether this build lets people sign in (a prop so tests can show both) */
    accounts?: boolean;
    /** Whether this build offers the free demo */
    demo?: boolean;
  }>(),
  { accounts: ACCOUNTS_ENABLED, demo: hasDemo },
);

const { t, tm, rt, locale } = useI18n();

/** Values every message on the page may use */
const params = computed(() => ({ brand: brand.value.name, email: PRIVACY_CONTACT }));

/** A list of messages (an array in the locale files), rendered */
function list(key: string): string[] {
  const messages: unknown = tm(key);
  return Array.isArray(messages)
    ? messages.map((message) => rt(message as Parameters<typeof rt>[0], params.value))
    : [];
}

const updated = computed(() =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(
    new Date(`${UPDATED_AT}T12:00:00`),
  ),
);

const sections = computed<Section[]>(() => {
  const ids = [
    'summary',
    'data',
    'device',
    'never',
    'files',
    'key',
    'security',
    ...(props.accounts ? ['account'] : []),
    ...(props.demo ? ['demo'] : []),
    'providers',
    'consent',
    'rights',
    'contact',
    'changes',
  ];
  return ids.map((id) => ({ id, title: t(`privacyPage.${id}.title`) }));
});

/** Sections whose body is a plain list */
const LIST_SECTIONS = new Set(['never', 'files', 'key', 'security', 'account', 'demo', 'rights']);
</script>

<template>
  <main class="privacy-view">
    <header class="lg-head">
      <h1 class="lg-head__title">{{ t('privacyPage.title') }}</h1>
      <p class="privacy-view__intro">
        {{ t('privacyPage.intro', params) }}
        <small>{{ t('privacyPage.updated', { date: updated }) }}</small>
      </p>
    </header>

    <div class="privacy-view__content lg-page">
      <nav class="privacy-view__toc lg-card" :aria-label="t('privacyPage.contents')">
        <h2 class="lg-card__title">{{ t('privacyPage.contents') }}</h2>
        <ol>
          <li v-for="section in sections" :key="section.id">
            <a :href="`#privacy-${section.id}`">{{ section.title }}</a>
          </li>
        </ol>
      </nav>

      <div class="privacy-view__body">
        <section
          v-for="section in sections"
          :id="`privacy-${section.id}`"
          :key="section.id"
          class="lg-card privacy-view__card"
          :class="`privacy-view__card--${section.id}`"
          :aria-labelledby="`privacy-${section.id}-title`"
        >
          <h2 :id="`privacy-${section.id}-title`" class="lg-card__title">{{ section.title }}</h2>

          <template v-if="section.id === 'summary'">
            <ul class="privacy-view__list privacy-view__list--checks">
              <li v-for="item in list('privacyPage.summary.items')" :key="item">{{ item }}</li>
            </ul>
            <p v-if="props.accounts" class="privacy-view__note">
              {{ t('privacyPage.summary.account') }}
            </p>
            <p v-if="props.demo" class="privacy-view__note">
              {{ t('privacyPage.summary.demo') }}
            </p>
          </template>

          <template v-else-if="section.id === 'data'">
            <p class="privacy-view__text">{{ t('privacyPage.data.intro') }}</p>
            <div class="privacy-view__table-wrap">
              <table class="privacy-view__table">
                <thead>
                  <tr>
                    <th scope="col">{{ t('privacyPage.data.cols.what') }}</th>
                    <th scope="col">{{ t('privacyPage.data.cols.where') }}</th>
                    <th scope="col">{{ t('privacyPage.data.cols.when') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in DATA_ROWS" :key="row">
                    <th scope="row">{{ t(`privacyPage.data.rows.${row}.what`) }}</th>
                    <td :data-label="t('privacyPage.data.cols.where')">
                      {{ t(`privacyPage.data.rows.${row}.where`) }}
                    </td>
                    <td :data-label="t('privacyPage.data.cols.when')">
                      {{ t(`privacyPage.data.rows.${row}.when`) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="privacy-view__note">{{ t('privacyPage.data.azure') }}</p>
          </template>

          <template v-else-if="section.id === 'device'">
            <p class="privacy-view__text">{{ t('privacyPage.device.intro') }}</p>
            <ul class="privacy-view__list">
              <li v-for="item in list('privacyPage.device.items')" :key="item">{{ item }}</li>
              <li v-if="props.accounts">{{ t('privacyPage.device.account') }}</li>
            </ul>
            <p class="privacy-view__note">{{ t('privacyPage.device.wipe') }}</p>
          </template>

          <template v-else-if="section.id === 'providers'">
            <p class="privacy-view__text">{{ t('privacyPage.providers.intro') }}</p>
            <ul class="privacy-view__list">
              <li v-for="provider in PROVIDERS" :key="provider.id">
                {{ t(`privacyPage.providers.${provider.id}`) }}
                <a :href="provider.url" target="_blank" rel="noopener noreferrer">
                  {{ t('privacyPage.providers.link') }}
                </a>
              </li>
            </ul>
          </template>

          <ul v-else-if="LIST_SECTIONS.has(section.id)" class="privacy-view__list">
            <li v-for="item in list(`privacyPage.${section.id}.items`)" :key="item">
              {{ item }}
            </li>
          </ul>

          <p v-else-if="section.id === 'contact'" class="privacy-view__text">
            <i18n-t keypath="privacyPage.contact.text" tag="span" scope="global">
              <template #email>
                <a :href="`mailto:${PRIVACY_CONTACT}`">{{ PRIVACY_CONTACT }}</a>
              </template>
            </i18n-t>
          </p>

          <p v-else class="privacy-view__text">{{ t(`privacyPage.${section.id}.text`) }}</p>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
$card-gap: 20px;
$toc-at: 1100px;
$table-at: 640px;

.privacy-view {
  min-height: 100vh;
  min-height: 100dvh;

  &__intro {
    flex: 1 1 320px;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;

    small {
      display: block;
      margin-top: 2px;
      font-size: 11.5px;
    }
  }

  &__content {
    display: grid;
    gap: $card-gap;
    align-items: start;

    @media (width >= $toc-at) {
      grid-template-columns: 240px minmax(0, 1fr);
    }
  }

  // The table of contents follows the reader on wide screens
  &__toc {
    @media (width >= $toc-at) {
      position: sticky;
      top: 16px;
    }

    ol {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
    }
  }

  &__body {
    display: grid;
    gap: $card-gap;
    max-width: 860px;
  }

  &__card {
    display: grid;
    gap: 12px;
    scroll-margin-top: 72px;
    line-height: 1.55;
  }

  &__text,
  &__note {
    margin: 0;
  }

  &__note {
    color: var(--muted);
    font-size: 13px;
  }

  &__list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 20px;

    &--checks {
      padding-left: 0;
      list-style: none;

      li {
        position: relative;
        padding-left: 26px;
      }

      li::before {
        content: '✓';
        position: absolute;
        left: 4px;
        color: var(--accent);
        font-weight: 700;
      }
    }
  }

  &__table-wrap {
    overflow-x: auto;
  }

  &__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;

    th,
    td {
      padding: 10px 12px 10px 0;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    thead th {
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    tbody th {
      width: 34%;
      font-weight: 600;
    }

    // On a phone each row becomes a small block with its own labels
    @media (width < $table-at) {
      thead {
        display: none;
      }

      tr,
      th,
      td {
        display: block;
        width: auto;
      }

      tbody tr {
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
      }

      tbody th,
      td {
        padding: 2px 0;
        border: 0;
      }

      td::before {
        content: attr(data-label) ': ';
        color: var(--muted);
        font-weight: 600;
      }
    }

    tbody th {
      @media (width < $table-at) {
        width: auto;
      }
    }
  }
}
</style>
