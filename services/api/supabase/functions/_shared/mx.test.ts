// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the MX Platform REST client helpers (#4371).
 *
 * Covers pure logic: base URL resolution, auth header composition, the
 * (user_guid, member_guid) credential codec, widget-request building, the
 * MX account-type taxonomy mapping, and the MX-amount -> internal-cents
 * provenance mapping.
 *
 * MX reports amounts as POSITIVE magnitudes with the direction carried in
 * `type`/`is_expense`, which is the INVERSE of Plaid's signed convention — the
 * sign tests below are the guard against those two mappers being conflated.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  buildWidgetUrlRequest,
  classifyMxWebhookEvent,
  decodeMxCredential,
  encodeMxCredential,
  mxAccountTypeToInternal,
  mxAmountToCents,
  mxBaseUrl,
  mxHeaders,
  mxTransactionToRecord,
  type MxTransaction,
  type MxWebhookEvent,
} from './mx.ts';

// ---------------------------------------------------------------------------
// Base URL + headers
// ---------------------------------------------------------------------------

Deno.test('mxBaseUrl maps known environments', () => {
  assertEquals(mxBaseUrl('sandbox'), 'https://int-api.mx.com');
  assertEquals(mxBaseUrl('integration'), 'https://int-api.mx.com');
  assertEquals(mxBaseUrl('production'), 'https://api.mx.com');
});

Deno.test('mxBaseUrl falls back to the integration host for unknown values', () => {
  // Fail-safe direction: a typo must never silently target production.
  assertEquals(mxBaseUrl('prod'), 'https://int-api.mx.com');
  assertEquals(mxBaseUrl(''), 'https://int-api.mx.com');
});

Deno.test('mxHeaders composes Basic auth and the versioned Accept header', () => {
  const headers = mxHeaders({ clientId: 'id', apiKey: 'key', environment: 'sandbox' });
  assertEquals(headers.Accept, 'application/vnd.mx.api.v1+json');
  assertEquals(headers.Authorization, `Basic ${btoa('id:key')}`);
});

// ---------------------------------------------------------------------------
// Credential codec
// ---------------------------------------------------------------------------

Deno.test('encode/decodeMxCredential round-trips the guid pair', () => {
  const encoded = encodeMxCredential('USR-1', 'MBR-2');
  assertEquals(encoded, 'USR-1:MBR-2');
  assertEquals(decodeMxCredential(encoded), { userGuid: 'USR-1', memberGuid: 'MBR-2' });
});

Deno.test('decodeMxCredential rejects malformed credentials without echoing them', () => {
  for (const bad of ['', 'USR-1', 'USR-1:', ':MBR-2', 'a:b:c']) {
    const error = assertThrows(() => decodeMxCredential(bad)) as Error;
    assertEquals(error.message, 'Stored MX credential is malformed');
    // The credential must never appear in the error text.
    assertEquals(error.message.includes(bad) && bad.length > 0, false);
  }
});

// ---------------------------------------------------------------------------
// Widget request
// ---------------------------------------------------------------------------

Deno.test('buildWidgetUrlRequest requests the connect widget with message v4', () => {
  const widget = buildWidgetUrlRequest().widget_url as Record<string, unknown>;
  assertEquals(widget.widget_type, 'connect_widget');
  // v4 is required for the widget to post back the member_guid.
  assertEquals(widget.ui_message_version, 4);
});

// ---------------------------------------------------------------------------
// Account type mapping
// ---------------------------------------------------------------------------

Deno.test('mxAccountTypeToInternal maps MX types to internal types', () => {
  assertEquals(mxAccountTypeToInternal('CHECKING', null), 'CHECKING');
  assertEquals(mxAccountTypeToInternal('SAVINGS', null), 'SAVINGS');
  assertEquals(mxAccountTypeToInternal('CREDIT_CARD', null), 'CREDIT_CARD');
  assertEquals(mxAccountTypeToInternal('LOAN', null), 'LOAN');
  assertEquals(mxAccountTypeToInternal('MORTGAGE', null), 'LOAN');
  assertEquals(mxAccountTypeToInternal('LINE_OF_CREDIT', null), 'LOAN');
  assertEquals(mxAccountTypeToInternal('INVESTMENT', null), 'INVESTMENT');
  assertEquals(mxAccountTypeToInternal('CASH', null), 'CASH');
  assertEquals(mxAccountTypeToInternal('PREPAID', null), 'CASH');
});

