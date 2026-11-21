import { expect, test, type Page } from '@playwright/test';

// Runs against the published site right after a deploy: if the new version does not start
// or show captions, the deploy is marked failed and the previous version can go back
// (/volver). OpenAI is faked here, so it costs nothing and needs no key.

test.use({ locale: 'en-US' });

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const FAKE_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');
const HEARD = 'How are you?';
const TRANSLATED = '¿Qué tal estás?';

/** Replaces the share dialog with a tab that plays a tone until window.stopFakeTone(). */
async function fakeTabWithSound(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const out = ctx.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      Object.assign(window, { fakeShareContext: ctx, stopFakeTone: () => tone.stop() });
      return new MediaStream([
        ...out.stream.getAudioTracks(),
        ...canvas.captureStream().getVideoTracks(),
      ]);
    };
  });
}

/** Stands in for OpenAI: key check, translation and the transcription socket. */
async function fakeOpenAi(page: Page): Promise<void> {
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route('https://api.openai.com/v1/chat/completions', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: {"choices":[{"delta":{"content":"${TRANSLATED}"}}]}\n\ndata: [DONE]\n\n`,
    }),
  );
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, (ws) => {
    let item = 0;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw)) as { type: string };
      if (event.type !== 'input_audio_buffer.commit') return;
      ws.send(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: `item_${++item}`,
          transcript: HEARD,
        }),
      );
    });
  });
}

test('the landing page and the app load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('body')).not.toBeEmpty();

  await page.goto('./');
  await expect(page).toHaveTitle('Neboki Live');
  await expect(page.locator('.start__cta')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a shared tab is transcribed and the translation shows', async ({ page }) => {
  await fakeTabWithSound(page);
  await fakeOpenAi(page);

  await page.goto('./');
  await page.locator('#lg-api-key').fill(FAKE_KEY);
  const floatingOpens = page.context().waitForEvent('page');
  await page.locator('.start__cta').click();
  const floating = await floatingOpens;

  await expect(page.locator('.live')).toBeVisible();
  // Let the bar hear the tone, then end the sentence with silence
  await expect
    .poll(() =>
      floating
        .locator('.bar')
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--level'))),
    )
    .toBeGreaterThan(0.3);
  await page.evaluate(() => (window as { stopFakeTone?: () => void }).stopFakeTone?.());
  await expect(floating.locator('.lines__translation')).toHaveText(TRANSLATED, {
    timeout: 15_000,
  });

  await page.locator('.live__stop').click();
  await expect(page.locator('.session')).toBeVisible();
});
