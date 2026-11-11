<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ACCOUNTS_ENABLED, AccountCard } from '@/modules/account';
import { ApiKeyField, AudioSourcePicker, PlacementPicker } from '@/modules/onboarding';
import {
  ElevenLabsKeyField,
  SettingsMenu,
  useFloatingWindow,
  useOverlayStore,
} from '@/modules/overlay';
import { isPhoneLayout } from '@/shared/device';
import BrandEditor from '../BrandEditor/BrandEditor.vue';
import LanguageSelect from '../LanguageSelect/LanguageSelect.vue';
import SettingsBackup from '../SettingsBackup/SettingsBackup.vue';
import SettingsTabs from '../SettingsTabs/SettingsTabs.vue';
import UiLocaleSelect from '../UiLocaleSelect/UiLocaleSelect.vue';
import UiThemeSelect from '../UiThemeSelect/UiThemeSelect.vue';

type TabId = 'general' | 'captions' | 'audio' | 'accuracy' | 'connection' | 'brand' | 'data';

const TAB_ICONS: Readonly<Record<TabId, string>> = {
  general: '⚙️',
  captions: '💬',
  audio: '🔊',
  accuracy: '🎯',
  connection: '🔑',
  brand: '🎨',
  data: '💾',
};
const TAB_IDS = Object.keys(TAB_ICONS) as TabId[];
/** The last tab open, so coming back lands where the person left */
const TAB_STORAGE_KEY = 'neboki.settings.tab';

/**
 * Every setting without starting a session, one subject per tab: languages and look,
 * the captions, the sound, accuracy, the key and its cost, the brand, a backup. The
 * captions, sound and technical tabs show the bar's own menu, one block each, so the
 * page, the bar and the floating window always agree.
 */
const { t } = useI18n();
const canFloat = useFloatingWindow().isSupported;
const overlay = useOverlayStore();
/** A phone also gets its few everyday settings first, under General */
const phone = isPhoneLayout(canFloat);
const uid = useId();

const tabs = computed(() =>
  TAB_IDS.map((id) => ({ id, icon: TAB_ICONS[id], label: t(`settingsPage.tabs.${id}.label`) })),
);

function readTab(): TabId {
  try {
    const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
    return TAB_IDS.find((id) => id === saved) ?? 'general';
  } catch {
    return 'general';
  }
}

const active = ref<TabId>(readTab());
watch(active, (id) => {
  try {
    sessionStorage.setItem(TAB_STORAGE_KEY, id);
  } catch {
    // Storage blocked: the page simply opens on General next time
  }
});
</script>