Deno.test('mxAccountTypeToInternal promotes money-market/CD subtypes to SAVINGS', () => {
  assertEquals(mxAccountTypeToInternal('CHECKING', 'MONEY_MARKET'), 'SAVINGS');
  assertEquals(mxAccountTypeToInternal('CHECKING', 'CERTIFICATE_OF_DEPOSIT'), 'SAVINGS');
});

Deno.test('mxAccountTypeToInternal is case-insensitive and falls back to OTHER', () => {
  assertEquals(mxAccountTypeToInternal('checking', null), 'CHECKING');
  assertEquals(mxAccountTypeToInternal('ANY', null), 'OTHER');
  assertEquals(mxAccountTypeToInternal(null, null), 'OTHER');
});

// ---------------------------------------------------------------------------
// Amount mapping
// ---------------------------------------------------------------------------

Deno.test('mxAmountToCents treats is_expense as authoritative', () => {
  assertEquals(mxAmountToCents({ amount: 12.34, is_expense: true }), {
    amountCents: -1234,
    type: 'expense',
  });
  assertEquals(mxAmountToCents({ amount: 12.34, is_expense: false }), {
    amountCents: 1234,
    type: 'income',
  });
});

Deno.test('mxAmountToCents falls back to is_income, then to type', () => {
  assertEquals(mxAmountToCents({ amount: 50, is_income: true }).type, 'income');
  assertEquals(mxAmountToCents({ amount: 50, is_income: false }).type, 'expense');
  assertEquals(mxAmountToCents({ amount: 50, type: 'CREDIT' }).type, 'income');
  assertEquals(mxAmountToCents({ amount: 50, type: 'DEBIT' }).type, 'expense');
});

Deno.test('mxAmountToCents normalizes a negative magnitude to the flagged direction', () => {
  // MX should always send a positive magnitude; a negative one must not flip
  // the sign a second time.
  assertEquals(mxAmountToCents({ amount: -12.34, is_expense: true }).amountCents, -1234);
});

Deno.test('mxAmountToCents rounds to whole cents', () => {
  assertEquals(mxAmountToCents({ amount: 10.005, is_expense: true }).amountCents, -1001);
  assertEquals(mxAmountToCents({ amount: 0, is_expense: true }).amountCents, -0);
});

// ---------------------------------------------------------------------------
// Transaction mapping
// ---------------------------------------------------------------------------

const TARGET = {
  householdId: 'household-1',
  accountId: 'account-1',
  currencyFallback: 'USD',
};

function mxTxn(overrides: Partial<MxTransaction> = {}): MxTransaction {
  return {
    guid: 'TRN-1',
    account_guid: 'ACT-1',
    amount: 25.5,
    currency_code: 'USD',
    date: '2026-05-04',
    transacted_at: '2026-05-04T10:00:00Z',
    posted_at: '2026-05-05T02:00:00Z',
    description: 'COFFEE SHOP #12',
    payee: 'Coffee Shop',
    status: 'POSTED',
    type: 'DEBIT',
    is_expense: true,
    is_income: false,
    ...overrides,
  };
}

Deno.test('mxTransactionToRecord maps a posted expense with provenance', () => {
  const record = mxTransactionToRecord(mxTxn(), TARGET);
  assertEquals(record.household_id, 'household-1');
  assertEquals(record.account_id, 'account-1');
  assertEquals(record.amount_cents, -2550);
  assertEquals(record.type, 'expense');
  assertEquals(record.payee, 'Coffee Shop');
  assertEquals(record.date, '2026-05-04');
  assertEquals(record.posted_date, '2026-05-05');
  assertEquals(record.status, 'CLEARED');
  assertEquals(record.source, 'aggregator');
  assertEquals(record.provider_transaction_id, 'TRN-1');
});

