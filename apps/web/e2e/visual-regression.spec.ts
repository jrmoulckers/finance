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
  test('login page matches the baseline', async ({ page }, testInfo) => {
    // The login brand snapshot is maintained on the Chromium project only.
    // NOTE: use the PROJECT name, not browserName — the `chromium-edge`
    // project also reports browserName 'chromium', so a browserName check
    // would wrongly run it there and fail on a missing edge baseline.
    test.skip(
      testInfo.project.name !== 'chromium',
      'Visual baseline is maintained on the Chromium project only.',
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForStableLogin(page);

    await expect(page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
      fullPage: true,
    });
  });
});
