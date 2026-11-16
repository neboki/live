import { expect, test, type Locator, type Page } from '@playwright/test';

// Critical flows 1, 2 and 3 across every choice a user can make before a session: what is
// heard (a shared tab or the microphone), where the captions go (the floating window or
// the page) and whether the tab's picture is held back in step with them. Whatever the
// combination, the captions show in one place only, and Stop ends the session.

// Assertions match the English copy
test.use({ locale: 'en-US' });

/** Shaped like an OpenAI key, built at runtime so no key-like text sits in the repo */
const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');

type Source = 'tab' | 'mic';
type Placement = 'floating' | 'page';

interface Choice {
  source: Source;
  placement: Placement;
  synced: boolean;
  /** Where the captions must show: the only place they may */
  shows: 'window' | 'bar' | 'player' | 'synced';
}

const CHOICES: readonly Choice[] = [
  { source: 'tab', placement: 'floating', synced: false, shows: 'window' },
  { source: 'tab', placement: 'floating', synced: true, shows: 'window' },
  { source: 'tab', placement: 'page', synced: false, shows: 'player' },
  { source: 'tab', placement: 'page', synced: true, shows: 'synced' },
  { source: 'mic', placement: 'floating', synced: false, shows: 'window' },
  { source: 'mic', placement: 'floating', synced: true, shows: 'window' },
  { source: 'mic', placement: 'page', synced: false, shows: 'bar' },
  // No picture to hold back: the option changes nothing
  { source: 'mic', placement: 'page', synced: true, shows: 'bar' },
];

declare global {
  interface Window {
    fakeVoiceContext?: AudioContext;
  }
}

/**
 * Replaces the share dialog and the microphone with a voice that says a sentence of
 * 2.5 s, stops for 0.7 s, and so on; the shared tab also has a picture that keeps moving
 */
async function fakeVoice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voice = (): MediaStream => {
      const ctx = new AudioContext();
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      const out = ctx.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      let speaking = true;
      const talk = (): void => {
        gain.gain.value = speaking ? 1 : 0;
        setTimeout(talk, speaking ? 2500 : 700);
        speaking = !speaking;
      };
      talk();
      // Keep the context reachable so it isn't garbage-collected mid-test
      window.fakeVoiceContext = ctx;
      return out.stream;
    };
    navigator.mediaDevices.getUserMedia = async () => voice();
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const paint = canvas.getContext('2d');
      let frame = 0;
      setInterval(() => {
        if (!paint) return;
        paint.fillStyle = `hsl(${frame++ % 360} 60% 35%)`;
        paint.fillRect(0, 0, canvas.width, canvas.height);
      }, 33);
      const video = canvas.captureStream(30).getVideoTracks();
      for (const track of video) {
        const settings = track.getSettings();
        track.getSettings = () => ({ ...settings, displaySurface: 'browser' });
      }
      return new MediaStream([...voice().getAudioTracks(), ...video]);
    };
  });
}

/** Stands in for OpenAI: every sentence is transcribed and translated */
async function fakeOpenAi(page: Page): Promise<void> {
  await page.route('https://api.openai.com/v1/models', (route) =>
    route.fulfill({ status: 200, json: { data: [] } }),
  );
  let translated = 0;
  await page.route('https://api.openai.com/v1/chat/completions', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: {"choices":[{"delta":{"content":"Frase ${++translated}"}}]}\n\ndata: [DONE]\n\n`,
    }),
  );
  await page.routeWebSocket(/api\.openai\.com\/v1\/realtime/, (ws) => {
    let item = 0;
    ws.onMessage((raw) => {
      const event = JSON.parse(String(raw)) as { type: string };
      if (event.type !== 'input_audio_buffer.commit') return;
      const id = `item_${++item}`;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: id }));
      ws.send(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: id,
          transcript: `Sentence ${item}`,
        }),
      );
    });
  });
}

/** Every place in the page where a caption can show */
function pagePlaces(page: Page): Record<'bar' | 'player' | 'synced', Locator> {
  return {
    bar: page.locator('.live .lines__translation'),
    player: page.locator('.live .live-player__line'),
    synced: page.locator('.live .synced-tab__line'),
  };
}

for (const choice of CHOICES) {
  const name = `${choice.source}, captions in the ${choice.placement}, picture ${
    choice.synced ? 'in step' : 'live'
  }`;

  test(`${name}: the captions show in one place and Stop ends the session`, async ({ page }) => {
    test.setTimeout(90_000);
    await fakeVoice(page);
    await fakeOpenAi(page);
    await page.addInitScript(
      ([source, placement, synced]) => {
        localStorage.setItem('neboki-live:audio-source', source);
        localStorage.setItem(
          'neboki-live:overlay-prefs',
          JSON.stringify({ placement, syncPicture: synced === 'yes' }),
        );
      },
      [choice.source, choice.placement, choice.synced ? 'yes' : 'no'],
    );
    await page.goto('./');
    await page.locator('#lg-api-key').fill(VALID_KEY);
    const opened =
      choice.placement === 'floating' ? page.context().waitForEvent('page') : Promise.resolve(null);
    await page.locator('.start__cta').click();
    const floating = await opened;
    await expect(page.locator('.live')).toBeVisible();

    const places = pagePlaces(page);
    if (floating) {
      await expect(floating.locator('.lines__translation').first()).toContainText('Frase', {
        timeout: 30_000,
      });
      // Nowhere in the page: no second copy, and no picture playing behind the window's
      for (const place of Object.values(places)) await expect(place).toHaveCount(0);
      await expect(page.locator('.live video')).toHaveCount(0);
      await expect(page.locator('.live__stage')).toBeVisible();
    } else {
      const here = choice.shows as keyof typeof places;
      // The synced picture shows a caption once it reaches it, some seconds later
      await expect(places[here].first()).toContainText('Frase', { timeout: 45_000 });
      for (const [key, place] of Object.entries(places)) {
        if (key !== here) await expect(place).toHaveCount(0);
      }
      // No floating window was opened behind the user's back
      expect(page.context().pages()).toHaveLength(1);
    }

    // A player keeps its controls away until the pointer moves over the picture
    if (choice.shows === 'player') await page.locator('.live-player').hover();
    await page.locator('.live').getByRole('button', { name: 'Stop', exact: true }).first().click();
    await expect(page.locator('.live')).toHaveCount(0);
    if (floating) await expect.poll(() => floating.isClosed()).toBe(true);
    // What was said is kept: the conversation's own page, with its lines
    await expect(page.locator('.session')).toBeVisible();
  });
}
