import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Assertions match the English copy
test.use({ locale: 'en-US' });

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');
const OPENAI_ORIGIN = 'https://api.openai.com';
const EXPECTED_CONNECT_SRC = [
  "'self' https://api.openai.com wss://api.openai.com",
  'https://*.openai.azure.com wss://*.openai.azure.com https://*.cognitiveservices.azure.com wss://*.cognitiveservices.azure.com https://*.services.ai.azure.com wss://*.services.ai.azure.com',
].join(' ');

declare global {
  interface Window {
    cspViolations?: string[];
    stopFakeTone?: () => void;
  }
}

interface Watch {
  /** CSP problems seen in any page of the context, the floating window included */
  problems: string[];
  /** Origins of every http(s) request made by any page */
  origins: Set<string>;
}

/** Records CSP violations (events and console messages) and request origins. */
async function watchPolicy(page: Page, context: BrowserContext): Promise<Watch> {
  const watch: Watch = { problems: [], origins: new Set() };
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations?.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  context.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) watch.problems.push(message.text());
  });
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') watch.origins.add(url.origin);
  });
  return watch;
}

async function expectNoViolations(page: Page, watch: Watch): Promise<void> {
  const fromEvents = await page.evaluate(() => window.cspViolations ?? []);
  expect([...fromEvents, ...watch.problems]).toEqual([]);
  const self = new URL(page.url()).origin;
  expect(
    [...watch.origins].filter((origin) => origin !== self && origin !== OPENAI_ORIGIN),
  ).toEqual([]);
}

/** Self-hosted fonts loaded under font-src 'self'. */
async function expectFontsLoaded(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px Geist') && document.fonts.check('16px "Geist Mono"');
      }),
    )
    .toBe(true);
}

async function policyOf(page: Page, path: string): Promise<Map<string, string>> {
  await page.goto(path);

  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  const directives = new Map(
    (policy ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...values] = part.split(/\s+/);
        return [name, values.join(' ')] as const;
      }),
  );

  return directives;
}

test('the app policy is the documented one', async ({ page }) => {
  const directives = await policyOf(page, './');

  expect(directives.get('connect-src')).toBe(EXPECTED_CONNECT_SRC);
  expect(directives.get('default-src')).toBe("'self'");
  expect(directives.get('font-src')).toBe("'self'");
  expect(directives.get('form-action')).toBe("'none'");
});

test('the start screen loads without CSP violations or third parties', async ({
  page,
  context,
}) => {
  const watch = await watchPolicy(page, context);
  await page.goto('./');

  await expect(page.locator('.start')).toBeVisible();
  await expectFontsLoaded(page);
  await expectNoViolations(page, watch);
});

test('a live session (worklet, OpenAI calls) runs without CSP violations', async ({
  page,
  context,
}) => {
  const watch = await watchPolicy(page, context);
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const out = ctx.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      Object.assign(window, { fakeShareContext: ctx, stopFakeTone: () => tone.stop() });
      const video = document.createElement('canvas').captureStream().getVideoTracks();
      return new MediaStream([...out.stream.getAudioTracks(), ...video]);
    };
  });
  // Fakes only: no request ever reaches OpenAI. CSP is checked before routing, so a blocked
  // origin would still be reported.
  await page.route(`${OPENAI_ORIGIN}/v1/models`, (route) => route.fulfill({ json: { data: [] } }));
  await page.route(`${OPENAI_ORIGIN}/v1/chat/completions`, (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: 'data: [DONE]\n\n' }),
  );
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, () => undefined);

  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  const floating = context.waitForEvent('page');
  await page.locator('.start__cta').click();
  const pip = await floating;

  await expect(page.locator('.live')).toBeVisible();
  await expect.poll(() => pip.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
  // The level only moves once the AudioWorklet module has loaded and runs
  await expect
    .poll(() =>
      pip
        .locator('.bar')
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--level'))),
    )
    .toBeGreaterThan(0.3);
  await page.evaluate(() => window.stopFakeTone?.());

  await expectNoViolations(page, watch);
  await page.locator('.live__stop').click();
});
