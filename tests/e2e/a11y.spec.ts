import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WCAG 2.2 A and AA rules, in both colour schemes: a violation fails the build
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(', ')})`);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} scheme`, () => {
    test.use({ colorScheme, locale: 'en-US' });

    test('the app start screen has no accessibility violations', async ({ page }) => {
      await page.goto('./');
      await expect(page.locator('.start')).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('the navigation drawer, where there is one, has none either', async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'the drawer only exists on narrow screens');
      await page.goto('./');
      await page.getByRole('button', { name: 'Open the menu' }).click();
      await expect(page.locator('#lg-sidebar')).toBeVisible();
      expect(await violations(page)).toEqual([]);
      // Escape closes it and gives the focus back to the button that opened it
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Open the menu' })).toBeFocused();
    });
  });
}
