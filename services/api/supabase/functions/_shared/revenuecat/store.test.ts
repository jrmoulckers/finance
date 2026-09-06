// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import { appendAndApplyRevenueCatEvent, type RevenueCatIdentity } from './store.ts';
import type { NormalizedBillingEvidence } from './normalization.ts';

Deno.test('RevenueCat store records then applies through service-role RPCs only', async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const client = {
    rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return Promise.resolve({
        data:
          name === 'resolve_revenuecat_purchase_binding'
            ? 'store-original-synthetic'
            : name === 'record_billing_provider_event'
              ? '44010000-0000-4000-8000-000000000010'
              : true,
        error: null,
      });
    },
  };
  const identity: RevenueCatIdentity = {
    id: '44010000-0000-4000-8000-000000000011',
    billingAccountId: '44010000-0000-4000-8000-000000000012',
    customerId: 'synthetic-customer',
    environment: 'sandbox',
  };
  const evidence: NormalizedBillingEvidence = {
    provider: 'revenuecat',
    environment: 'sandbox',
    providerEventId: 'evt_synthetic',
    providerSubscriptionId: 'store-original-synthetic',
    revenueCatSubscriptionId: 'sub_synthetic',
    storeTransactionIds: ['store-original-synthetic', 'store-renewal-synthetic'],
    providerSubscriptionItemId: null,
    effectiveAt: '2026-09-06T12:00:00.000Z',
    providerOrder: 1788696000000,
    eventType: 'activated',
    lifecycle: 'active',
    logicalProduct: 'base_plan',
    tier: 'plus',
    quantity: 1,
    currentPeriodEnd: '2026-10-06T12:00:00.000Z',
    graceEnd: null,
    terminalAt: null,
    boundHouseholdId: null,
    trustedReactivation: false,
  };

  assertEquals(await appendAndApplyRevenueCatEvent(client, identity, evidence), {
    applied: true,
    providerSubscriptionId: 'store-original-synthetic',
  });
  assertEquals(
    calls.map((call) => call.name),
    [
      'resolve_revenuecat_purchase_binding',
      'record_billing_provider_event',
      'apply_billing_provider_event',
    ],
  );
  assertEquals(calls[0].params.p_revenuecat_subscription_id, 'sub_synthetic');
  assertEquals(calls[0].params.p_store_transaction_ids, [
    'store-original-synthetic',
    'store-renewal-synthetic',
  ]);
  assertEquals(calls[1].params.p_provider_subscription_id, 'store-original-synthetic');
  assertEquals(calls[1].params.p_normalized_tier, 'plus');
  assertEquals(calls[1].params.p_normalized_quantity, 1);
  assertEquals(calls[2].params.p_event_id, '44010000-0000-4000-8000-000000000010');
});

Deno.test(
  'RevenueCat store preserves a canonical binding returned from shared aliases',
  async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client = {
      rpc(name: string, params: Record<string, unknown>) {
        calls.push({ name, params });
        return Promise.resolve({
          data:
            name === 'resolve_revenuecat_purchase_binding'
              ? 'store-canonical-existing'
              : name === 'record_billing_provider_event'
                ? '44010000-0000-4000-8000-000000000020'
                : true,
          error: null,
        });
      },
    };
    const identity: RevenueCatIdentity = {
      id: '44010000-0000-4000-8000-000000000021',
      billingAccountId: '44010000-0000-4000-8000-000000000022',
      customerId: 'synthetic-customer',
      environment: 'sandbox',
    };
    const evidence: NormalizedBillingEvidence = {
      provider: 'revenuecat',
      environment: 'sandbox',
      providerEventId: 'evt_cross_surface',
      providerSubscriptionId: 'webhook-original-distinct',
      revenueCatSubscriptionId: null,
      storeTransactionIds: ['webhook-original-distinct', 'renewal-shared'],
      providerSubscriptionItemId: null,
      effectiveAt: '2026-09-06T12:00:00.000Z',
      providerOrder: 1788696000000,
      eventType: 'refunded',
      lifecycle: 'refunded',
      logicalProduct: 'base_plan',
      tier: 'plus',
      quantity: 1,
      currentPeriodEnd: null,
      graceEnd: null,
      terminalAt: '2026-09-06T12:00:00.000Z',
      boundHouseholdId: null,
      trustedReactivation: false,
    };

    assertEquals(await appendAndApplyRevenueCatEvent(client, identity, evidence), {
      applied: true,
      providerSubscriptionId: 'store-canonical-existing',
    });
    assertEquals(
      calls.find((call) => call.name === 'record_billing_provider_event')?.params
        .p_provider_subscription_id,
      'store-canonical-existing',
    );
  },
);
