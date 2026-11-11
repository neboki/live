import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';

// Assertions match the English copy
test.use({ locale: 'en-US' });

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');
const HEARD = 'How are you?';
const TRANSLATED = '¿Qué tal estás?';
const STREAMED = `data: {"choices":[{"delta":{"content":"${TRANSLATED}"}}]}\n\ndata: [DONE]\n\n`;

type ShareMode = 'audio' | 'silent' | 'cancel' | 'tab';
type ChatReply = (route: Route) => Promise<void>;

interface FakeOpenAi {
  keyStatus?: number;
  chat?: ChatReply;
  /** Sends this server error code on the transcription socket once audio arrives */
  socketError?: string;
  /** Closes the transcription socket instead of answering */
  socketClosed?: boolean;
}

declare global {
  interface Window {
    stopFakeTone?: () => void;
    endFakeShare?: () => void;
  }
}

/**
 * Replaces the share dialog. 'audio' plays a tone until the test calls
 * window.stopFakeTone(); window.endFakeShare() acts as the user ending the share.
 */
async function fakeScreenShare(page: Page, mode: ShareMode): Promise<void> {
  await page.addInitScript((shareMode) => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      if (shareMode === 'cancel') throw new DOMException('Permission denied', 'NotAllowedError');
      const canvas = document.createElement('canvas');
      const video = canvas.captureStream().getVideoTracks();
      if (shareMode === 'tab') {
        // A browser tab, as Chrome reports it, with something on its picture
        const paint = canvas.getContext('2d');
        setInterval(() => {
          if (!paint) return;
          paint.fillStyle = '#2a6';
          paint.fillRect(0, 0, canvas.width, canvas.height);
          paint.fillStyle = '#fff';
          paint.fillText(new Date().toISOString(), 10, 20);
        }, 100);
        for (const track of video) {
          const settings = track.getSettings();
          track.getSettings = () => ({ ...settings, displaySurface: 'browser' });
        }
      }
      if (shareMode === 'silent') return new MediaStream(video);
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const out = ctx.createMediaStreamDestination();
      tone.connect(out);
      tone.start();
      const [audio] = out.stream.getAudioTracks();
      // Keep the context reachable so it isn't garbage-collected mid-test
      Object.assign(window, {
        fakeShareContext: ctx,
        stopFakeTone: () => tone.stop(),
        endFakeShare: () => audio?.dispatchEvent(new Event('ended')),
      });
      return new MediaStream([...out.stream.getAudioTracks(), ...video]);
    };
  }, mode);
}

const streamTranslation: ChatReply = (route) =>
  route.fulfill({ contentType: 'text/event-stream', body: STREAMED });

function failChat(status: number, code: string): ChatReply {
  return (route) =>
    route.fulfill({ status, json: { error: { message: 'fake', type: code, code } } });
}

/**
 * Stands in for OpenAI: key check, chat completions and the transcription socket.
 * Playwright's HTTP routing leaves the floating window's own requests (its stylesheet)
 * hanging, so with it the window shows unstyled; a real browser is not affected.
 */
async function fakeOpenAi(page: Page, fake: FakeOpenAi = {}): Promise<void> {
  const keyStatus = fake.keyStatus ?? 200;
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ status: keyStatus, json: keyStatus === 200 ? { data: [] } : { error: {} } }),
  );
  await page.route('https://api.openai.com/v1/chat/completions', fake.chat ?? streamTranslation);
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, (ws) => {
    if (fake.socketClosed) {
      ws.close({ code: 1011, reason: 'fake failure' });
      return;
    }
    let item = 0;
    let errorSent = false;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw)) as { type: string };
      // Fail once audio flows, i.e. while the session is already live
      if (fake.socketError && !errorSent && event.type === 'input_audio_buffer.append') {
        errorSent = true;
        const code = fake.socketError;
        ws.send(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', code } }));
      }
      if (event.type !== 'input_audio_buffer.commit') return;
      const id = `item_${++item}`;
      ws.send(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: id,
          delta: 'How',
        }),
      );
      ws.send(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: id,
          transcript: HEARD,
        }),
      );
    });
  });
}

/**
 * Clicks Start and returns the floating window it opens (Document Picture-in-Picture,
 * which Playwright sees as one more page): the live captions only ever show there.
 */
async function startSession(page: Page): Promise<Page> {
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  const floating = page.context().waitForEvent('page');
  await page.locator('.start__cta').click();
  return floating;
}

/** Waits until the bar in the floating window hears the tone, then lets the sentence end. */
async function speakOneSentence(page: Page, floating: Page): Promise<void> {
  await expect
    .poll(() =>
      floating
        .locator('.bar')
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--level'))),
    )
    .toBeGreaterThan(0.3);
  await page.evaluate(() => window.stopFakeTone?.());
}

/**
 * Clicks Export in the bar's menu (opening it if needed) and returns the file.
 * The bar may be in the floating window; the download always comes from the page.
 */