<template>
  <main class="settings-view">
    <header class="lg-head">
      <h1 class="lg-head__title">{{ t('settingsPage.title') }}</h1>
      <p class="settings-view__intro">{{ t('settingsPage.intro') }}</p>
    </header>

    <div class="settings-view__content lg-page">
      <div class="settings-view__layout lg-glass-page">
        <SettingsTabs
          v-model="active"
          class="settings-view__tabs"
          :tabs="tabs"
          :label="t('settingsPage.tabsLabel')"
          :id-prefix="uid"
        />

        <section
          :id="`${uid}-panel-${active}`"
          :key="active"
          class="settings-view__panel"
          role="tabpanel"
          :aria-labelledby="`${uid}-tab-${active}`"
          tabindex="0"
        >
          <header class="settings-view__panel-head">
            <h2 class="settings-view__panel-title">{{ t(`settingsPage.tabs.${active}.label`) }}</h2>
            <p class="settings-view__panel-hint">{{ t(`settingsPage.tabs.${active}.hint`) }}</p>
          </header>

          <template v-if="active === 'general'">
            <div class="lg-card settings-view__card">
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
            </div>

            <!-- A phone's everyday settings: voice and text size -->
            <section
              v-if="phone"
              class="lg-card settings-view__card"
              :aria-labelledby="`${uid}-basics`"
            >
              <h3 :id="`${uid}-basics`" class="lg-card__title">{{ t('mobile.basics.title') }}</h3>
              <label class="settings-view__switch" :for="`${uid}-voice`">
                <span class="settings-view__label">
                  {{ t('mobile.basics.voice') }}
                  <small>{{ t('mobile.basics.voiceHint') }}</small>
                </span>
                <input :id="`${uid}-voice`" v-model="overlay.options.voice" type="checkbox" />
              </label>
              <label class="settings-view__slider" :for="`${uid}-volume`">
                <span class="settings-view__label">{{ t('mobile.basics.volume') }}</span>
                <input
                  :id="`${uid}-volume`"
                  v-model.number="overlay.voiceVolume"
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                />
              </label>
              <label class="settings-view__slider" :for="`${uid}-scale`">
                <span class="settings-view__label">{{ t('mobile.basics.textSize') }}</span>
                <input
                  :id="`${uid}-scale`"
                  v-model.number="overlay.scale"
                  type="range"
                  min="0.8"
                  max="1.8"
                  step="0.1"
                />
              </label>
            </section>

            <section
              v-if="ACCOUNTS_ENABLED"
              class="lg-card settings-view__card"
              :aria-labelledby="`${uid}-account`"
            >
              <h3 :id="`${uid}-account`" class="lg-card__title">{{ t('account.title') }}</h3>
              <AccountCard />
            </section>
          </template>

          <template v-else-if="active === 'captions'">
            <SettingsMenu class="settings-view__menu" popped page only="see" />
            <div v-if="!phone" class="lg-card settings-view__card">
              <PlacementPicker :can-float="canFloat" />
            </div>
          </template>

          <template v-else-if="active === 'audio'">
            <div class="lg-card settings-view__card">
              <AudioSourcePicker />
            </div>
            <SettingsMenu class="settings-view__menu" popped page only="hear" />
          </template>

          <SettingsMenu
            v-else-if="active === 'accuracy'"
            class="settings-view__menu"
            popped
            page
            only="accuracy"
          />

          <template v-else-if="active === 'connection'">
            <div class="lg-card settings-view__card">
              <ApiKeyField />
            </div>
            <!-- The optional voice key beside the main one, where people look for keys -->
            <div class="lg-card settings-view__card">
              <ElevenLabsKeyField @choose="active = 'audio'" />
            </div>
            <SettingsMenu class="settings-view__menu" popped page only="quality" />
          </template>

          <div v-else-if="active === 'brand'" class="lg-card settings-view__card">
            <BrandEditor />
          </div>

          <div v-else class="lg-card settings-view__card">
            <SettingsBackup />
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped lang="scss">
$gap: 16px;

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
    align-content: start;
  }

  // Tabs in a column beside one readable column of cards; stacked on a phone
  &__layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 720px);
    gap: 28px;
    align-items: start;

    @media (width <= 860px) {
      grid-template-columns: minmax(0, 1fr);
      gap: $gap;
    }
  }

  &__tabs {
    position: sticky;
    top: calc(env(safe-area-inset-top, 0px) + 16px);

    @media (width <= 860px) {
      position: static;
    }
  }

  &__panel {
    display: grid;
    gap: $gap;
    min-width: 0;

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 6px;
      border-radius: var(--radius-lg);
    }
  }

  &__panel-head {
    display: grid;
    gap: 4px;
  }

  &__panel-title {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  &__panel-hint {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  &__card {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  // The menu's own box disappears: its blocks sit in the panel like the other cards
  &__menu {
    display: contents;
  }

  &__panel :deep(.menu .menu__group) {
    gap: 4px;
    margin: 0;

    // The menu's rows carry 8px of their own, so the text lines up with the other cards
    padding: clamp(18px, 2vw, 24px) calc(clamp(18px, 2vw, 24px) - 8px);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);
  }

  // The tab already names the subject: the menu's own block title would repeat it
  &__panel :deep(.menu__title) {
    display: none;
  }

  // The smaller blocks inside a menu group, as sub-headings here
  &__panel :deep(:is(.look__title, .sound__title, .quality__title)) {
    padding: 8px 0 6px;
    color: var(--fg);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    text-transform: none;
  }

  &__switch,
  &__slider {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 52px;
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);

    .settings-view__label {
      font-size: 16px;
    }

    input[type='checkbox'] {
      width: 28px;
      height: 28px;
      accent-color: var(--accent);
    }

    input[type='range'] {
      flex: 1 1 140px;
      accent-color: var(--accent);
    }
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;

    & + & {
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
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
