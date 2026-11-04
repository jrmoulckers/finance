// SPDX-License-Identifier: BUSL-1.1

import { expect, test } from './fixtures';

test('transaction CRUD and downloaded CSV round-trip use durable SQLite offline', async ({
  context,
  page,
}) => {
  const payee = 'Synthetic CSV, "quoted" merchant';
  const note = 'Synthetic note, "quoted"\nSecond synthetic line';
  await page.goto('/transactions');
  await expect(page.getByRole('button', { name: 'Add Transaction', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Amount/).fill('12.34');
  await dialog.getByLabel(/^Payee/).fill(payee);
  await dialog.getByLabel(/^Account/).selectOption({ label: 'Checking' });
  await dialog.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await expect(page.getByRole('button', { name: `Edit ${payee}`, exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await page.getByRole('button', { name: `Edit ${payee}`, exact: true }).click();
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue('-$12.34');
  const date = await dialog.getByLabel(/^Date/).inputValue();
  const accountId = await dialog.getByLabel(/^Account/).inputValue();
  await dialog.getByLabel(/^Amount/).fill('23.45');
  await dialog.getByLabel('Note', { exact: true }).fill(note);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export transactions as CSV' }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks);
  expect(csv.toString()).toContain('"Synthetic CSV, ""quoted"" merchant"');
  expect(csv.toString()).toContain('-23.45');
  expect(csv.toString()).toContain('"Synthetic note, ""quoted""\nSecond synthetic line"');
  expect(csv.toString()).not.toContain('Pixel Arcade');

  await page.getByRole('button', { name: `Delete ${payee}`, exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await expect(page.getByRole('button', { name: `Edit ${payee}`, exact: true })).toHaveCount(0);

  await page.goto('/import');
  await page.getByLabel('Import into account').selectOption({ label: 'Checking' });
  await page.getByLabel('Choose CSV file to import').setInputFiles({
    name: 'synthetic-roundtrip.csv',
    mimeType: 'text/csv',
    buffer: csv,
  });
  await page.getByLabel('Map "date" to transaction field', { exact: true }).selectOption('date');
  await page
    .getByLabel('Map "amount" to transaction field', { exact: true })
    .selectOption('amount');
  await page.getByLabel('Map "payee" to transaction field', { exact: true }).selectOption('payee');
  await page.getByLabel('Map "notes" to transaction field', { exact: true }).selectOption('note');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Import 1 Transaction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import Complete' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Import results' })).toHaveText(
    /^\s*1\s*Imported\s*0\s*Skipped\s*$/,
  );
  await page.goto('/transactions');
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await page.getByRole('button', { name: `Edit ${payee}`, exact: true }).click();
  await expect(dialog.getByLabel(/^Amount/)).toHaveValue('-$23.45');
  await expect(dialog.getByLabel(/^Date/)).toHaveValue(date);
  await expect(dialog.getByLabel(/^Account/)).toHaveValue(accountId);
  await expect(dialog.getByLabel('Note', { exact: true })).toHaveValue(note);
  await expect(dialog.getByRole('radio', { name: 'Expense', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await expect(page.getByRole('button', { name: `Edit ${payee}`, exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await context.setOffline(false);
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill('Synthetic CSV');
  await expect(page.getByRole('button', { name: `Edit ${payee}`, exact: true })).toHaveCount(1);
});
