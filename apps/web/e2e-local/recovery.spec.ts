// SPDX-License-Identifier: BUSL-1.1

import { expect, test } from './fixtures';

test('a failed WASM load surfaces an error and retry opens the real store', async ({
  context,
  page,
}) => {
  await context.route('**/*.wasm', (route) => route.abort());
  await page.goto('/accounts');
  await expect(page.getByRole('alert').first()).toContainText('database engine');
  await context.unroute('**/*.wasm');
  await page.getByRole('button', { name: /retry/i }).click();
  await expect(page.getByRole('button', { name: /add account/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /add account/i })).toBeVisible();
});
