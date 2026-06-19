import { expect, test } from '@playwright/test';

import { seedFirstRunState } from './first-run-state';

test.beforeEach(async ({ page }) => {
  // Bypass the GDPR consent gate so the login chrome renders for the snapshot.
  await seedFirstRunState(page);
});

async function waitForStableLogin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /finance/i })).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

test.describe('Visual regression', () => {
  // The login brand snapshot is maintained on Chromium only. Cross-browser
  // pixel baselines (Firefox/WebKit/Edge) drift on font/AA rendering and add
  // little signal for a single brand screenshot, so we skip them here.
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Visual baseline is maintained on Chromium only.',
  );

  test('login page matches the baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForStableLogin(page);

    await expect(page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
      fullPage: true,
    });
  });
});
