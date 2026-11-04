// SPDX-License-Identifier: BUSL-1.1

import { expect, test } from './fixtures';

test('account CRUD persists through reload and offline page reopen', async ({ context, page }) => {
  await page.goto('/accounts');
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/account name/i).fill('Synthetic offline account');
  await dialog.getByLabel(/initial balance/i).fill('123.45');
  await dialog.getByRole('button', { name: /create account/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Synthetic offline account', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Synthetic offline account', { exact: true })).toBeVisible();
  await page.getByText('Synthetic offline account', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit Synthetic offline account' }).click();
  await dialog.getByLabel(/account name/i).fill('Synthetic edited account');
  await dialog.getByRole('button', { name: /update account/i }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Synthetic edited account' })).toBeVisible();
  await expect(page.getByText('$123.45', { exact: true }).first()).toBeVisible();
  const encrypted = await page.evaluate(async () => {
    const request = indexedDB.open('finance-sqlite-encrypted');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction('encrypted', 'readonly').objectStore('encrypted').get('db');
      return await new Promise<unknown>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
  expect(encrypted).toMatchObject({ magic: 'finance.sqlite.snapshot.encrypted', version: 1 });
  expect(JSON.stringify(encrypted)).not.toContain('Synthetic edited account');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const accountUrl = page.url();
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(accountUrl);
  expect(await reopened.evaluate(() => navigator.onLine)).toBe(false);
  await expect(reopened.getByRole('heading', { name: 'Synthetic edited account' })).toBeVisible();
  await reopened.getByRole('button', { name: 'Delete Synthetic edited account' }).click();
  await reopened
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(reopened).toHaveURL(/\/accounts$/);
  await reopened.reload();
  await expect(reopened.getByText('Synthetic edited account', { exact: true })).toHaveCount(0);
  await expect(reopened.getByRole('button', { name: /add account/i })).toBeVisible();
  await context.setOffline(false);
  await reopened.reload();
  await expect(reopened.getByText('Synthetic edited account', { exact: true })).toHaveCount(0);
  await expect(reopened.getByRole('button', { name: /add account/i })).toBeVisible();
});
