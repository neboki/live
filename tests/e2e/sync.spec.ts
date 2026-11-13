import { expect, test, type Page } from '@playwright/test';

// Critical flow 2, with the picture in step with the captions: the shared tab plays in
// the page some seconds behind, through the real recorder and the real buffer of the
// browser, and must never stop while people speak, however late a translation is.

// Assertions match the English copy
test.use({ locale: 'en-US' });

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');
/** Seconds the picture is watched once it plays */
const WATCHED_SECONDS = 22;
/** How long each translation takes, in turn: quick ones and some far slower than usual */
const TRANSLATION_MS = [300, 2600, 500, 3200, 400, 1800];

interface Sample {
  /** Milliseconds since the picture began to play */
  at: number;
  /** The player's own time, in seconds */
  time: number;
}

declare global {
  interface Window {
    fakeShareContext?: AudioContext;
    syncProbe?: { samples: Sample[]; pauses: number; started: number };
  }
}

/**
 * Replaces the share dialog with a browser tab as Chrome reports it: a picture that
 * keeps painting, and a voice that says a sentence of 2.5 s, stops for 0.7 s, and so on
 */
async function fakeTalkingTab(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const paint = canvas.getContext('2d');
      let frame = 0;
      setInterval(() => {
        if (!paint) return;
        paint.fillStyle = `hsl(${frame % 360} 60% 35%)`;
        paint.fillRect(0, 0, canvas.width, canvas.height);
        paint.fillStyle = '#fff';
        paint.font = '48px sans-serif';
        paint.fillText(String(frame++), 40 + (frame % 300), 180);
      }, 33);
      const video = canvas.captureStream(30).getVideoTracks();
      for (const track of video) {
        const settings = track.getSettings();
        track.getSettings = () => ({ ...settings, displaySurface: 'browser' });
      }
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const voice = ctx.createGain();
      const out = ctx.createMediaStreamDestination();
      tone.connect(voice).connect(out);
      tone.start();
      let speaking = true;
      const talk = (): void => {
        voice.gain.value = speaking ? 1 : 0;
        setTimeout(talk, speaking ? 2500 : 700);
        speaking = !speaking;
      };
      talk();
      // Keep the context reachable so it isn't garbage-collected mid-test
      window.fakeShareContext = ctx;
      return new MediaStream([...out.stream.getAudioTracks(), ...video]);
    };
  });
}

/** Stands in for OpenAI: every sentence is transcribed, and translated after a while */
async function fakeSlowOpenAi(page: Page): Promise<void> {
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ status: 200, json: { data: [] } }),
  );
  let translated = 0;
  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    const turn = translated++;
    await new Promise((resolve) =>
      setTimeout(resolve, TRANSLATION_MS[turn % TRANSLATION_MS.length]),
    );
    const body = `data: {"choices":[{"delta":{"content":"Frase ${turn + 1}"}}]}\n\ndata: [DONE]\n\n`;
    await route.fulfill({ contentType: 'text/event-stream', body }).catch(() => undefined);
  });
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, (ws) => {
    let item = 0;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw)) as { type: string };
      if (event.type !== 'input_audio_buffer.commit') return;
      const id = `item_${++item}`;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: id }));
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: id,
            transcript: `Sentence ${item}`,
          }),
        );
      }, 700);
    });
  });
}

/** Starts a session with the captions in the page and the picture in step with them */
async function startSynced(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'neboki-live:overlay-prefs',
      JSON.stringify({ syncPicture: true, placement: 'page' }),
    );
  });
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await page.locator('.start__cta').click();
}

/**
 * From the moment the picture plays, notes the player's time ten times a second and
 * every pause of it, in the page's own clock
 */
async function watchPicture(page: Page): Promise<void> {
  await page.locator('.synced-tab__frame video').evaluate((video: HTMLVideoElement) => {
    const probe = { samples: [] as Sample[], pauses: 0, started: performance.now() };
    window.syncProbe = probe;
    video.addEventListener('pause', () => probe.pauses++);
    setInterval(() => {
      probe.samples.push({ at: performance.now() - probe.started, time: video.currentTime });
    }, 100);
  });
}

/** The longest stretch, in milliseconds, in which the player's time did not move */
function longestFreeze(samples: readonly Sample[]): number {
  let longest = 0;
  let since = samples[0];
  for (const sample of samples) {
    if (since && sample.time > since.time) since = sample;
    else if (since) longest = Math.max(longest, sample.at - since.at);
  }
  return longest;
}

test('the synced picture never stops while people speak, even with slow translations', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await fakeTalkingTab(page);
  await fakeSlowOpenAi(page);
  await startSynced(page);

  const player = page.locator('.live .synced-tab');
  const video = player.locator('.synced-tab__frame video');
  await expect(video).toBeAttached();
  // Held back first: the picture shows once that many seconds are buffered
  await expect(player.locator('.synced-tab__notice')).toBeVisible();
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), {
      timeout: 20_000,
    })
    .toBe(true);
  await watchPicture(page);

  // Captions land on the picture meanwhile
  await expect(player.locator('.synced-tab__line--current')).toContainText('Frase', {
    timeout: 20_000,
  });
  await page.waitForTimeout(WATCHED_SECONDS * 1000);
  await page.screenshot({ path: 'test-results/synced-picture.png' });

  const probe = await page.evaluate(() => window.syncProbe);
  if (!probe) throw new Error('The picture was not watched');
  const { samples, pauses } = probe;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) throw new Error('No samples of the picture');
  const played = last.time - first.time;
  const elapsed = (last.at - first.at) / 1000;

  // Nothing paused it: no wait for a caption, no hold to fit another delay
  expect(pauses).toBe(0);
  // It moved all along, at the speed of the tab or within the 5 % of a glide
  expect(longestFreeze(samples)).toBeLessThan(1000);
  expect(played / elapsed).toBeGreaterThan(0.9);
  expect(played / elapsed).toBeLessThan(1.1);
  // Still the chosen distance behind: it is "live", with no need to catch up
  await expect(player.locator('.synced-tab__live--on')).toBeVisible();
  await expect(player.locator('.synced-tab__catch-up')).toHaveCount(0);
  // And the captions kept coming
  await expect(player.locator('.synced-tab__line--current')).toContainText('Frase');
});

test('the menu offers one switch for the synced picture, with nothing to wait for', async ({
  page,
}) => {
  await fakeTalkingTab(page);
  await fakeSlowOpenAi(page);
  await startSynced(page);
  await expect(page.locator('.live .synced-tab')).toBeVisible();

  await page.locator('.live__panel-toggle').click();
  await expect(page.getByText('Picture in step with the captions')).toBeVisible();
  await expect(page.getByText('Wait for the captions')).toHaveCount(0);
});
