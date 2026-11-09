import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const PREVIEW = 'node node_modules/vite/bin/vite.js preview --port 4173 --strictPort';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // In CI, 'list' also prints each test as it ends, so a slow run shows where it is
  reporter: isCI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173/', trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      // Locally, use the installed Edge (corporate proxies often block Playwright's browser download)
      use: {
        ...devices['Desktop Chrome'],
        channel: isCI ? undefined : 'msedge',
        // Audio tests create AudioContexts without a real user gesture
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    {
      // The phone layout (drawer, stacked start screen): the accessibility scan and phone checks
      name: 'mobile',
      testMatch: /(a11y|mobile)\.spec\.ts/,
      use: { ...devices['Pixel 7'], channel: isCI ? undefined : 'msedge' },
    },
  ],
  webServer: {
    // CI builds in an earlier step, so only serve there. Vite is started directly, not
    // through pnpm: Playwright stops the process it started, and a vite left behind by a
    // pnpm wrapper kept the run from ever finishing.
    command: isCI ? PREVIEW : `pnpm build && ${PREVIEW}`,
    url: 'http://localhost:4173/',
    reuseExistingServer: !isCI,
  },
});
