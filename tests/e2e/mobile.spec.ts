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

  // Full screen: the app bar goes and the halves take the whole height
  await page.getByRole('button', { name: /Full screen|Pantalla completa/ }).click();
  await expect(page.locator('.shell__mobile')).toHaveCount(0);
  const height = await page.evaluate(() => window.innerHeight);
  expect((await page.locator('.talk').boundingBox())?.height ?? 0).toBeGreaterThan(height - 2);
  await page.screenshot({ path: 'test-results/talk-fullscreen.png' });
  await page.getByRole('button', { name: /Leave full screen|Salir de pantalla completa/ }).click();
  await expect(page.locator('.shell__mobile')).toBeVisible();
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

/** What each person says, in turn; the transcriber names no language, as some models don't */
const TALK = [
  { said: 'Hello, where is the train station?', into: '¿Dónde está la estación de tren?' },
  { said: 'Está a dos calles de aquí.', into: "It's two streets from here." },
  // Could be either language: the translator is asked to name it
  { said: 'Taxi', into: '[en] Un taxi' },
];

test('a conversation puts each sentence in the right half when no language is reported', async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (MediaDevices.prototype as Partial<MediaDevices>).getDisplayMedia;
    delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
    // Someone speaks for a moment, then pauses, over and over: one sentence each time
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      const out = ctx.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      setInterval(() => (gain.gain.value = gain.gain.value ? 0 : 1), 1400);
      Object.assign(window, { fakeMicContext: ctx });
      return out.stream;
    };
  });
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route('https://api.openai.com/v1/chat/completions', (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    const asked = body.messages.at(-1)?.content ?? '';
    const turn = TALK.find((line) => asked.includes(`${line.said}\n</transcript>`));
    const content = JSON.stringify({ choices: [{ delta: { content: turn?.into ?? '' } }] });
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${content}\n\ndata: [DONE]\n\n`,
    });
  });
  let heard = 0;
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, (ws) => {
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw)) as { type: string };
      if (event.type !== 'input_audio_buffer.commit' || heard >= TALK.length) return;
      const id = `item_${++heard}`;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: id }));
      ws.send(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: id,
          transcript: TALK[heard - 1]?.said,
        }),
      );
    });
  });

  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.home__mode').nth(1).click();
  // The user reads English (the browser's language); the other person speaks Spanish
  await page.locator('#home-partner').selectOption('es');
  await page.locator('.home__ask .lg-btn--primary').click();

  const mine = page.locator('.talk__half:not(.talk__half--them) .talk__text');
  const theirs = page.locator('.talk__half--them .talk__text');
  // The user spoke English: the other person reads it in Spanish, the user their own words
  await expect(theirs).toHaveText('¿Dónde está la estación de tren?', { timeout: 15_000 });
  await expect(mine).toHaveText(TALK[0]?.said ?? '');
  // The other person answered in Spanish: the user reads it in English
  await expect(mine).toHaveText("It's two streets from here.", { timeout: 15_000 });
  await expect(theirs).toHaveText('Está a dos calles de aquí.');
  // Nobody could tell from "Taxi": the translator's tag says it was the user's, never shown
  await expect(theirs).toHaveText('Un taxi', { timeout: 15_000 });
  await expect(mine).toHaveText('Taxi');
});

test('the chosen option stands out from the others', async ({ page }) => {
  await pretendPhone(page);
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.shell__burger').click();
  await page.getByRole('button', { name: /Settings|Ajustes/ }).click();

  const providers = page.locator('.key__provider');
  const look = (index: number): Promise<string> =>
    providers.nth(index).evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.backgroundColor}|${style.color}`;
    });
  const [chosen, other] = [await look(0), await look(1)];
  expect(chosen).not.toBe(other);
  // Filled: not transparent, and white text on it
  expect(chosen).toContain('rgb(255, 255, 255)');

  // A chosen card carries a tick, not only a tint
  await page
    .locator('summary')
    .filter({ hasText: /More options|Más opciones/ })
    .click();
  const card = page.locator('.lg-choice__option--on').first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el, '::after').content)).toContain('✓');
});
