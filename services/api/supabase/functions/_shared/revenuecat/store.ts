// SPDX-License-Identifier: BUSL-1.1

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type { BillingEnvironment } from './config.ts';
import type { NormalizedBillingEvidence } from './normalization.ts';

export interface RevenueCatIdentity {
  id: string;
  billingAccountId: string;
  customerId: string;
  environment: BillingEnvironment;
}

export interface EntitlementProjection {
  userTier: 'free' | 'plus' | 'premium';
  householdTier: 'free' | 'premium' | 'family' | null;
  bankConnectionAllowance: number;
  isPremiumSponsor: boolean;
  isFamilyBound: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  projectionVersion: number;
  serverTime: string;
}

export interface RevenueCatStore {
  bindCustomer(
    ownerId: string,
    customerId: string,
    environment: BillingEnvironment,
  ): Promise<RevenueCatIdentity>;
  findIdentity(
    customerIds: readonly string[],
    environment: BillingEnvironment,
  ): Promise<RevenueCatIdentity | null>;
  listIdentities(
    environment: BillingEnvironment,
    offset: number,
    limit: number,
  ): Promise<readonly RevenueCatIdentity[]>;
  verifyHouseholdMembership(ownerId: string, householdId: string): Promise<boolean>;
  findFamilyBinding(
    evidence: Pick<NormalizedBillingEvidence, 'environment' | 'providerSubscriptionId'>,
  ): Promise<string | null>;
  appendAndApply(
    identity: RevenueCatIdentity,
    evidence: NormalizedBillingEvidence,
  ): Promise<boolean>;
  getProjection(ownerId: string, householdId: string | null): Promise<EntitlementProjection>;
}

export class RevenueCatStoreError extends Error {
  constructor() {
    super('RevenueCat persistence operation failed');
    this.name = 'RevenueCatStoreError';
  }
}

interface RpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function appendAndApplyRevenueCatEvent(
  client: RpcClient,
  identity: RevenueCatIdentity,
  evidence: NormalizedBillingEvidence,
): Promise<boolean> {
  const binding = await client.rpc('resolve_revenuecat_purchase_binding', {
    p_billing_account_id: identity.billingAccountId,
    p_environment: evidence.environment,
    p_revenuecat_subscription_id: evidence.revenueCatSubscriptionId,
    p_canonical_store_transaction_id: evidence.providerSubscriptionId,
    p_store_transaction_ids: evidence.storeTransactionIds,
  });
  if (
    binding.error ||
    typeof binding.data !== 'string' ||
    binding.data !== evidence.providerSubscriptionId
  ) {
    throw new RevenueCatStoreError();
  }

  const recorded = await client.rpc('record_billing_provider_event', {
    p_billing_account_id: identity.billingAccountId,
    p_provider_identity_id: identity.id,
    p_provider: 'revenuecat',
    p_environment: evidence.environment,
    p_provider_event_id: evidence.providerEventId,
    p_provider_subscription_id: binding.data,
    p_provider_subscription_item_id: null,
    p_received_at: new Date().toISOString(),
    p_effective_at: evidence.effectiveAt,
    p_provider_order: evidence.providerOrder,
    p_event_type: evidence.eventType,
    p_normalized_lifecycle: evidence.lifecycle,
    p_normalized_logical_product: evidence.logicalProduct,
    p_normalized_tier: evidence.tier,
    p_normalized_quantity: evidence.quantity,
    p_normalized_current_period_end: evidence.currentPeriodEnd,
    p_normalized_grace_end: evidence.graceEnd,
    p_normalized_terminal_at: evidence.terminalAt,
    p_normalized_bound_household_id: evidence.boundHouseholdId,
    p_trusted_reactivation: evidence.trustedReactivation,
  });
  if (recorded.error || typeof recorded.data !== 'string') {
    throw new RevenueCatStoreError();
  }

  const applied = await client.rpc('apply_billing_provider_event', {
    p_event_id: recorded.data,
  });
  if (applied.error) throw new RevenueCatStoreError();
  return applied.data === true;
}

function rowIdentity(row: Record<string, unknown>): RevenueCatIdentity {
  return {
    id: String(row.id),
    billingAccountId: String(row.billing_account_id),
    customerId: String(row.provider_customer_id),
    environment: String(row.environment) as BillingEnvironment,
  };
}

