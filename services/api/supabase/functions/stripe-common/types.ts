// SPDX-License-Identifier: BUSL-1.1

export type StripeEnvironment = 'sandbox' | 'production';
export type BillingTier = 'plus' | 'premium' | 'family';
export type BillingLogicalProduct = 'base_plan' | 'premium_bank_addon';
export type BillingLifecycle =
  | 'trialing'
  | 'active'
  | 'cancelled_paid_through'
  | 'past_due_grace'
  | 'paused_paid_through'
  | 'expired'
  | 'refunded'
  | 'chargeback';
export type BillingEventType =
  | 'trial_started'
  | 'activated'
  | 'renewed'
  | 'cancelled'
  | 'past_due'
  | 'paused'
  | 'expired'
  | 'refunded'
  | 'chargeback'
  | 'reactivated'
  | 'quantity_changed';

export type StripeCatalogChoice =
  | 'plus_monthly'
  | 'plus_yearly'
  | 'premium_monthly'
  | 'premium_yearly'
  | 'family_monthly'
  | 'family_yearly'
  | 'premium_bank_addon_monthly';

export interface StripeCatalogEntry {
  choice: StripeCatalogChoice;
  priceId: string;
  logicalProduct: BillingLogicalProduct;
  tier: BillingTier | null;
  quantity: number;
  requiresHousehold: boolean;
}

export interface StripeAccount {
  id: string;
}

export interface StripeSubscriptionItem {
  id: string;
  price: { id: string };
  quantity: number | null;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  livemode: boolean;
  cancel_at_period_end: boolean;
  current_period_end: number;
  trial_end: number | null;
  canceled_at: number | null;
  ended_at: number | null;
  latest_invoice: string | null;
  pause_collection: { behavior: string } | null;
  metadata: Record<string, string>;
  items: { data: StripeSubscriptionItem[] };
}

export interface StripeInvoice {
  id: string;
  subscription: string | null;
  charge: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' | null;
  livemode: boolean;
  next_payment_attempt: number | null;
  status_transitions?: { paid_at?: number | null };
}

export interface StripeCharge {
  id: string;
  invoice: string | null;
  refunded: boolean;
  livemode: boolean;
}

export interface StripeDispute {
  id: string;
  charge: string;
  livemode: boolean;
  created: number;
}

export interface StripeRefund {
  id: string;
  charge: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled' | null;
  livemode: boolean;
  created: number;
}

export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  account?: string;
  data: {
    object: unknown;
    previous_attributes?: Record<string, unknown>;
  };
}

export interface StripeGateway {
  retrieveAccount(): Promise<StripeAccount>;
  createCustomer(input: { ownerId: string; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckoutSession(input: {
    customerId: string;
    entry: StripeCatalogEntry;
    billingAccountId: string;
    ownerId: string;
    householdId: string | null;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ url: string | null }>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string | null }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscription>;
  retrieveInvoice(invoiceId: string): Promise<StripeInvoice>;
  retrieveCharge(chargeId: string): Promise<StripeCharge>;
  listSubscriptions(customerId: string): Promise<StripeSubscription[]>;
}

export interface NormalizedBillingEvidence {
  providerEventId: string;
  providerSubscriptionId: string;
  providerSubscriptionItemId: string | null;
  effectiveAt: string;
  providerOrder: number;
  eventType: BillingEventType;
  lifecycle: BillingLifecycle;
  logicalProduct: BillingLogicalProduct;
  tier: BillingTier | null;
  quantity: number;
  currentPeriodEnd: string | null;
  graceEnd: string | null;
  terminalAt: string | null;
  boundHouseholdId: string | null;
  premiumSponsorshipHouseholdId: string | null;
  trustedReactivation: boolean;
  providerCustomerId: string;
}

export interface BillingContext {
  billingAccountId: string;
  providerIdentityId: string;
}

export interface BillingProjection {
  user_display_tier: 'free' | 'plus' | 'premium';
  household_display_tier: 'free' | 'premium' | 'family' | null;
  bank_connection_allowance: number;
  is_premium_sponsor: boolean;
  is_family_bound: boolean;
  effective_at: string;
  expires_at: string | null;
  projection_version: number;
  server_time: string;
}

export class StripeServiceError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'StripeServiceError';
  }
}

export class StripeRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
    this.name = 'StripeRequestError';
  }
}
