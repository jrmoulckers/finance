// SPDX-License-Identifier: BUSL-1.1

import { expect, type BrowserContext, type Page } from '@playwright/test';

import { localSyncEnvironment } from './environment';

const PASSWORD = 'SyntheticLocalSync!2026';

export interface SyntheticSession {
  email: string;
  token: string;
}

/** Complete genuine consent and auth; no auth storage or SDK/network mocks. */
export async function authenticate(
  page: Page,
  email: string,
  signup: boolean,
): Promise<SyntheticSession> {
  await page.addInitScript(() => {
    // Bypass only the product tour, never auth, the database, or sync consent.
    localStorage.setItem('finance-onboarding-complete', 'true');
  });
  await page.goto(signup ? '/signup' : '/login');
  const consent = page.getByRole('dialog', { name: 'Your Privacy Matters' });
  const consentRecorded = await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('finance-gdpr-consent') ?? '{}');
    return record.categories?.sync === true;
  });
  if (!consentRecorded) {
    await expect(consent).toBeVisible();
    await consent.getByRole('button', { name: 'Customize Preferences' }).click();
    await consent.getByRole('checkbox', { name: 'Cloud Sync', exact: true }).check();
    await consent.getByRole('button', { name: 'Save Preferences' }).click();
  }
  await expect(page.getByText(/Demo Mode/i)).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const record = JSON.parse(localStorage.getItem('finance-gdpr-consent') ?? '{}');
        return record.categories?.sync === true;
      }),
    )
    .toBe(true);

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  if (signup) await page.getByLabel('Confirm Password').fill(PASSWORD);
  // Signup may supply a token directly or perform a separate auto-login.
  const authResponse = page.waitForResponse(
    async (response) =>
      response.request().method() === 'POST' &&
      /\/api\/auth\/(signup|login)$/.test(new URL(response.url()).pathname) &&
      response.ok() &&
      hasToken(await response.json()),
  );
  await page.getByRole('button', { name: signup ? 'Sign up' : 'Sign in', exact: true }).click();
  const response = await authResponse;
  const body: unknown = await response.json();
  if (!hasToken(body)) throw new Error('Real edge auth did not return an access token.');
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/\/(login|signup)$/);
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible()) await skip.click();
  return { email, token: body.access_token };
}

function hasToken(value: unknown): value is { access_token: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string'
  );
}

/** Read the real server through the user's RLS-scoped JWT, not a service key. */
export async function rest(
  context: BrowserContext,
  session: SyntheticSession,
  path: string,
  method = 'GET',
  data?: Record<string, unknown>,
) {
  const environment = localSyncEnvironment();
  return context.request.fetch(`${environment.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: environment.anonKey,
      Authorization: `Bearer ${session.token}`,
      Prefer: 'return=representation',
    },
    data,
  });
}

/** Assert exact server cardinality and integer cents for a synthetic record. */
export async function expectServerRow(
  context: BrowserContext,
  session: SyntheticSession,
  table: 'accounts' | 'transactions',
  id: string,
  expected: Record<string, unknown>,
) {
  await expect
    .poll(async () => {
      const response = await rest(context, session, `${table}?id=eq.${id}&select=*`);
      expect(response.ok(), 'RLS-scoped server read must succeed').toBe(true);
      return response.json();
    })
    .toEqual([expect.objectContaining({ id, ...expected })]);
}

/** Submit the real account form and return the client-generated record ID. */
export async function createAccount(page: Page, name: string) {
  await page.goto('/accounts');
  await page.getByRole('button', { name: 'Add new account' }).click();
  const dialog = page.getByRole('dialog', { name: /create account/i });
  await dialog.getByLabel(/account name/i).fill(name);
  await dialog.getByLabel(/account type/i).selectOption('CHECKING');
  await dialog.getByLabel(/currency/i).selectOption('USD');
  await dialog.getByLabel(/initial balance/i).fill('100.00');
  await dialog.getByRole('button', { name: /create account/i }).click();
  await expect(dialog).not.toBeVisible();
  const link = page.getByRole('link', { name, exact: true });
  await expect(link).toHaveCount(1);
  return recordId(await link.getAttribute('href'));
}

/** Submit the real transaction form, including while fully offline. */
export async function createTransaction(page: Page, account: string, payee: string) {
  await page.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /new transaction/i });
  await dialog.getByLabel(/payee/i).fill(payee);
  await dialog.getByLabel('Amount', { exact: true }).fill('12.34');
  await dialog.getByLabel('Account', { exact: true }).selectOption({ label: account });
  await dialog.getByRole('button', { name: 'Add Transaction', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const link = transactionLink(page, payee);
  await expect(link).toHaveCount(1);
  return recordId(await link.getAttribute('href'));
}

/** Locate a synthetic transaction row using the app's accessible link name. */
export function transactionLink(page: Page, payee: string) {
  return page.getByRole('link', { name: `View details for ${payee}`, exact: true });
}

function recordId(href: string | null): string {
  const id = href?.split('/').at(-1);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('Expected a real client-generated UUID in the record link.');
  }
  return id;
}
