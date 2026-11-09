import type { CapacitorConfig } from '@capacitor/cli';

// The Android (and later iOS) app is the same web app, built with `pnpm build:mobile`
// (served from the root, not /live/) and copied into the native project by `cap sync`.
// Debug builds can be inspected from chrome://inspect; release builds cannot.
const config: CapacitorConfig = {
  appId: 'com.neboki.live',
  appName: 'Neboki Live',
  webDir: 'dist',
};

export default config;
