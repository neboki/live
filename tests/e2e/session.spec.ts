import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// The page of a finished conversation: its name, its summary beside the transcript, the
// assistant and the downloads. Assertions match the English copy.
test.use({ locale: 'en-US' });

const VALID_KEY = ['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-');
const START = Date.UTC(2026, 10, 12, 9, 0, 0);
const NAME = 'Budget review with Marta';
const MINUTES = 'Decided\n- The budget closes on Friday';

interface Conversation {
  summary: string[];
  glossary: string;
}

/** A session file as the app writes them, with two voices and six sentences */
function sessionFile({ summary, glossary }: Conversation): string {
  const said = [
    ['Shall we start with the budget?', '¿Empezamos por el presupuesto?'],
    ['The plan is to close the budget by Friday.', 'El plan es cerrar el presupuesto el viernes.'],
    ['Marta will send the new figures tomorrow.', 'Marta enviará las cifras nuevas mañana.'],
    ['We still need a supplier for Bilbao.', 'Aún necesitamos un proveedor para Bilbao.'],
    ['I can ask Kestrel for a quote.', 'Puedo pedir un presupuesto a Kestrel.'],
    ['Then the review moves to Monday.', 'Entonces la revisión pasa al lunes.'],
  ];
  return JSON.stringify({
    format: 'neboki-live.session',
    version: 1,
    exportedAt: new Date(START).toISOString(),
    session: {
      startedAt: START,
      endedAt: START + 60_000,
      pair: { from: 'en', to: 'es' },
      lines: said.map(([source, translation], i) => ({
        at: START + (i + 1) * 5000,
        source,
        translation,
        speaker: i % 2,
      })),
      summary,
      glossary,
      usage: [],
    },
  });
}

async function open(page: Page, conversation: Conversation): Promise<void> {
  await page.locator('.shell__input').setInputFiles({
    name: 'meeting.neboki-live.json',
    mimeType: 'application/json',
    buffer: Buffer.from(sessionFile(conversation)),
  });
  await expect(page.locator('.session')).toBeVisible();
}

/** Stands in for OpenAI's chat: a name for the short call, written minutes for the stream */
async function fakeChat(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('https://api.openai.com/v1/chat/completions', (route) => {
    const body = route.request().postDataJSON() as {
      stream?: boolean;
      messages: { content: string }[];
    };
    asked.push(body.messages.at(-1)?.content ?? '');
    if (!body.stream) {
      return route.fulfill({ json: { choices: [{ message: { content: `"${NAME}."` } }] } });
    }
    const chunk = JSON.stringify({ choices: [{ delta: { content: MINUTES } }] });
    return route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${chunk}\n\ndata: [DONE]\n\n`,
    });
  });
  return asked;
}

test('a conversation without summary or key gives the transcript the whole width', async ({
  page,
}) => {
  await page.goto('./');
  await open(page, { summary: [], glossary: '' });

  await expect(page.locator('.session__side')).toHaveCount(0);
  await expect(page.locator('.session__toggle')).toHaveCount(0);
  const transcript = await page.locator('.transcript').boundingBox();
  const content = await page.locator('.session__grid').boundingBox();
  expect(transcript?.width).toBe(content?.width);
});

test('the summary sits to the right, hides, and its terms search the transcript', async ({
  page,
}) => {
  await page.goto('./');
  await open(page, { summary: ['The budget closes on Friday'], glossary: 'Kestrel\nBilbao' });

  const side = page.locator('.session__side');
  const transcript = page.locator('.transcript');
  await expect(side).toContainText('The budget closes on Friday');
  expect((await side.boundingBox())?.x).toBeGreaterThan((await transcript.boundingBox())?.x ?? 0);

  await side.getByRole('button', { name: 'Kestrel' }).click();
  await expect(page.locator('.transcript__line')).toHaveCount(1);
  await expect(page.locator('.transcript__line mark').first()).toHaveText('Kestrel');
  await expect(page.locator('.transcript__count')).toHaveText('1 / 6');

  await page.locator('.session__toggle').click();
  await expect(side).toHaveCount(0);
  // Escape clears the search first; the page stays
  await page.locator('.transcript__search').press('Escape');
  await expect(page.locator('.transcript__line')).toHaveCount(6);
  await expect(page.locator('.session')).toBeVisible();
});

test('with a key, the AI names the conversation and writes its minutes', async ({ page }) => {
  const asked = await fakeChat(page);
  await page.goto('./');
  await page.locator('#lg-api-key').fill(VALID_KEY);
  await open(page, { summary: [], glossary: '' });

  // A file is named only when asked to
  const name = page.getByRole('textbox', { name: 'Name of the conversation' });
  await expect(name).toHaveValue('');
  await page.getByRole('button', { name: 'Have the AI write another name' }).click();
  await expect(name).toHaveValue(NAME);

  await page.getByRole('tab', { name: 'Assistant' }).click();
  await page.getByRole('button', { name: 'Meeting minutes' }).click();
  await expect(page.locator('.assistant__answer')).toHaveText(MINUTES);
  expect(asked.at(-1)).toContain('Voice 2: The plan is to close the budget by Friday.');
  expect(asked.at(-1)).toMatch(/Request: Write the minutes/);

  // The name the person types wins, and leaves with the download
  await name.fill('Q4 budget');
  await name.press('Enter');
  const download = page.waitForEvent('download');
  await page.locator('.download__toggle').click();
  await page.getByRole('menuitem', { name: /\.md/ }).click();
  const text = await readFile(await (await download).path(), 'utf8');
  expect(text).toContain('# Q4 budget');
  expect(text).toContain('El plan es cerrar el presupuesto el viernes.');
});
