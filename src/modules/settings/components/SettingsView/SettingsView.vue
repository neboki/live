<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ACCOUNTS_ENABLED, AccountCard } from '@/modules/account';
import { ApiKeyField, AudioSourcePicker, PlacementPicker } from '@/modules/onboarding';
import { SettingsMenu, useFloatingWindow } from '@/modules/overlay';
import LanguageSelect from '../LanguageSelect/LanguageSelect.vue';
import SettingsBackup from '../SettingsBackup/SettingsBackup.vue';
import UiLocaleSelect from '../UiLocaleSelect/UiLocaleSelect.vue';
import UiThemeSelect from '../UiThemeSelect/UiThemeSelect.vue';

/**
 * Every setting on one page, without starting a session: languages and look, what to
 * listen to, the key, then the bar's own options (the same menu as in the bar and the
 * floating window, so both always agree), and a backup of it all.
 */
const { t } = useI18n();
const canFloat = useFloatingWindow().isSupported;
</script>

<template>
  <main class="settings-view">
    <header class="lg-head">
      <h1 class="lg-head__title">{{ t('settingsPage.title') }}</h1>
      <p class="settings-view__intro">{{ t('settingsPage.intro') }}</p>
    </header>

    <div class="settings-view__content lg-page">
      <div class="settings-view__grid lg-glass-page">
        <section class="lg-card settings-view__card" aria-labelledby="settings-general">
          <h2 id="settings-general" class="lg-card__title">
            {{ t('settingsPage.general.title') }}
          </h2>
          <div class="settings-view__row">
            <span class="settings-view__label">
              {{ t('settingsPage.general.translate') }}
              <small>{{ t('settingsPage.general.translateHint') }}</small>
            </span>
            <LanguageSelect />
          </div>
          <div class="settings-view__row">
            <span class="settings-view__label">
              {{ t('nav.uiLanguage') }}
              <small>{{ t('settingsPage.general.uiLanguageHint') }}</small>
            </span>
            <UiLocaleSelect class="settings-view__pick" />
          </div>
          <div class="settings-view__row">
            <span class="settings-view__label">
              {{ t('nav.theme.label') }}
              <small>{{ t('settingsPage.general.themeHint') }}</small>
            </span>
            <UiThemeSelect class="settings-view__pick" />
          </div>
        </section>

        <!-- The bar's menu: each of its groups becomes a card of this grid, right under
             the languages -->
        <SettingsMenu class="settings-view__menu" popped page />

        <section class="lg-card settings-view__card" aria-labelledby="settings-listen">
          <h2 id="settings-listen" class="lg-card__title">{{ t('settingsPage.listen') }}</h2>
          <AudioSourcePicker />
          <PlacementPicker :can-float="canFloat" />
        </section>

        <section class="lg-card settings-view__card" aria-labelledby="settings-key">
          <h2 id="settings-key" class="lg-card__title">{{ t('settingsPage.key') }}</h2>
          <ApiKeyField />
        </section>

        <section
          v-if="ACCOUNTS_ENABLED"
          class="lg-card settings-view__card"
          aria-labelledby="settings-account"
        >
          <h2 id="settings-account" class="lg-card__title">{{ t('account.title') }}</h2>
          <AccountCard />
        </section>

        <section class="lg-card settings-view__card" aria-labelledby="settings-backup">
          <h2 id="settings-backup" class="lg-card__title">
            {{ t('settingsPage.backup.title') }}
          </h2>
          <SettingsBackup />
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
$card-gap: 20px;

.settings-view {
  min-height: 100vh;
  min-height: 100dvh;

  &__intro {
    flex: 1 1 320px;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__content {
    display: grid;
    gap: $card-gap;
    align-content: start;
  }

  // Cards flow into as many columns as fit, each kept whole
  &__grid {
    columns: 380px auto;
    column-gap: $card-gap;
  }

  &__card {
    margin: 0 0 $card-gap;
    break-inside: avoid;
  }

  // The menu's own box disappears: its groups sit in the grid like the other cards
  &__menu {
    display: contents;
  }

  &__grid :deep(.menu .menu__group) {
    margin: 0 0 $card-gap;
    break-inside: avoid;
    gap: 4px;

    // The menu's rows carry 8px of their own, so the text lines up with the other cards
    padding: clamp(18px, 2vw, 24px) calc(clamp(18px, 2vw, 24px) - 8px);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);
  }

  // The menu's small group titles, as card titles here
  &__grid :deep(:is(.menu__title, .look__title, .sound__title, .quality__title)) {
    padding: 0 8px 6px;
    color: var(--fg);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    text-transform: none;
  }

  &__card {
    display: grid;
    gap: 12px;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);
  }

  &__label {
    flex: 1 1 180px;
    min-width: 0;
    font-size: 13.5px;

    small {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
  }

  // The sidebar's quiet pickers, framed as fields on this page
  &__pick {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    color: var(--fg);
  }
}
</style>
