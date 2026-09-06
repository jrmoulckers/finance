// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertThrows } from 'std/testing/asserts.ts';
import type { RevenueCatConfig } from './config.ts';
import {
  normalizeRevenueCatEvent,
  type RevenueCatEvent,
  RevenueCatEvidenceError,
} from './normalization.ts';

const config: RevenueCatConfig = {
  webhookAuthorization: 'Bearer synthetic',
  webhookSignatureSecrets: ['synthetic-signature'],
  reconciliationAuthorization: 'Bearer synthetic-reconcile',
  apiKey: 'synthetic-api-key',
  apiBaseUrl: 'https://api.revenuecat.test/v2',
  accountId: 'acct_synthetic',
  projectId: 'proj_synthetic',
  environment: 'sandbox',
  apps: {
    app_apple: {
      accountId: 'acct_synthetic',
      projectId: 'proj_synthetic',
      store: 'APP_STORE',
    },
  },
  products: {
    plus_monthly: { logicalProduct: 'base_plan', tier: 'plus' },
    premium_monthly: { logicalProduct: 'base_plan', tier: 'premium' },
    family_monthly: { logicalProduct: 'base_plan', tier: 'family' },
  },
};

const NOW = Date.parse('2026-09-06T12:00:00Z');
const END = Date.parse('2026-10-06T12:00:00Z');
const GRACE_END = Date.parse('2026-09-10T12:00:00Z');

function event(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_synthetic',
    type: 'INITIAL_PURCHASE',
    event_timestamp_ms: NOW,
    app_id: 'app_apple',
    app_user_id: '44010000-0000-4000-8000-000000000001',
    original_app_user_id: '44010000-0000-4000-8000-000000000001',
    aliases: [],
    product_id: 'plus_monthly',
    period_type: 'NORMAL',
    purchased_at_ms: NOW,
    expiration_at_ms: END,
    environment: 'SANDBOX',
    store: 'APP_STORE',
    original_transaction_id: 'txn_synthetic',
    ...overrides,
  };
}

const lifecycleCases: Array<{
  type: string;
  extra?: Partial<RevenueCatEvent>;
  eventType: string;
  lifecycle: string;
}> = [
  {
    type: 'INITIAL_PURCHASE',
    extra: { period_type: 'TRIAL' },
    eventType: 'trial_started',
    lifecycle: 'trialing',
  },
  { type: 'INITIAL_PURCHASE', eventType: 'activated', lifecycle: 'active' },
  { type: 'RENEWAL', eventType: 'renewed', lifecycle: 'active' },
  { type: 'UNCANCELLATION', eventType: 'reactivated', lifecycle: 'active' },
  {
    type: 'CANCELLATION',
    extra: { cancel_reason: 'UNSUBSCRIBE' },
    eventType: 'cancelled',
    lifecycle: 'cancelled_paid_through',
  },
  {
    type: 'BILLING_ISSUE',
    extra: { grace_period_expiration_at_ms: GRACE_END },
    eventType: 'past_due',
    lifecycle: 'past_due_grace',
  },
  {
    type: 'SUBSCRIPTION_PAUSED',
    eventType: 'paused',
    lifecycle: 'paused_paid_through',
  },
  { type: 'EXPIRATION', eventType: 'expired', lifecycle: 'expired' },
  {
    type: 'CANCELLATION',
    extra: { cancel_reason: 'REFUND' },
    eventType: 'refunded',
    lifecycle: 'refunded',
  },
  {
    type: 'CANCELLATION',
    extra: { cancel_reason: 'CHARGEBACK' },
    eventType: 'chargeback',
    lifecycle: 'chargeback',
  },
  {
    type: 'PRODUCT_CHANGE',
    extra: { new_product_id: 'premium_monthly' },
    eventType: 'quantity_changed',
    lifecycle: 'active',
  },
];

for (const testCase of lifecycleCases) {
  Deno.test(`RevenueCat normalizes ${testCase.type}/${testCase.lifecycle}`, () => {
    const result = normalizeRevenueCatEvent(
      event({ type: testCase.type, ...testCase.extra }),
      config,
      null,
    );
    assertEquals(result.evidence?.eventType, testCase.eventType);
    assertEquals(result.evidence?.lifecycle, testCase.lifecycle);
  });
}

Deno.test('RevenueCat uses reviewed product mapping and immutable Family intent', () => {
  const unknown = normalizeRevenueCatEvent(event({ product_id: 'unreviewed_sku' }), config, null);
  assertEquals(unknown.evidence, null);
  assertEquals(unknown.ignoredReason, 'unknown_product');

  const unbound = normalizeRevenueCatEvent(event({ product_id: 'family_monthly' }), config, null);
  assertEquals(unbound.ignoredReason, 'family_binding_required');

  const bound = normalizeRevenueCatEvent(
    event({ product_id: 'family_monthly' }),
    config,
    '44010000-0000-4000-8000-000000000099',
  );
  assertEquals(bound.evidence?.boundHouseholdId, '44010000-0000-4000-8000-000000000099');
  assertEquals(bound.evidence?.quantity, 1);
});

Deno.test('RevenueCat ignores provider quantity when applying a reviewed plan change', () => {
  const result = normalizeRevenueCatEvent(
    {
      ...event({
        type: 'PRODUCT_CHANGE',
        new_product_id: 'premium_monthly',
      }),
      quantity: 999,
    } as RevenueCatEvent,
    config,
    null,
  );
  assertEquals(result.evidence?.tier, 'premium');
  assertEquals(result.evidence?.quantity, 1);
});

Deno.test('RevenueCat rejects wrong app, store, environment, and authenticated subject', () => {
  for (const invalid of [
    event({ app_id: 'app_other' }),
    event({ store: 'PLAY_STORE' }),
    event({ environment: 'PRODUCTION' }),
  ]) {
    assertThrows(
      () => normalizeRevenueCatEvent(invalid, config, null),
      RevenueCatEvidenceError,
      'invalid_source',
    );
  }
  assertThrows(
    () => normalizeRevenueCatEvent(event(), config, null, '44010000-0000-4000-8000-000000000002'),
    RevenueCatEvidenceError,
    'subject_mismatch',
  );
});

Deno.test('unknown RevenueCat event types grant nothing', () => {
  const result = normalizeRevenueCatEvent(
    event({ type: 'TEMPORARY_ENTITLEMENT_GRANT' }),
    config,
    null,
  );
  assertEquals(result.evidence, null);
  assertEquals(result.ignoredReason, 'unknown_event');
});
