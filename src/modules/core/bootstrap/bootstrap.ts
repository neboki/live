import { createPinia } from 'pinia';
import { createApp, type Component } from 'vue';
import { listenForInstallPrompt } from '@/shared/device';
import { logError } from '@/shared/errors';
import { i18n, syncDocumentLang } from '@/shared/i18n';
import { applyBrand, loadBrand } from '@/shared/brand/brand';
import { applyTheme, loadTheme } from '@/shared/theme/theme';
import '@/shared/styles/global.scss';

/** Mounts a page root with the shared plugins and the global error logging. */
export function bootstrap(root: Component): void {
  const app = createApp(root);

  app.config.errorHandler = (err, _instance, info) => {
    logError(`Vue error (${info})`, err);
  };

  // Last line of defence: anything that escapes a try/catch still ends up in the log
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    logError('Unhandled promise rejection', reason);
  });
  window.addEventListener('error', (event: ErrorEvent) => {
    const cause: unknown = event.error;
    logError('Uncaught error', cause ?? event.message);
  });

  // Before mounting: Chrome fires its install prompt early, and only once
  listenForInstallPrompt();
  syncDocumentLang();
  applyTheme(loadTheme());
  applyBrand(loadBrand());
  app.use(createPinia()).use(i18n).mount('#app');
}
