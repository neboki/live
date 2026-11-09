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
