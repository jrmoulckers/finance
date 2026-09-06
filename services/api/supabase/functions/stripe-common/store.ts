// SPDX-License-Identifier: BUSL-1.1

import { createAdminClient } from '../_shared/auth.ts';
import {
  type BillingContext,
  type NormalizedBillingEvidence,
  type StripeEnvironment,
  type StripeGateway,
  StripeServiceError,
} from './types.ts';

type AdminClient = ReturnType<typeof createAdminClient>;

export async function ensureStripeBillingContext(input: {
  supabase: AdminClient;
  gateway: StripeGateway;
  ownerId: string;
  environment: StripeEnvironment;
}): Promise<BillingContext & { providerCustomerId: string }> {
  const { supabase, gateway, ownerId, environment } = input;
  const { data: existingAccount, error: accountLookupError } = await supabase
    .from('billing_accounts')
    .select('id')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (accountLookupError) {
    throw new StripeServiceError('Billing account lookup failed', true);
  }

  const existingBillingAccountId = (existingAccount as { id?: string } | null)?.id;
  const billingAccountId =
    existingBillingAccountId ?? (await createBillingAccount(supabase, ownerId));

  const existingIdentity = await findPrimaryIdentity(supabase, billingAccountId, environment);
  if (existingIdentity) {
    return {
      billingAccountId,
      providerIdentityId: existingIdentity.id,
      providerCustomerId: existingIdentity.provider_customer_id,
    };
  }

  const customer = await gateway.createCustomer({
    ownerId,
    idempotencyKey: `finance-customer:${environment}:${billingAccountId}`,
  });
  const { data: identity, error: identityError } = await supabase
    .from('billing_provider_identities')
    .insert({
      billing_account_id: billingAccountId,
      provider: 'stripe',
      environment,
      provider_customer_id: customer.id,
      is_primary: true,
    })
    .select('id, provider_customer_id')
    .single();
  if (
    identityError ||
    typeof identity?.id !== 'string' ||
    typeof identity.provider_customer_id !== 'string'
  ) {
    const concurrentIdentity = await findPrimaryIdentity(supabase, billingAccountId, environment);
    if (!concurrentIdentity) {
      throw new StripeServiceError('Billing identity creation failed', true);
    }
    return {
      billingAccountId,
      providerIdentityId: concurrentIdentity.id,
      providerCustomerId: concurrentIdentity.provider_customer_id,
    };
  }
  return {
    billingAccountId,
    providerIdentityId: identity.id,
    providerCustomerId: identity.provider_customer_id,
  };
}

async function createBillingAccount(supabase: AdminClient, ownerId: string): Promise<string> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .upsert({ owner_id: ownerId }, { onConflict: 'owner_id' })
    .select('id')
    .single();
  if (error || typeof data?.id !== 'string') {
    throw new StripeServiceError('Billing account creation failed', true);
  }
  return data.id;
}

export async function findStripeBillingContext(input: {
  supabase: AdminClient;
  providerCustomerId: string;
  environment: StripeEnvironment;
}): Promise<BillingContext | null> {
  const { data, error } = await input.supabase
    .from('billing_provider_identities')
    .select('id, billing_account_id')
    .eq('provider', 'stripe')
    .eq('environment', input.environment)
    .eq('provider_customer_id', input.providerCustomerId)
    .maybeSingle();
  if (error) {
    throw new StripeServiceError('Billing identity lookup failed', true);
  }
  if (!data) return null;
  return {
    billingAccountId: data.billing_account_id as string,
    providerIdentityId: data.id as string,
  };
}

export async function findOwnedStripeIdentity(input: {
  supabase: AdminClient;
  ownerId: string;
  environment: StripeEnvironment;
}): Promise<(BillingContext & { providerCustomerId: string }) | null> {
  const { data: account, error: accountError } = await input.supabase
    .from('billing_accounts')
    .select('id')
    .eq('owner_id', input.ownerId)
    .maybeSingle();
  if (accountError) {
    throw new StripeServiceError('Billing account lookup failed', true);
  }
  if (!account) return null;
  const identity = await findPrimaryIdentity(
    input.supabase,
    account.id as string,
    input.environment,
  );
  return identity
    ? {
        billingAccountId: account.id as string,
        providerIdentityId: identity.id,
        providerCustomerId: identity.provider_customer_id,
      }
    : null;
}