async function exportFromMenu(
  page: Page,
  scope: string,
  bar: Page = page,
): Promise<{ name: string; text: string }> {
  const menuButton = bar.locator(`${scope} [aria-controls="lg-menu"]`);
  if ((await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click();
  const download = page.waitForEvent('download');
  await bar
    .locator(`${scope} .menu`)
    .getByRole('button', { name: /export/i })
    .click();
  const file = await download;
  const path = await file.path();
  return { name: file.suggestedFilename(), text: await readFile(path, 'utf8') };
}

test('transcribes the shared audio and shows the translation', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);

  await expect(page.locator('.live')).toBeVisible();
  await expect(page.locator('.live .bar')).toHaveCount(0);
  await speakOneSentence(page, floating);
  await expect(floating.locator('.lines__translation')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });

  // A conversation with lines ends on its own page, ready to download
  await page.locator('.live__stop').click();
  await expect(page.locator('.session')).toBeVisible();
  await expect.poll(() => floating.isClosed()).toBe(true);
});

test('explains a rejected key', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page, { keyStatus: 401 });
  const floating = await startSession(page);

  await expect(page.getByRole('alert')).toContainText(/OpenAI/);
  await expect(page.locator('.live')).toHaveCount(0);
  await expect.poll(() => floating.isClosed()).toBe(true);
});

test('explains what to do when no audio was shared', async ({ page }) => {
  await fakeScreenShare(page, 'silent');
  await fakeOpenAi(page);
  await startSession(page);

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.live')).toHaveCount(0);
});

test('explains a cancelled share dialog', async ({ page }) => {
  await fakeScreenShare(page, 'cancel');
  await fakeOpenAi(page);
  await startSession(page);

  await expect(page.getByRole('alert')).toContainText(/cancel/i);
  await expect(page.locator('.live')).toHaveCount(0);
});

test('a rate limit shows a notice and the session goes on', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page, { chat: failChat(429, 'rate_limit_exceeded') });
  const floating = await startSession(page);

  await speakOneSentence(page, floating);
  await expect(floating.locator('.bar').getByRole('status')).toContainText(/limiting/i, {
    timeout: 10_000,
  });
  await expect(floating.locator('.bar').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.live__stop')).toBeVisible();
});

test('running out of credit stops with an alert inside the bar', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page, { chat: failChat(429, 'insufficient_quota') });
  const floating = await startSession(page);

  await speakOneSentence(page, floating);
  const alert = floating.locator('.bar').getByRole('alert');
  await expect(alert).toContainText(/credit/i, { timeout: 10_000 });

  await alert.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.start')).toBeVisible();
  await expect(page.locator('.start__notice')).toContainText(/credit/i);
  await expect.poll(() => floating.isClosed()).toBe(true);
});

test('a rejected key on the transcription socket shows in the bar', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page, { socketError: 'invalid_api_key' });
  const floating = await startSession(page);

  await expect(floating.locator('.bar').getByRole('alert')).toContainText(/rejected the key/i, {
    timeout: 10_000,
  });
  await expect(floating.locator('.bar').getByRole('button', { name: 'Restart' })).toBeVisible();
});

test('a transcription socket that closes at once fails to connect', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page, { socketClosed: true });
  await startSession(page);

  await expect(page.getByRole('alert')).toContainText("Couldn't connect to OpenAI", {
    timeout: 15_000,
  });
});

test('ending the share mid-session explains why it stopped', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);

  await expect(page.locator('.live__stop')).toBeVisible();
  await page.evaluate(() => window.endFakeShare?.());
  await expect(floating.locator('.bar').getByRole('alert')).toContainText(/stopped/i);
});

test('exports the session as Markdown', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);

  await speakOneSentence(page, floating);
  await expect(floating.locator('.lines__translation')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });
  const file = await exportFromMenu(page, '.bar', floating);

  expect(file.name).toMatch(/^neboki-live-\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  expect(file.text).toContain(HEARD);
  expect(file.text).toContain(TRANSLATED);
});

test('stopping mid-sentence still records the last translation', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  await startSession(page);

  // The tone never stops, so only Stop can close the sentence
  await expect(page.locator('.live__stop')).toBeVisible();
  await page.waitForTimeout(1500);
  // The sentence closes on Stop and its translation lands after the session has ended, so the
  // app stays on the start screen and the conversation is opened from the sidebar
  await page.locator('.live__stop').click();
  await expect(page.locator('.start')).toBeVisible();
  await page.getByRole('button', { name: /last conversation/i }).click();

  const download = page.waitForEvent('download');
  await page.locator('.session').getByRole('button', { name: /\.md/ }).click();
  const file = await (await download).path();
  expect(await readFile(file, 'utf8')).toContain(TRANSLATED);
});

test('the floating window stops the session with its own Stop button', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);

  await expect(page.locator('.live__stop')).toBeVisible();
  await floating.getByRole('button', { name: 'Stop' }).click();

  await expect(page.locator('.start')).toBeVisible();
  await expect.poll(() => floating.isClosed()).toBe(true);
});

