// SPDX-License-Identifier: BUSL-1.1

import { expect, test } from '@playwright/test';

import { localSyncEnvironment } from './environment';
import {
  authenticate,
  createAccount,
  createTransaction,
  expectServerRow,
  rest,
  transactionLink,
} from './helpers';

test.beforeAll(async ({ request }) => {
  const environment = localSyncEnvironment();
  expect(
    environment.anonKey.length > 0,
    'BLOCKED: inject LOCAL_SYNC_ANON_KEY (public local anon key); see e2e-sync/README.md.',
  ).toBe(true);
  const health = await request.get(`${environment.supabaseUrl}/auth/v1/health`, {
    headers: { apikey: environment.anonKey },
  });
  expect(health.ok(), 'Local Supabase Auth must be healthy before the proof').toBe(true);
});

test('real offline reload, replay, cross-client replication and household isolation', async ({
  browser,
  page,
  context,
  baseURL,
}) => {
  const run = crypto.randomUUID();
  const accountName = `Synthetic checking ${run}`;
  const otherAccountName = `Synthetic other ${run}`;
  const onlinePayee = `Synthetic online ${run}`;
  const offlinePayee = `Synthetic offline ${run}`;
  const owner = await authenticate(page, `sync-owner-${run}@local.test`, true);
  const accountId = await createAccount(page, accountName);

  await expectServerRow(context, owner, 'accounts', accountId, {
    name: accountName,
    currency_code: 'USD',
    balance_cents: 10000,
  });
  await page.goto('/transactions');
  const onlineId = await createTransaction(page, accountName, onlinePayee);
  await expectServerRow(context, owner, 'transactions', onlineId, {
    amount_cents: -1234,
    currency_code: 'USD',
    account_id: accountId,
    payee: onlinePayee,
  });
  await page.reload();
  await expect(transactionLink(page, onlinePayee)).toHaveCount(1);

  // A dev server cannot prove offline navigation. This suite serves the
  // production PWA and waits for the real service worker to control the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  });

  let successfulOfflineUploads = 0;
  context.on('response', (response) => {
    if (
      response.ok() &&
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/rest/v1/transactions'
    ) {
      const data: unknown = response.request().postDataJSON();
      if (
        typeof data === 'object' &&
        data !== null &&
        'payee' in data &&
        data.payee === offlinePayee
      ) {
        successfulOfflineUploads += 1;
      }
    }
  });
  await context.setOffline(true);
  const offlineId = await createTransaction(page, accountName, offlinePayee);
  await page.reload();
  await expect(transactionLink(page, offlinePayee)).toHaveCount(1);
  await expect(
    page.getByRole('listitem').filter({ has: transactionLink(page, offlinePayee) }),
  ).toContainText('12.34');
  expect(successfulOfflineUploads).toBe(0);
  const beforeReconnect = await rest(context, owner, `transactions?id=eq.${offlineId}&select=id`);
  expect(beforeReconnect.ok()).toBe(true);
  expect(await beforeReconnect.json()).toEqual([]);
  await context.setOffline(false);
  await expectServerRow(context, owner, 'transactions', offlineId, {
    amount_cents: -1234,
    currency_code: 'USD',
    account_id: accountId,
    payee: offlinePayee,
  });
  await expect.poll(() => successfulOfflineUploads).toBe(1);

  const replica = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
  const outsider = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
  try {
    const replicaPage = await replica.newPage();
    await authenticate(replicaPage, owner.email, false);
    await replicaPage.goto('/accounts');
    const replicaAccount = replicaPage.getByRole('link', { name: accountName, exact: true });
    await expect(replicaAccount).toHaveCount(1);
    await expect(replicaAccount).toHaveAttribute('href', `/accounts/${accountId}`);
    await replicaPage.goto('/transactions');
    for (const [payee, id] of [
      [onlinePayee, onlineId],
      [offlinePayee, offlineId],
    ]) {
      const row = transactionLink(replicaPage, payee);
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('href', `/transactions/${id}`);
      await expect(replicaPage.getByRole('listitem').filter({ has: row })).toContainText('12.34');
    }

    const outsiderPage = await outsider.newPage();
    const other = await authenticate(outsiderPage, `sync-other-${run}@local.test`, true);
    // Force the other user's household to be provisioned through the real app.
    const otherAccountId = await createAccount(outsiderPage, otherAccountName);
    await expectServerRow(outsider, other, 'accounts', otherAccountId, { balance_cents: 10000 });
    for (const [table, id] of [
      ['accounts', accountId],
      ['transactions', onlineId],
      ['transactions', offlineId],
    ]) {
      const read = await rest(outsider, other, `${table}?id=eq.${id}&select=*`);
      expect(read.ok()).toBe(true);
      expect(await read.json()).toEqual([]);
      const update = await rest(outsider, other, `${table}?id=eq.${id}`, 'PATCH', {
        deleted_at: new Date().toISOString(),
      });
      expect(update.ok()).toBe(true);
      expect(await update.json()).toEqual([]);
    }
    const accountResponse = await rest(
      context,
      owner,
      `accounts?id=eq.${accountId}&select=household_id`,
    );
    expect(accountResponse.ok()).toBe(true);
    const accounts: Array<{ household_id: string }> = await accountResponse.json();
    expect(accounts).toHaveLength(1);
    const otherAccountResponse = await rest(
      outsider,
      other,
      `accounts?id=eq.${otherAccountId}&select=*`,
    );
    expect(otherAccountResponse.ok()).toBe(true);
    const otherAccounts: Array<Record<string, unknown>> = await otherAccountResponse.json();
    expect(otherAccounts).toHaveLength(1);
    const forbiddenInsert = await rest(outsider, other, 'accounts', 'POST', {
      ...otherAccounts[0],
      id: crypto.randomUUID(),
      household_id: accounts[0].household_id,
      name: 'Synthetic forbidden account',
    });
    expect(forbiddenInsert.status()).toBe(403);
    await expectServerRow(context, owner, 'transactions', offlineId, {
      amount_cents: -1234,
      deleted_at: null,
    });
    await outsiderPage.goto('/transactions');
    await expect(
      outsiderPage.getByRole('button', { name: 'Add Transaction', exact: true }),
    ).toBeVisible();
    await expect(transactionLink(outsiderPage, onlinePayee)).toHaveCount(0);
    await expect(transactionLink(outsiderPage, offlinePayee)).toHaveCount(0);

    // Reconnect again: prove replay is not repeated after acknowledgement.
    await context.setOffline(true);
    await context.setOffline(false);
    await page.reload();
    await expect(transactionLink(page, offlinePayee)).toHaveCount(1);
    await expectServerRow(context, owner, 'transactions', offlineId, { amount_cents: -1234 });
    expect(successfulOfflineUploads).toBe(1);

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(transactionLink(page, offlinePayee)).toHaveCount(0);
    // Detect even a brief prior-user render while the new user's buckets load.
    // Observes only rendered synthetic labels, without replacing app behavior.
    await page.addInitScript(
      (priorLabels) => {
        const inspect = () => {
          if (priorLabels.some((label) => document.body?.textContent?.includes(label))) {
            sessionStorage.setItem('live-sync-prior-data-exposed', 'true');
          }
        };
        new MutationObserver(inspect).observe(document, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        inspect();
      },
      [accountName, onlinePayee, offlinePayee],
    );
    await authenticate(page, other.email, false);
    await page.goto('/accounts');
    // This marker originated in a different context, not this local cache.
    await expect(page.getByRole('link', { name: otherAccountName, exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: accountName, exact: true })).toHaveCount(0);
    await page.goto('/transactions');
    await expect(page.getByRole('button', { name: 'Add Transaction', exact: true })).toBeVisible();
    await expect(transactionLink(page, onlinePayee)).toHaveCount(0);
    await expect(transactionLink(page, offlinePayee)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add Transaction', exact: true })).toBeVisible();
    await expect(transactionLink(page, offlinePayee)).toHaveCount(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem('live-sync-prior-data-exposed')),
    ).toBeNull();
  } finally {
    await replica.close();
    await outsider.close();
  }
});
