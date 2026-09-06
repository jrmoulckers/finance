// SPDX-License-Identifier: BUSL-1.1

import type { RevenueCatConfig } from './config.ts';
import type { NormalizedBillingEvidence, RevenueCatEvent } from './normalization.ts';
import type { EntitlementProjection, RevenueCatIdentity, RevenueCatStore } from './store.ts';

export const TEST_USER_ID = '44010000-0000-4000-8000-000000000001';
export const TEST_HOUSEHOLD_ID = '44010000-0000-4000-8000-000000000002';

export const TEST_REVENUECAT_CONFIG: RevenueCatConfig = {
  webhookAuthorization: 'Bearer synthetic-webhook',
  webhookSignatureSecrets: ['synthetic-current', 'synthetic-previous'],
  reconciliationAuthorization: 'Bearer synthetic-reconciliation',
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
    app_google: {
      accountId: 'acct_synthetic',
      projectId: 'proj_synthetic',
      store: 'PLAY_STORE',
    },
  },
  products: {
    plus_monthly: { logicalProduct: 'base_plan', tier: 'plus' },
    premium_monthly: { logicalProduct: 'base_plan', tier: 'premium' },
    family_monthly: { logicalProduct: 'base_plan', tier: 'family' },
  },
};

export function testRevenueCatEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt_synthetic',
    type: 'INITIAL_PURCHASE',
    event_timestamp_ms: Date.parse('2026-09-06T12:00:00Z'),
    app_id: 'app_apple',
    app_user_id: TEST_USER_ID,
    original_app_user_id: TEST_USER_ID,
    aliases: [],
    product_id: 'plus_monthly',
    period_type: 'NORMAL',
    purchased_at_ms: Date.parse('2026-09-06T12:00:00Z'),
    expiration_at_ms: Date.parse('2026-10-06T12:00:00Z'),
    environment: 'SANDBOX',
    store: 'APP_STORE',
    original_transaction_id: 'txn_synthetic',
    ...overrides,
  };
}

const PRECEDENCE: Record<string, number> = {
  trialing: 10,
  active: 20,
  cancelled_paid_through: 30,
  past_due_grace: 40,
  paused_paid_through: 50,
  expired: 60,
  refunded: 70,
  chargeback: 80,
};

export class MemoryRevenueCatStore implements RevenueCatStore {
  readonly appended: NormalizedBillingEvidence[] = [];
  readonly identities: RevenueCatIdentity[] = [
    {
      id: '44010000-0000-4000-8000-000000000010',
      billingAccountId: '44010000-0000-4000-8000-000000000011',
      customerId: TEST_USER_ID,
      environment: 'sandbox',
    },
  ];
  private readonly eventIds = new Set<string>();
  private current: NormalizedBillingEvidence | null = null;
  householdMember = true;

  bindCustomer(
    ownerId: string,
    _customerId: string,
    _environment: 'sandbox' | 'production',
  ): Promise<RevenueCatIdentity> {
    if (ownerId !== TEST_USER_ID) throw new Error('unexpected test owner');
    return Promise.resolve(this.identities[0]);
  }

  findIdentity(
    customerIds: readonly string[],
    _environment: 'sandbox' | 'production',
  ): Promise<RevenueCatIdentity | null> {
    return Promise.resolve(
      customerIds.includes(this.identities[0].customerId) ? this.identities[0] : null,
    );
  }

  listIdentities(): Promise<readonly RevenueCatIdentity[]> {
    return Promise.resolve(this.identities);
  }

  verifyHouseholdMembership(): Promise<boolean> {
    return Promise.resolve(this.householdMember);
  }

  findFamilyBinding(): Promise<string | null> {
    return Promise.resolve(this.current?.tier === 'family' ? this.current.boundHouseholdId : null);
  }

  appendAndApply(
    _identity: RevenueCatIdentity,
    evidence: NormalizedBillingEvidence,
  ): Promise<boolean> {
    if (this.eventIds.has(evidence.providerEventId)) {
      return Promise.resolve(false);
    }
    this.eventIds.add(evidence.providerEventId);
    this.appended.push(evidence);

    const current = this.current;
    const incomingTime = Date.parse(evidence.effectiveAt);
    const currentTime = current ? Date.parse(current.effectiveAt) : -1;
    const irreversible = current?.lifecycle === 'refunded' || current?.lifecycle === 'chargeback';
    const orderedAfter =
      incomingTime > currentTime ||
      (incomingTime === currentTime &&
        (evidence.providerOrder > (current?.providerOrder ?? -1) ||
          (evidence.providerOrder === current?.providerOrder &&
            PRECEDENCE[evidence.lifecycle] > PRECEDENCE[current.lifecycle])));
    if (!irreversible && orderedAfter) {
      this.current = evidence;
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  getProjection(_ownerId: string, householdId: string | null): Promise<EntitlementProjection> {
    const tier = this.current?.tier;
    return Promise.resolve({
      userTier: !tier || tier === 'family' ? 'free' : tier,
      householdTier: householdId ? (tier === 'family' ? 'family' : 'free') : null,
      bankConnectionAllowance: tier === 'family' ? 4 : 0,
      isPremiumSponsor: false,
      isFamilyBound: tier === 'family',
      effectiveAt: this.current?.effectiveAt ?? '2026-09-06T12:00:00.000Z',
      expiresAt: this.current?.currentPeriodEnd ?? null,
      projectionVersion: this.appended.length + 1,
      serverTime: '2026-09-06T12:00:01.000Z',
    });
  }
}
