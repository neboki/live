import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { PRIVACY_PATH } from '@/shared/links';

/** Whether the address bar points at the privacy page */
function atPrivacy(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === PRIVACY_PATH;
}

/**
 * Pages of the app that are not a session: the settings and the privacy page. A live
 * session or an open conversation takes the main area before them.
 *
 * The privacy page has its own address (/privacy), so it can be linked from outside the
 * app (stores, emails) and the browser's back button leaves it.
 */
export const useAppPage = defineStore('appPage', () => {
  const settingsOpen = ref(false);
  const privacyOpen = ref(atPrivacy());
  /** The page of every conversation kept in the account. One opened from it shows on top;
   * closing that one comes back here. */
  const conversationsOpen = ref(false);

  watch(privacyOpen, (open) => {
    if (typeof window === 'undefined' || open === atPrivacy()) return;
    try {
      const target = open ? PRIVACY_PATH : import.meta.env.BASE_URL;
      window.history.pushState(window.history.state, '', target);
    } catch (err) {
      // Some embedded browsers refuse history changes: the page still opens, only the
      // address stays as it was
      console.warn('[Neboki Live] Could not update the address for the privacy page', err);
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      privacyOpen.value = atPrivacy();
    });
  }

  /** Shows the privacy page in place of the settings */
  function openPrivacy(): void {
    settingsOpen.value = false;
    conversationsOpen.value = false;
    privacyOpen.value = true;
  }

  return { settingsOpen, privacyOpen, conversationsOpen, openPrivacy };
});
