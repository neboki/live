import { expect, test } from '@playwright/test';

// Assertions match the English copy
test.use({ locale: 'en-US' });

test('the app validates the key before it can start', async ({ page }) => {
  await page.goto('./');

  await expect(page).toHaveTitle('Neboki Live');
  const start = page.locator('.start__cta');
  await expect(start).toBeDisabled();
  await page.locator('#lg-api-key').fill(['sk', 'FAKExFAKExFAKExFAKExFAKEx'].join('-'));
  await expect(start).toBeEnabled();
});

test('the ElevenLabs key box only shows under ElevenLabs, with its own label', async ({ page }) => {
  await page.goto('./');

  const voice = page.locator('.start__voice');
  await voice.getByRole('radio', { name: 'OpenAI' }).click();
  await expect(voice.getByText('reads, with your OpenAI key')).toBeVisible();
  await expect(voice.locator('input')).toHaveCount(0);

  await voice.getByRole('radio', { name: 'ElevenLabs' }).click();
  await expect(voice.getByLabel('ElevenLabs key')).toBeFocused();
  await expect(voice.getByText('Until then OpenAI')).toBeVisible();

  await voice.getByRole('radio', { name: 'No voice' }).click();
  await expect(voice.locator('input')).toHaveCount(0);
});
