import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The landing page (landing/), built into the root of the website after the app
 * (`pnpm build:web`). A plain page: no framework, no requests besides its own files.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./landing', import.meta.url)),
  base: '/',
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    // The app is already in dist/app
    emptyOutDir: false,
    assetsDir: 'landing-assets',
  },
});
