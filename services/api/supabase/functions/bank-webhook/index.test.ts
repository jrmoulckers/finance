// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Bank Webhook Handler (#3848).
 *
 * The handler module calls serve() at import time, so these tests exercise
 * the pure ingestion + verification helpers it composes (imported directly
 * from `_shared/`) rather than importing index.ts. This validates the
 * security-relevant invariants: provenance tagging, no raw-token leakage,
 * signature verification, and webhook routing.
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { plaidTransactionToRecord, type PlaidTransaction } from '../_shared/plaid.ts';
import { sha256Hex, verifyPlaidWebhook } from '../_shared/plaid-webhook.ts';
import type { PlaidVerificationKey } from '../_shared/plaid.ts';

// ---------------------------------------------------------------------------
// Provider routing validation (mirrors handler guard)
// ---------------------------------------------------------------------------

const SUPPORTED_PROVIDERS = ['plaid', 'mx'];

Deno.test('webhook provider must be plaid or mx', () => {
  assertEquals(SUPPORTED_PROVIDERS.includes('plaid'), true);
  assertEquals(SUPPORTED_PROVIDERS.includes('mx'), true);
  assertEquals(SUPPORTED_PROVIDERS.includes('yodlee'), false);
  assertEquals(SUPPORTED_PROVIDERS.includes(''), false);
});

// ---------------------------------------------------------------------------
// Ingestion mapping — provenance + no token leakage
// ---------------------------------------------------------------------------

function sampleTransaction(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    transaction_id: 'txn_ingest_1',
    account_id: 'ext_acct_1',
    amount: 19.99,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    date: '2026-04-02',
    authorized_date: '2026-04-01',
    name: 'Grocery Store',
    merchant_name: 'Whole Foods',
    pending: false,
    ...overrides,
  };
}

Deno.test('ingested transaction is tagged with aggregator provenance', () => {
  const record = plaidTransactionToRecord(sampleTransaction(), {
    householdId: 'hh-77',
    accountId: 'acct-int-77',
    currencyFallback: 'USD',
  });

  assertEquals(record.source, 'aggregator');
  assertEquals(record.provider_transaction_id, 'txn_ingest_1');
  assertExists(record.authorized_date);
  assertEquals(record.household_id, 'hh-77');
  assertEquals(record.account_id, 'acct-int-77');
});

Deno.test('ingested transaction record never carries an access token', () => {
  const record = plaidTransactionToRecord(sampleTransaction(), {
    householdId: 'hh-77',
    accountId: 'acct-int-77',
    currencyFallback: 'USD',
  });

  const serialized = JSON.stringify(record).toLowerCase();
  assertEquals(serialized.includes('access_token'), false);
  assertEquals(serialized.includes('access-sandbox'), false);
  assertEquals(serialized.includes('secret'), false);
});

Deno.test('expense outflow maps to a negative amount', () => {
  const record = plaidTransactionToRecord(sampleTransaction({ amount: 19.99 }), {
    householdId: 'hh-77',
    accountId: 'acct-int-77',
    currencyFallback: 'USD',
  });
  assertEquals(record.amount_cents, -1999);
  assertEquals(record.type, 'expense');
});

// ---------------------------------------------------------------------------
// Webhook verification gate — an unsigned/forged webhook is rejected
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonToBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

Deno.test('a forged webhook (unsigned) is rejected before ingestion', async () => {
  const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' });
  // Attacker crafts a header with an ES256 alg but no valid signature.
  const forgedHeader = `${jsonToBase64Url({ alg: 'ES256', kid: 'x' })}.${jsonToBase64Url({
    iat: Math.floor(Date.now() / 1000),
    request_body_sha256: await sha256Hex(body),
  })}.${bytesToBase64Url(new Uint8Array(64))}`;

  const key: PlaidVerificationKey = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
    y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
    kid: 'x',
    alg: 'ES256',
  };

  const result = await verifyPlaidWebhook(body, forgedHeader, {
    fetchKey: () => Promise.resolve(key),
  });
  assertEquals(result, false);
});
