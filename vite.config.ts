import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * On the website (`vite build --mode web`, Firebase Hosting) the app lives under /app/,
 * with the landing page (vite.landing.config.ts) at the root. Everywhere else it is served
 * from the root: development, the end-to-end tests and the mobile app
 * (`vite build --mode mobile`, see capacitor.config.ts).
 */
const WEB_MODE = 'web';

export default defineConfig(({ mode }) => ({
  base: mode === WEB_MODE ? '/app/' : '/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: mode === WEB_MODE ? { outDir: 'dist/app' } : {},
}));
