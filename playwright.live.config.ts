import { defineConfig, devices } from '@playwright/test';

// Checks the published site after each deploy (`pnpm test:live`). OpenAI is faked in the
// test, so it spends nothing. LIVE_URL points it elsewhere, e.g. a local preview.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/live',
  forbidOnly: isCI,
  // The CDN can take a moment to serve the new version everywhere
  retries: 2,
  reporter: isCI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://neboki-live.web.app/app/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Locally, use the installed Edge (corporate proxies often block Playwright's browser download)
        channel: isCI ? undefined : 'msedge',
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
  ],
});
