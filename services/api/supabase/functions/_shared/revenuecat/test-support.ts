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
    plus_monthly: {
      appId: 'app_apple',
      logicalProduct: 'base_plan',
      tier: 'plus',
    },
    premium_monthly: {
      appId: 'app_apple',
      logicalProduct: 'base_plan',
      tier: 'premium',
    },
    family_monthly: {
      appId: 'app_apple',
      logicalProduct: 'base_plan',
      tier: 'family',
    },
    plus_google: {
      appId: 'app_google',
      logicalProduct: 'base_plan',
      tier: 'plus',
    },
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
  private readonly purchaseAliases = new Map<string, string>();
  private current: NormalizedBillingEvidence | null = null;
  householdMember = true;
  identityPageRequests = 0;

  currentEvidence(): NormalizedBillingEvidence | null {
    return this.current;
  }

  canonicalPurchaseId(aliasKind: 'revenuecat' | 'store', alias: string): string | null {
    return this.purchaseAliases.get(`${aliasKind}:${alias}`) ?? null;
  }

  purchaseBindingCount(): number {
    return new Set(this.purchaseAliases.values()).size;
  }

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

  listIdentities(
    _environment: 'sandbox' | 'production',
    offset: number,
    limit: number,
  ): Promise<readonly RevenueCatIdentity[]> {
    this.identityPageRequests++;
    return Promise.resolve(
      this.identities
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(offset, offset + limit),
    );
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
    const aliasKeys = [
      ...evidence.storeTransactionIds.map((alias) => `store:${alias}`),
      ...(evidence.revenueCatSubscriptionId
        ? [`revenuecat:${evidence.revenueCatSubscriptionId}`]
        : []),
    ];
    const knownBindings = new Set(
      aliasKeys
        .map((alias) => this.purchaseAliases.get(alias))
        .filter((binding): binding is string => Boolean(binding)),
    );
    if (knownBindings.size > 1) throw new Error('conflicting test purchase aliases');
    const canonicalPurchaseId =
      knownBindings.values().next().value ?? evidence.providerSubscriptionId;
    if (canonicalPurchaseId !== evidence.providerSubscriptionId) {
      throw new Error('conflicting test canonical purchase identity');
    }
    for (const alias of aliasKeys) this.purchaseAliases.set(alias, canonicalPurchaseId);

    const canonicalEvidence = {
      ...evidence,
      providerSubscriptionId: canonicalPurchaseId,
    };
    if (this.eventIds.has(evidence.providerEventId)) {
      return Promise.resolve(false);
    }
    this.eventIds.add(evidence.providerEventId);
    this.appended.push(canonicalEvidence);

    const current = this.current;
    const incomingTime = Date.parse(canonicalEvidence.effectiveAt);
    const currentTime = current ? Date.parse(current.effectiveAt) : -1;
    const irreversible = current?.lifecycle === 'refunded' || current?.lifecycle === 'chargeback';
    const orderedAfter =
      incomingTime > currentTime ||
      (incomingTime === currentTime &&
        (canonicalEvidence.providerOrder > (current?.providerOrder ?? -1) ||
          (canonicalEvidence.providerOrder === current?.providerOrder &&
            PRECEDENCE[canonicalEvidence.lifecycle] > PRECEDENCE[current.lifecycle])));
    if (!irreversible && orderedAfter) {
      this.current = canonicalEvidence;
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  getProjection(_ownerId: string, householdId: string | null): Promise<EntitlementProjection> {
    const grantsAccess =
      this.current && !['expired', 'refunded', 'chargeback'].includes(this.current.lifecycle);
    const tier = grantsAccess ? this.current?.tier : undefined;
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