test('closing the floating window moves the captions to the page, and they can float again', async ({
  page,
}) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);
  await expect(page.locator('.live__stop')).toBeVisible();

  await floating.close();
  const bar = page.locator('.live .bar');
  await expect(bar).toBeVisible();
  // With the bar in the page, Stop is its last button, not the header's
  await expect(bar.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('.live__stop')).toHaveCount(0);
  await speakOneSentence(page, page);
  await expect(page.locator('.live .lines__translation')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });

  const reopened = page.context().waitForEvent('page');
  await bar.getByRole('button', { name: 'Float above other windows' }).click();
  const again = await reopened;
  await expect(again.locator('.bar')).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test('shows the captions in the app when that is the chosen place, and floats them on request', async ({
  page,
}) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  await page.goto('./');
  await page.locator('.lg-choice__option', { hasText: 'In the app' }).click();
  await page.locator('#lg-api-key').fill(VALID_KEY);
  let opened = false;
  page.context().once('page', () => (opened = true));
  await page.locator('.start__cta').click();

  const bar = page.locator('.live .bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Stop' })).toBeVisible();
  expect(opened).toBe(false);
  await speakOneSentence(page, page);
  await expect(page.locator('.live .lines__translation')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });

  // Ctrl+Shift+Space hides the bar and shows it again; the session goes on
  await page.keyboard.press('Control+Shift+Space');
  await expect(bar).toBeHidden();
  await page.keyboard.press('Control+Shift+Space');
  await expect(bar).toBeVisible();

  // Float moves the captions to the window; Back to the page brings them back
  const floating = page.context().waitForEvent('page');
  await bar.getByRole('button', { name: 'Float above other windows' }).click();
  const win = await floating;
  await expect(win.locator('.bar')).toBeVisible();
  await expect(bar).toHaveCount(0);
  await win.getByRole('button', { name: 'Back to the page' }).click();
  await expect(bar).toBeVisible();
  await expect.poll(() => win.isClosed()).toBe(true);
});

test('in the app, a shared tab plays live as a player with the captions on it', async ({
  page,
}) => {
  await fakeScreenShare(page, 'tab');
  await fakeOpenAi(page);
  await page.goto('./');
  await page.locator('.lg-choice__option', { hasText: 'In the app' }).click();
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.start__cta').click();

  const player = page.locator('.live .live-player');
  const picture = player.locator('video');
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((video: HTMLVideoElement) => video.srcObject !== null))
    .toBe(true);
  // No caption bar under it: the captions are on the picture
  await expect(page.locator('.live .bar')).toHaveCount(0);
  // No bar to read the level from: the tone plays a moment, then the sentence ends
  await page.waitForTimeout(1500);
  const box = await picture.boundingBox();
  await page.evaluate(() => window.stopFakeTone?.());
  await expect(player.locator('.live-player__line--current')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });
  // The words never move the picture
  expect(await picture.boundingBox()).toEqual(box);
  await player.hover();
  await page.screenshot({ path: 'test-results/live-picture.png' });

  // Text size from the player's own controls
  await player.getByRole('button', { name: /Larger/ }).click();
  await expect(player.locator('.live-player__lines')).toHaveAttribute('style', /--scale: 1.1/);

  // The quality changes mid-session, from the options; the session goes on
  await player.getByRole('button', { name: 'Options' }).click();
  const premium = page.getByRole('radio', { name: /Premium/ });
  await premium.click();
  await expect(premium).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Low cost/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.screenshot({ path: 'test-results/live-quality.png' });
  await expect(picture).toBeVisible();

  await player.hover();
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(picture).toHaveCount(0);
});

test('restarting from the error in the floating window starts again', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  await fakeOpenAi(page);
  const floating = await startSession(page);
  await expect(page.locator('.live__stop')).toBeVisible();
  await page.evaluate(() => window.endFakeShare?.());
  await expect(floating.locator('.bar').getByRole('alert')).toContainText(/stopped/i);

  await floating.locator('.bar').getByRole('button', { name: 'Restart' }).click();

  await expect(floating.locator('.bar').getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.live__stop')).toBeVisible();
  await speakOneSentence(page, floating);
  await expect(floating.locator('.lines__translation')).toHaveText(TRANSLATED, {
    timeout: 10_000,
  });
});

test('the floating window gets the app styles and fonts', async ({ page }) => {
  await fakeScreenShare(page, 'audio');
  // No HTTP routing here (see fakeOpenAi): the key check is answered by a fake fetch
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input instanceof Request ? input.url : input).endsWith('/v1/models')
        ? Promise.resolve(Response.json({ data: [] }))
        : realFetch(input, init);
  });
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, () => undefined);
  const floating = await startSession(page);

  await expect(page.locator('.live__stop')).toBeVisible();
  const bar = floating.locator('.bar');
  await expect(bar).toHaveCSS('display', 'flex');
  await expect(bar).toHaveCSS('font-family', /Geist/);
  await expect.poll(() => floating.evaluate(() => document.fonts.check('16px Geist'))).toBe(true);
  // The bar fills the whole window
  const size = await floating.evaluate(() => [window.innerWidth, window.innerHeight]);
  const box = await bar.boundingBox();
  expect([Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)]).toEqual(size);
});