Deno.test('mxTransactionToRecord leaves posted_date null while pending', () => {
  const record = mxTransactionToRecord(mxTxn({ status: 'PENDING' }), TARGET);
  assertEquals(record.status, 'PENDING');
  assertEquals(record.posted_date, null);
});

Deno.test('mxTransactionToRecord falls back to the description then the currency default', () => {
  const record = mxTransactionToRecord(mxTxn({ payee: null, currency_code: null }), TARGET);
  assertEquals(record.payee, 'COFFEE SHOP #12');
  assertEquals(record.currency_code, 'USD');
});

Deno.test('mxTransactionToRecord normalizes ISO timestamps to calendar dates', () => {
  const record = mxTransactionToRecord(
    mxTxn({ date: null, transacted_at: '2026-05-04T23:59:59Z' }),
    TARGET,
  );
  assertEquals(record.date, '2026-05-04');
  assertEquals(record.authorized_date, '2026-05-04');
});

Deno.test(
  'mxTransactionToRecord falls back to the posted date when no transacted date exists',
  () => {
    const record = mxTransactionToRecord(
      mxTxn({ date: null, transacted_at: null, posted_at: '2026-05-05T02:00:00Z' }),
      TARGET,
    );
    // `transactions.date` is NOT NULL — a row must never be built without one.
    assertEquals(record.date, '2026-05-05');
  },
);

// ---------------------------------------------------------------------------
// Webhook event classification (#4377)
// ---------------------------------------------------------------------------
//
// Regression guard. The handler previously branched on an `event_type` field
// and the values `member_connected` / `member_status_changed` /
// `transactions_added` — none of which MX sends. Real deliveries matched no
// branch, returned 200, and MX (which treats 200 as delivered) never retried,
// so the failure was completely silent.

Deno.test('classifyMxWebhookEvent routes an AGGREGATION event to ingestion', () => {
  // Verbatim shape from MX's aggregation webhook documentation.
  const event: MxWebhookEvent = {
    action: 'member_data_updated',
    type: 'AGGREGATION',
    member_guid: 'MBR-48d9a481',
    user_guid: 'USR-eaf4ac68',
    transactions_created_count: 3,
    transactions_updated_count: 2,
  };
  assertEquals(classifyMxWebhookEvent(event), 'ingest');
});

Deno.test('classifyMxWebhookEvent routes a CONNECTION_STATUS event to re-auth', () => {
  // Verbatim shape from MX's connection-status webhook documentation.
  const event: MxWebhookEvent = {
    action: 'CHANGED',
    connection_status: 'CHALLENGED',
    member_guid: 'MBR-48d9a481',
    type: 'CONNECTION_STATUS',
    user_guid: 'USR-eaf4ac68',
  };
  assertEquals(classifyMxWebhookEvent(event), 'needs_reauth');
});

Deno.test('classifyMxWebhookEvent treats every actionable connection status as re-auth', () => {
  // MX emits CONNECTION_STATUS only for states needing user attention.
  for (const status of [
    'CHALLENGED',
    'DENIED',
    'EXPIRED',
    'IMPAIRED',
    'IMPEDED',
    'LOCKED',
    'PREVENTED',
    'REJECTED',
  ]) {
    assertEquals(
      classifyMxWebhookEvent({
        type: 'CONNECTION_STATUS',
        action: 'CHANGED',
        connection_status: status,
      }),
      'needs_reauth',
      `expected ${status} to require re-auth`,
    );
  }
});

Deno.test('classifyMxWebhookEvent reports the retired event_type shape as unhandled', () => {
  // The exact payload the old code expected. It must NOT resolve to a real
  // disposition, so the handler logs it instead of pretending it succeeded.
  assertEquals(
    classifyMxWebhookEvent({ event_type: 'transactions_added' } as MxWebhookEvent),
    'unhandled',
  );
});

Deno.test('classifyMxWebhookEvent reports unknown and empty payloads as unhandled', () => {
  assertEquals(classifyMxWebhookEvent({}), 'unhandled');
  assertEquals(classifyMxWebhookEvent({ type: 'MEMBER', action: 'created' }), 'unhandled');
  // Category matching is exact — MX sends upper-case category names.
  assertEquals(classifyMxWebhookEvent({ type: 'aggregation' }), 'unhandled');
});
