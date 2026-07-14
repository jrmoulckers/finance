// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Plaid REST client helpers (#3848).
 *
 * Covers pure logic: base URL resolution, link-token request building, and
 * the Plaid-amount -> internal-cents provenance mapping. Network calls are
 * exercised indirectly via the webhook/ingestion tests.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  buildLinkTokenRequest,
  plaidAmountToCents,
  plaidBaseUrl,
  plaidTransactionToRecord,
  removeItem,
  type PlaidTransaction,
} from './plaid.ts';

Deno.test('plaidBaseUrl maps known environments', () => {
  assertEquals(plaidBaseUrl('sandbox'), 'https://sandbox.plaid.com');
  assertEquals(plaidBaseUrl('development'), 'https://development.plaid.com');
  assertEquals(plaidBaseUrl('production'), 'https://production.plaid.com');
});

Deno.test('plaidBaseUrl falls back to sandbox for unknown values', () => {
  assertEquals(plaidBaseUrl('staging'), 'https://sandbox.plaid.com');
  assertEquals(plaidBaseUrl(''), 'https://sandbox.plaid.com');
});

Deno.test('buildLinkTokenRequest sets required fields', () => {
  const req = buildLinkTokenRequest('user-123');
  assertEquals((req.user as { client_user_id: string }).client_user_id, 'user-123');
  assertEquals(req.products, ['transactions']);
  assertEquals(req.country_codes, ['US']);
  assertEquals('webhook' in req, false);
});

Deno.test('buildLinkTokenRequest includes webhook when provided', () => {
  const req = buildLinkTokenRequest('user-123', 'https://example.com/hook');
  assertEquals(req.webhook, 'https://example.com/hook');
});

Deno.test('plaidAmountToCents treats outflow as a negative expense', () => {
  // Plaid: positive amount = money leaving the account (a debit/expense).
  const { amountCents, type } = plaidAmountToCents(12.34);
  assertEquals(amountCents, -1234);
  assertEquals(type, 'expense');
});

Deno.test('plaidAmountToCents treats inflow as a positive income', () => {
  const { amountCents, type } = plaidAmountToCents(-56.78);
  assertEquals(amountCents, 5678);
  assertEquals(type, 'income');
});

Deno.test('plaidAmountToCents rounds to whole cents', () => {
  assertEquals(plaidAmountToCents(12.344).amountCents, -1234);
  assertEquals(plaidAmountToCents(12.346).amountCents, -1235);
  assertEquals(plaidAmountToCents(0).amountCents, 0);
});

function sampleTransaction(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    transaction_id: 'txn_1',
    account_id: 'acct_ext_1',
    amount: 42.5,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    date: '2026-04-01',
    authorized_date: '2026-03-31',
    name: 'Coffee Shop',
    merchant_name: 'Blue Bottle',
    pending: false,
    ...overrides,
  };
}

Deno.test('plaidTransactionToRecord tags provenance and maps amount', () => {
  const record = plaidTransactionToRecord(sampleTransaction(), {
    householdId: 'hh-1',
    accountId: 'acct-int-1',
    currencyFallback: 'USD',
  });
  assertEquals(record.source, 'aggregator');
  assertEquals(record.provider_transaction_id, 'txn_1');
  assertEquals(record.household_id, 'hh-1');
  assertEquals(record.account_id, 'acct-int-1');
  assertEquals(record.amount_cents, -4250);
  assertEquals(record.type, 'expense');
  assertEquals(record.payee, 'Blue Bottle');
  assertEquals(record.authorized_date, '2026-03-31');
  assertEquals(record.posted_date, '2026-04-01');
  assertEquals(record.status, 'CLEARED');
});

Deno.test('plaidTransactionToRecord marks pending transactions', () => {
  const record = plaidTransactionToRecord(sampleTransaction({ pending: true }), {
    householdId: 'hh-1',
    accountId: 'acct-int-1',
    currencyFallback: 'USD',
  });
  assertEquals(record.status, 'PENDING');
  assertEquals(record.posted_date, null);
});

Deno.test('plaidTransactionToRecord falls back to name then currency fallback', () => {
  const record = plaidTransactionToRecord(
    sampleTransaction({
      merchant_name: null,
      iso_currency_code: null,
      unofficial_currency_code: null,
    }),
    { householdId: 'hh-1', accountId: 'acct-int-1', currencyFallback: 'EUR' },
  );
  assertEquals(record.payee, 'Coffee Shop');
  assertEquals(record.currency_code, 'EUR');
});

Deno.test('removeItem posts the access token to /item/remove', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return Promise.resolve(new Response(JSON.stringify({ request_id: 'req-1' }), { status: 200 }));
  }) as typeof fetch;

  try {
    const result = await removeItem(
      { clientId: 'client', secret: 'secret', environment: 'sandbox' },
      'access-token-xyz',
    );
    assertEquals(result.request_id, 'req-1');
    assertEquals(capturedUrl, 'https://sandbox.plaid.com/item/remove');
    assertEquals(capturedBody.access_token, 'access-token-xyz');
    assertEquals(capturedBody.client_id, 'client');
    assertEquals(capturedBody.secret, 'secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