export function createRevenueCatStore(
  client: SupabaseClient,
  projectionClient?: SupabaseClient,
): RevenueCatStore {
  return {
    async bindCustomer(ownerId, customerId, environment) {
      const accountResult = await client
        .from('billing_accounts')
        .upsert({ owner_id: ownerId }, { onConflict: 'owner_id' })
        .select('id')
        .single();
      if (accountResult.error || !accountResult.data) {
        throw new RevenueCatStoreError();
      }

      const existing = await client
        .from('billing_provider_identities')
        .select('id, billing_account_id, provider_customer_id, environment')
        .eq('provider', 'revenuecat')
        .eq('environment', environment)
        .eq('provider_customer_id', customerId)
        .maybeSingle();
      if (existing.error) throw new RevenueCatStoreError();
      if (existing.data) {
        const identity = rowIdentity(existing.data);
        if (identity.billingAccountId !== accountResult.data.id) {
          throw new RevenueCatStoreError();
        }
        return identity;
      }

      const inserted = await client
        .from('billing_provider_identities')
        .insert({
          billing_account_id: accountResult.data.id,
          provider: 'revenuecat',
          environment,
          provider_customer_id: customerId,
          is_primary: true,
        })
        .select('id, billing_account_id, provider_customer_id, environment')
        .single();
      if (inserted.error || !inserted.data) {
        const raced = await client
          .from('billing_provider_identities')
          .select('id, billing_account_id, provider_customer_id, environment')
          .eq('provider', 'revenuecat')
          .eq('environment', environment)
          .eq('provider_customer_id', customerId)
          .maybeSingle();
        if (raced.error || !raced.data) throw new RevenueCatStoreError();
        const identity = rowIdentity(raced.data);
        if (identity.billingAccountId !== accountResult.data.id) {
          throw new RevenueCatStoreError();
        }
        return identity;
      }
      return rowIdentity(inserted.data);
    },

    async findIdentity(customerIds, environment) {
      if (customerIds.length === 0) return null;
      const result = await client
        .from('billing_provider_identities')
        .select('id, billing_account_id, provider_customer_id, environment')
        .eq('provider', 'revenuecat')
        .eq('environment', environment)
        .in('provider_customer_id', [...customerIds])
        .limit(2);
      if (result.error) throw new RevenueCatStoreError();
      const rows = result.data ?? [];
      if (rows.length === 0) return null;
      if (new Set(rows.map((row) => row.billing_account_id)).size !== 1) {
        throw new RevenueCatStoreError();
      }
      return rowIdentity(rows[0]);
    },

    async listIdentities(environment, offset, limit) {
      const result = await client
        .from('billing_provider_identities')
        .select('id, billing_account_id, provider_customer_id, environment')
        .eq('provider', 'revenuecat')
        .eq('environment', environment)
        .eq('is_primary', true)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (result.error) throw new RevenueCatStoreError();
      return (result.data ?? []).map(rowIdentity);
    },

    async verifyHouseholdMembership(ownerId, householdId) {
      const result = await client
        .from('household_members')
        .select('id')
        .eq('user_id', ownerId)
        .eq('household_id', householdId)
        .is('deleted_at', null)
        .maybeSingle();
      if (result.error) throw new RevenueCatStoreError();
      return Boolean(result.data);
    },

    async findFamilyBinding(evidence) {
      const result = await client
        .from('billing_subscriptions')
        .select('historical_family_household_id')
        .eq('provider', 'revenuecat')
        .eq('environment', evidence.environment)
        .eq('provider_subscription_id', evidence.providerSubscriptionId)
        .maybeSingle();
      if (result.error) throw new RevenueCatStoreError();
      return result.data?.historical_family_household_id ?? null;
    },

    appendAndApply(identity, evidence) {
      return appendAndApplyRevenueCatEvent(client, identity, evidence);
    },

    async getProjection(_ownerId, householdId) {
      if (!projectionClient) throw new RevenueCatStoreError();
      const result = await projectionClient.rpc('get_my_entitlements', {
        p_household_id: householdId,
      });
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (result.error || !row || typeof row !== 'object') {
        throw new RevenueCatStoreError();
      }
      const projection = row as Record<string, unknown>;
      return {
        userTier: String(projection.user_display_tier) as 'free' | 'plus' | 'premium',
        householdTier: householdId
          ? (String(projection.household_display_tier) as 'free' | 'premium' | 'family')
          : null,
        bankConnectionAllowance: Number(projection.bank_connection_allowance),
        isPremiumSponsor: Boolean(projection.is_premium_sponsor),
        isFamilyBound: Boolean(projection.is_family_bound),
        effectiveAt: String(projection.effective_at),
        expiresAt: projection.expires_at ? String(projection.expires_at) : null,
        projectionVersion: Number(projection.projection_version),
        serverTime: String(projection.server_time),
      };
    },
  };
}
