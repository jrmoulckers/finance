import { expect, test } from '@playwright/test';

async function waitForStableLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe('Visual regression', () => {
  test('login page matches the baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForStableLogin(page);

    await expect(page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
      fullPage: true,
    });
  });
});
