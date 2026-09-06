// SPDX-License-Identifier: BUSL-1.1

import type { BillingEnvironment, PaidTier, RevenueCatConfig, RevenueCatStore } from './config.ts';
import { lifecycleFor, type NormalizedEventType, type NormalizedLifecycle } from './lifecycle.ts';
import { RevenueCatEvidenceError } from './errors.ts';

export type { NormalizedEventType, NormalizedLifecycle } from './lifecycle.ts';
export { RevenueCatEvidenceError } from './errors.ts';

export interface RevenueCatEvent {
  id: string;
  type: string;
  event_timestamp_ms: number;
  provider_order_ms?: unknown;
  app_id: string;
  app_user_id: string;
  original_app_user_id: string;
  aliases?: unknown;
  product_id: string;
  new_product_id?: unknown;
  period_type?: unknown;
  purchased_at_ms?: unknown;
  expiration_at_ms?: unknown;
  grace_period_expiration_at_ms?: unknown;
  cancel_reason?: unknown;
  environment: string;
  store: string;
  original_transaction_id: string;
  transaction_id?: unknown;
  revenuecat_subscription_id?: unknown;
  store_transaction_ids?: unknown;
}

export interface NormalizedBillingEvidence {
  provider: 'revenuecat';
  environment: BillingEnvironment;
  providerEventId: string;
  providerSubscriptionId: string;
  revenueCatSubscriptionId: string | null;
  storeTransactionIds: readonly string[];
  providerSubscriptionItemId: null;
  effectiveAt: string;
  providerOrder: number;
  eventType: NormalizedEventType;
  lifecycle: NormalizedLifecycle;
  logicalProduct: 'base_plan';
  tier: PaidTier;
  quantity: 1;
  currentPeriodEnd: string | null;
  graceEnd: string | null;
  terminalAt: string | null;
  boundHouseholdId: string | null;
  trustedReactivation: boolean;
}

export interface NormalizationResult {
  customerIds: readonly string[];
  evidence: NormalizedBillingEvidence | null;
  ignoredReason?:
    'unknown_event' | 'unknown_product' | 'family_binding_required' | 'deferred_product_change';
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255) {
    throw new RevenueCatEvidenceError('invalid_payload');
  }
  return value;
}

function requiredMillis(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RevenueCatEvidenceError('invalid_lifecycle');
  }
  return value;
}

function iso(millis: number): string {
  const value = new Date(millis);
  if (Number.isNaN(value.getTime())) {
    throw new RevenueCatEvidenceError('invalid_lifecycle');
  }
  return value.toISOString();
}

function normalizeEnvironment(value: string): BillingEnvironment {
  const normalized = value.toLowerCase();
  if (normalized !== 'sandbox' && normalized !== 'production') {
    throw new RevenueCatEvidenceError('invalid_source');
  }
  return normalized;
}

function getCustomerIds(event: RevenueCatEvent): string[] {
  const values = [
    requiredString(event.original_app_user_id),
    requiredString(event.app_user_id),
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}

function getPurchaseAliases(
  event: RevenueCatEvent,
  canonicalStoreTransactionId: string,
): Pick<NormalizedBillingEvidence, 'revenueCatSubscriptionId' | 'storeTransactionIds'> {
  const revenueCatSubscriptionId =
    event.revenuecat_subscription_id === undefined
      ? null
      : requiredString(event.revenuecat_subscription_id);
  const transactionIds = [
    canonicalStoreTransactionId,
    ...(event.transaction_id === undefined ? [] : [requiredString(event.transaction_id)]),
  ];
  if (event.store_transaction_ids !== undefined) {
    if (!Array.isArray(event.store_transaction_ids)) {
      throw new RevenueCatEvidenceError('invalid_payload');
    }
    transactionIds.push(...event.store_transaction_ids.map(requiredString));
  }
  return {
    revenueCatSubscriptionId,
    storeTransactionIds: [...new Set(transactionIds)],
  };
}

export function parseRevenueCatWebhookBody(rawBody: Uint8Array): RevenueCatEvent {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new RevenueCatEvidenceError('invalid_payload');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RevenueCatEvidenceError('invalid_payload');
  }
  const event = (value as Record<string, unknown>).event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new RevenueCatEvidenceError('invalid_payload');
  }
  return event as RevenueCatEvent;
}

export function normalizeRevenueCatEvent(
  event: RevenueCatEvent,
  config: RevenueCatConfig,
  familyHouseholdId: string | null,
  expectedUserId?: string,
): NormalizationResult {
  const appId = requiredString(event.app_id);
  const app = config.apps[appId];
  const environment = normalizeEnvironment(requiredString(event.environment));
  if (
    !app ||
    app.accountId !== config.accountId ||
    app.projectId !== config.projectId ||
    app.store !== (requiredString(event.store) as RevenueCatStore) ||
    environment !== config.environment
  ) {
    throw new RevenueCatEvidenceError('invalid_source');
  }

  const customerIds = getCustomerIds(event);
  if (expectedUserId && !customerIds.includes(expectedUserId)) {
    throw new RevenueCatEvidenceError('subject_mismatch');
  }

  const lifecycle = lifecycleFor(event);
  if (!lifecycle) {
    return {
      customerIds,
      evidence: null,
      ignoredReason: event.type === 'PRODUCT_CHANGE' ? 'deferred_product_change' : 'unknown_event',
    };
  }

  const productId = requiredString(event.product_id);
  const product = config.products[productId];
  if (!product) {
    return { customerIds, evidence: null, ignoredReason: 'unknown_product' };
  }
  if (product.appId !== appId) {
    throw new RevenueCatEvidenceError('invalid_source');
  }
  if (product.tier === 'family' && !familyHouseholdId) {
    return {
      customerIds,
      evidence: null,
      ignoredReason: 'family_binding_required',
    };
  }
  const providerSubscriptionId = requiredString(event.original_transaction_id);

  return {
    customerIds,
    evidence: {
      provider: 'revenuecat',
      environment,
      providerEventId: requiredString(event.id),
      providerSubscriptionId,
      ...getPurchaseAliases(event, providerSubscriptionId),
      providerSubscriptionItemId: null,
      effectiveAt: iso(lifecycle.effectiveAtMs),
      providerOrder: requiredMillis(event.provider_order_ms ?? event.event_timestamp_ms),
      eventType: lifecycle.eventType,
      lifecycle: lifecycle.lifecycle,
      logicalProduct: product.logicalProduct,
      tier: product.tier,
      quantity: 1,
      currentPeriodEnd: lifecycle.currentPeriodEndMs ? iso(lifecycle.currentPeriodEndMs) : null,
      graceEnd: lifecycle.graceEndMs ? iso(lifecycle.graceEndMs) : null,
      terminalAt: lifecycle.terminalAtMs ? iso(lifecycle.terminalAtMs) : null,
      boundHouseholdId: product.tier === 'family' ? familyHouseholdId : null,
      trustedReactivation: lifecycle.trustedReactivation,
    },
  };
}