export async function recordAndApplyStripeEvidence(input: {
  supabase: AdminClient;
  context: BillingContext;
  environment: StripeEnvironment;
  evidence: NormalizedBillingEvidence;
  receivedAt?: string;
}): Promise<void> {
  const { evidence, context, environment, supabase } = input;
  const { data: eventId, error: recordError } = await supabase.rpc(
    'record_billing_provider_event',
    {
      p_billing_account_id: context.billingAccountId,
      p_provider_identity_id: context.providerIdentityId,
      p_provider: 'stripe',
      p_environment: environment,
      p_provider_event_id: evidence.providerEventId,
      p_provider_subscription_id: evidence.providerSubscriptionId,
      p_provider_subscription_item_id: evidence.providerSubscriptionItemId,
      p_received_at: input.receivedAt ?? new Date().toISOString(),
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
    },
  );
  if (recordError || typeof eventId !== 'string') {
    throw new StripeServiceError('Billing evidence could not be recorded', true);
  }

  const { data: applied, error: applyError } = await supabase.rpc('apply_billing_provider_event', {
    p_event_id: eventId,
  });
  if (applyError) {
    throw new StripeServiceError('Billing evidence could not be applied', true);
  }
  if (applied === true && evidence.premiumSponsorshipHouseholdId && grantsPaidAccess(evidence)) {
    await applyPremiumSponsorshipIntent({
      supabase,
      billingAccountId: context.billingAccountId,
      householdId: evidence.premiumSponsorshipHouseholdId,
    });
  }
}

export async function requireHouseholdMembership(input: {
  supabase: AdminClient;
  ownerId: string;
  householdId: string;
}): Promise<void> {
  const { data, error } = await input.supabase
    .from('household_members')
    .select('id')
    .eq('user_id', input.ownerId)
    .eq('household_id', input.householdId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    throw new StripeServiceError('Household eligibility check failed', true);
  }
  if (!data) {
    throw new StripeServiceError('Household is not eligible for this purchase', false);
  }
}

export async function requirePremiumAddonEligibility(input: {
  supabase: AdminClient;
  billingAccountId: string;
  householdId: string;
}): Promise<void> {
  const { data: account, error: accountError } = await input.supabase
    .from('billing_accounts')
    .select('premium_sponsored_household_id')
    .eq('id', input.billingAccountId)
    .maybeSingle();
  if (accountError) {
    throw new StripeServiceError('Billing eligibility check failed', true);
  }
  if (account?.premium_sponsored_household_id !== input.householdId) {
    throw new StripeServiceError('An active sponsored Premium household is required', false);
  }

  const now = new Date().toISOString();
  const { data: subscription, error: subscriptionError } = await input.supabase
    .from('billing_subscriptions')
    .select('id')
    .eq('billing_account_id', input.billingAccountId)
    .eq('logical_product', 'base_plan')
    .eq('tier', 'premium')
    .in('lifecycle', [
      'trialing',
      'active',
      'cancelled_paid_through',
      'past_due_grace',
      'paused_paid_through',
    ])
    .or(`current_period_end.gt.${now},grace_end.gt.${now}`)
    .limit(1)
    .maybeSingle();
  if (subscriptionError) {
    throw new StripeServiceError('Billing eligibility check failed', true);
  }
  if (!subscription) {
    throw new StripeServiceError('An active sponsored Premium household is required', false);
  }
}

async function findPrimaryIdentity(
  supabase: AdminClient,
  billingAccountId: string,
  environment: StripeEnvironment,
): Promise<{ id: string; provider_customer_id: string } | null> {
  const { data, error } = await supabase
    .from('billing_provider_identities')
    .select('id, provider_customer_id')
    .eq('billing_account_id', billingAccountId)
    .eq('provider', 'stripe')
    .eq('environment', environment)
    .eq('is_primary', true)
    .maybeSingle();
  if (error) {
    throw new StripeServiceError('Billing identity lookup failed', true);
  }
  return data as { id: string; provider_customer_id: string } | null;
}

function grantsPaidAccess(evidence: NormalizedBillingEvidence): boolean {
  return (
    evidence.lifecycle === 'trialing' ||
    evidence.lifecycle === 'active' ||
    evidence.lifecycle === 'cancelled_paid_through' ||
    evidence.lifecycle === 'past_due_grace' ||
    evidence.lifecycle === 'paused_paid_through'
  );
}

async function applyPremiumSponsorshipIntent(input: {
  supabase: AdminClient;
  billingAccountId: string;
  householdId: string;
}): Promise<void> {
  const { data: account, error: accountError } = await input.supabase
    .from('billing_accounts')
    .select('owner_id')
    .eq('id', input.billingAccountId)
    .maybeSingle();
  if (accountError || typeof account?.owner_id !== 'string') {
    throw new StripeServiceError('Premium sponsorship validation failed', true);
  }
  await requireHouseholdMembership({
    supabase: input.supabase,
    ownerId: account.owner_id,
    householdId: input.householdId,
  });
  const { error: updateError } = await input.supabase
    .from('billing_accounts')
    .update({
      premium_sponsored_household_id: input.householdId,
      sponsorship_updated_at: new Date().toISOString(),
    })
    .eq('id', input.billingAccountId);
  if (updateError) {
    throw new StripeServiceError('Premium sponsorship update failed', true);
  }
  const { error: rebuildError } = await input.supabase.rpc('rebuild_billing_entitlements', {
    p_billing_account_id: input.billingAccountId,
  });
  if (rebuildError) {
    throw new StripeServiceError('Premium sponsorship rebuild failed', true);
  }
}
