import { expect, type Page, test } from '@playwright/test';

// Only the phone project runs these (playwright.config.ts): they pretend to be a phone browser

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');

/** A phone browser: no share dialog, no floating window; a tone stands in for the mic */
async function pretendPhone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (MediaDevices.prototype as Partial<MediaDevices>).getDisplayMedia;
    delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const out = ctx.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      Object.assign(window, { fakeMicContext: ctx });
      return out.stream;
    };
  });
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, () => undefined);
}

test('a phone listens with one tap and shows big, labelled controls', async ({ page }) => {
  await pretendPhone(page);
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.home__mode--main').click();

  const live = page.locator('.mlive');
  await expect(live).toBeVisible();
  const stop = live.getByRole('button', { name: /Stop|Parar/ });
  await expect(stop).toBeVisible();
  // Thumb-sized
  expect((await stop.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  await stop.click();
  await expect(page.locator('.home')).toBeVisible();
});

test('a conversation splits the screen, the top half turned to the other person', async ({
  page,
}) => {
  await pretendPhone(page);
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.home__mode').nth(1).click();
  await page.locator('#home-partner').selectOption('fr');
  await page.locator('.home__ask .lg-btn--primary').click();

  await expect(page.locator('.talk__half')).toHaveCount(2);
  const them = page.locator('.talk__half--them');
  await expect(them).toHaveAttribute('lang', 'fr');
  expect(await them.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  // The other person's button names their language in it
  await expect(them.locator('.talk__receive')).toContainText('Français');
});

test('the app can be installed: the manifest lists icons that load', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href ?? '', page.url()).href;
  const manifest = (await (await request.get(manifestUrl)).json()) as {
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok(), icon.src).toBe(true);
  }
});

test('the language list on the phone home stays on screen', async ({ page }) => {
  await pretendPhone(page);
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);

  await page.locator('.home .lang__trigger').click();
  const list = page.locator('.home .lang__list');
  await expect(list).toBeVisible();
  // Measure once the opening animation has settled
  await expect(list).not.toHaveClass(/pop-enter/);
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  const box = await list.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? Infinity)).toBeLessThanOrEqual(width);
  // Nothing pushes the page sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
});
