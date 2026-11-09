import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Served from the domain root: Firebase Hosting and the mobile app (`vite build --mode mobile`,
// see capacitor.config.ts) alike, so the default base (/) fits both.
export default defineConfig(() => ({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}));
