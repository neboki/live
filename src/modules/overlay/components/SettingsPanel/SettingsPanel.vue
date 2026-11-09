<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import SettingsMenu from '../SettingsMenu/SettingsMenu.vue';

/**
 * The bar's settings as a panel of the page: beside the floating window during a
 * session, where the bar's menu is out of reach, and on the start screen before one.
 * It is the very same menu on the same stores, so a change here shows in the window
 * at once. It wears the page's colours, light or dark, by giving the menu's glass
 * variables the page's tokens.
 */
withDefaults(
  defineProps<{
    /** A real session is running: the menu shows its cost and the "forget key" action */
    live?: boolean;
    /** i18n key of the line under the title, saying where these options apply */
    hint?: string;
  }>(),
  { hint: 'live.options.hint' },
);

const { t } = useI18n();
</script>

<template>
  <section class="settings-panel lg-glass-page" :aria-label="t('overlay.options.title')">
    <header class="settings-panel__head">
      <h2 class="settings-panel__title">{{ t('overlay.options.title') }}</h2>
      <p class="settings-panel__hint">{{ t(hint) }}</p>
    </header>
    <!-- The bar is in an opaque window, so the opacity slider would do nothing: popped -->
    <SettingsMenu :live="live" popped />
  </section>
</template>

<style scoped lang="scss">
// The menu is styled for the bar's dark glass: here its variables take the page's
// tokens, so it reads as a card of the page in either scheme. A fixed height lets it
// scroll like the bar's own panel; a page of its own lifts that.
.settings-panel {
  display: flex;
  flex-direction: column;
  max-height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  color: var(--fg);
  font-family: var(--font-ui);

  &__head {
    display: grid;
    gap: 2px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--line-soft);
  }

  &__title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
  }

  &__hint {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
}
</style>
