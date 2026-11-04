// SPDX-License-Identifier: BUSL-1.1

import { expect, test } from './fixtures';

test('budget and goal CRUD survive real SQLite reloads', async ({ page }) => {
  await page.goto('/budgets');
  await page.getByRole('button', { name: 'Add budget', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Category/).selectOption({ label: 'Income' });
  await dialog.getByLabel(/^Amount/).fill('321.09');
  await dialog.getByRole('button', { name: 'Create Budget', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit Income', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Income', exact: true }).click();
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue('$321.09');
  await dialog.getByLabel(/^Amount/).fill('432.10');
  await dialog.getByRole('button', { name: 'Update Budget', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const budget = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Edit Income', exact: true }) });
  await expect(budget).toContainText('432.10');
  await page.getByRole('button', { name: 'Delete Income', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Budget' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit Income', exact: true })).toHaveCount(0);

  await page.goto('/goals');
  await page.getByRole('button', { name: 'Add a new goal' }).click();
  await dialog.getByLabel(/^Name/).fill('Synthetic local goal');
  await dialog.getByLabel(/^Target Amount/).fill('987.65');
  await dialog.getByLabel(/^Current Amount/).fill('12.34');
  await dialog.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Synthetic local goal', exact: true }).click();
  await dialog.getByLabel(/^Name/).fill('Synthetic updated goal');
  await dialog.getByLabel(/^Target Amount/).fill('999.99');
  await dialog.getByRole('button', { name: 'Update Goal', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const goal = page.getByRole('listitem', { name: /^Synthetic updated goal:/ });
  await expect(goal).toContainText('999.99');
  await expect(goal).toContainText('12.34');
  await page.getByRole('button', { name: 'Delete Synthetic updated goal', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Goal' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit Synthetic updated goal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a new goal' })).toBeVisible();
});
