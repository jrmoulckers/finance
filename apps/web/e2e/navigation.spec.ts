import { expect, test } from '@playwright/test';

test.skip('404 page for invalid routes', async ({ page }) => {
  await page.goto('/invalid-route');
  await expect(page.getByText(/not found|404/i)).toBeVisible();
});
