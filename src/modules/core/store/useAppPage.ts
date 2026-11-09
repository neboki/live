import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Pages of the app that are not a session: for now only the settings page. A live
 * session or an open conversation takes the main area before it.
 */
export const useAppPage = defineStore('appPage', () => {
  const settingsOpen = ref(false);
  return { settingsOpen };
});
