// SPDX-License-Identifier: BUSL-1.1

import { resolveCatalogPrice } from './catalog.ts';
import {
  type BillingEventType,
  type BillingLifecycle,
  type NormalizedBillingEvidence,
  type StripeCharge,
  type StripeDispute,
  type StripeEvent,
  type StripeGateway,
  type StripeInvoice,
  type StripeRefund,
  type StripeSubscription,
} from './types.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseStripeEvent(rawBody: string): StripeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('Invalid Stripe event');
  }
  const record = asRecord(parsed);
  const data = asRecord(record.data);
  if (
    typeof record.id !== 'string' ||
    typeof record.type !== 'string' ||
    typeof record.created !== 'number' ||
    !Number.isSafeInteger(record.created) ||
    typeof record.livemode !== 'boolean' ||
    !('object' in data)
  ) {
    throw new Error('Invalid Stripe event');
  }
  return {
    id: record.id,
    type: record.type,
    created: record.created,
    livemode: record.livemode,
    ...(typeof record.account === 'string' ? { account: record.account } : {}),
    data: {
      object: data.object,
      ...(isRecord(data.previous_attributes)
        ? { previous_attributes: data.previous_attributes }
        : {}),
    },
  };
}

export async function normalizeStripeEvent(
  event: StripeEvent,
  gateway: StripeGateway,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): Promise<NormalizedBillingEvidence | null> {
  const context = await loadEventContext(event, gateway);
  if (!context) return null;
  if (
    context.subscription.livemode !== event.livemode ||
    (context.invoice && context.invoice.livemode !== event.livemode)
  ) {
    throw new Error('Stripe object mode mismatch');
  }

  const entry = resolveCatalogPrice(context.subscription.items.data[0]?.price.id ?? '', getEnv);
  if (!entry || context.subscription.items.data.length !== 1) return null;

  const householdId = context.subscription.metadata.finance_household_id ?? null;
  if (entry.requiresHousehold && (!householdId || !UUID_PATTERN.test(householdId))) return null;
  if (!entry.requiresHousehold && householdId && entry.tier !== 'premium') {
    return null;
  }

  const state = normalizeLifecycle(event, context.subscription, context.invoice);
  return {
    providerEventId: event.id,
    providerSubscriptionId: context.subscription.id,
    providerSubscriptionItemId:
      entry.logicalProduct === 'premium_bank_addon' ? context.subscription.items.data[0].id : null,
    effectiveAt: toIso(state.effectiveAt),
    providerOrder: event.created,
    eventType: state.eventType,
    lifecycle: state.lifecycle,
    logicalProduct: entry.logicalProduct,
    tier: entry.tier,
    quantity:
      entry.logicalProduct === 'premium_bank_addon'
        ? Math.max(1, context.subscription.items.data[0].quantity ?? 1)
        : 1,
    currentPeriodEnd: state.currentPeriodEnd ? toIso(state.currentPeriodEnd) : null,
    graceEnd: state.graceEnd ? toIso(state.graceEnd) : null,
    terminalAt: state.terminalAt ? toIso(state.terminalAt) : null,
    boundHouseholdId: entry.tier === 'family' ? householdId : null,
    premiumSponsorshipHouseholdId: entry.tier === 'premium' ? householdId : null,
    trustedReactivation: state.trustedReactivation,
    providerCustomerId: context.subscription.customer,
  };
}

export function normalizeReconciledSubscription(
  subscription: StripeSubscription,
  invoice: StripeInvoice | null,
  reconciledAt: number,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): NormalizedBillingEvidence | null {
  const event: StripeEvent = {
    id: [
      'reconcile',
      subscription.id,
      subscription.status,
      subscription.current_period_end,
      invoice?.status ?? 'none',
    ].join(':'),
    type: 'finance.stripe.reconciled',
    created: reconciledAt,
    livemode: subscription.livemode,
    data: { object: subscription },
  };
  const entry = resolveCatalogPrice(subscription.items.data[0]?.price.id ?? '', getEnv);
  if (!entry || subscription.items.data.length !== 1) return null;
  const householdId = subscription.metadata.finance_household_id ?? null;
  if (entry.requiresHousehold && (!householdId || !UUID_PATTERN.test(householdId))) return null;

  const state = normalizeLifecycle(event, subscription, invoice);
  return {
    providerEventId: event.id,
    providerSubscriptionId: subscription.id,
    providerSubscriptionItemId:
      entry.logicalProduct === 'premium_bank_addon' ? subscription.items.data[0].id : null,
    effectiveAt: toIso(state.effectiveAt),
    providerOrder: reconciledAt,
    eventType: state.eventType,
    lifecycle: state.lifecycle,
    logicalProduct: entry.logicalProduct,
    tier: entry.tier,
    quantity:
      entry.logicalProduct === 'premium_bank_addon'
        ? Math.max(1, subscription.items.data[0].quantity ?? 1)
        : 1,
    currentPeriodEnd: state.currentPeriodEnd ? toIso(state.currentPeriodEnd) : null,
    graceEnd: state.graceEnd ? toIso(state.graceEnd) : null,
    terminalAt: state.terminalAt ? toIso(state.terminalAt) : null,
    boundHouseholdId: entry.tier === 'family' ? householdId : null,
    premiumSponsorshipHouseholdId: entry.tier === 'premium' ? householdId : null,
    trustedReactivation: state.trustedReactivation,
    providerCustomerId: subscription.customer,
  };
}

interface EventContext {
  subscription: StripeSubscription;
  invoice: StripeInvoice | null;
}

async function loadEventContext(
  event: StripeEvent,
  gateway: StripeGateway,
): Promise<EventContext | null> {
  if (
    event.type.startsWith('customer.subscription.') ||
    event.type === 'finance.stripe.reconciled'
  ) {
    const subscriptionId = stringField(event.data.object, 'id');
    if (!subscriptionId) return null;
    const subscription = await gateway.retrieveSubscription(subscriptionId);
    const invoice = subscription.latest_invoice
      ? await gateway.retrieveInvoice(subscription.latest_invoice)
      : null;
    return { subscription, invoice };
  }

  if (event.type.startsWith('invoice.')) {
    const invoiceId = stringField(event.data.object, 'id');
    if (!invoiceId) return null;
    const invoice = await gateway.retrieveInvoice(invoiceId);
    if (!invoice.subscription) return null;
    return {
      subscription: await gateway.retrieveSubscription(invoice.subscription),
      invoice,
    };
  }

  if (event.type === 'charge.refunded') {
    const chargeId = stringField(event.data.object, 'id');
    if (!chargeId) return null;
    return contextFromCharge(await gateway.retrieveCharge(chargeId), gateway);
  }

  if (event.type === 'refund.created' || event.type === 'refund.updated') {
    const refund = parseRefund(event.data.object);
    if (!refund || (refund.status !== 'succeeded' && event.type === 'refund.updated')) return null;
    return contextFromCharge(await gateway.retrieveCharge(refund.charge), gateway);
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = parseDispute(event.data.object);
    if (!dispute) return null;
    return contextFromCharge(await gateway.retrieveCharge(dispute.charge), gateway);
  }

  return null;
}

async function contextFromCharge(
  charge: StripeCharge,
  gateway: StripeGateway,
): Promise<EventContext | null> {
  if (!charge.invoice) return null;
  const invoice = await gateway.retrieveInvoice(charge.invoice);
  if (!invoice.subscription) return null;
  return {
    invoice,
    subscription: await gateway.retrieveSubscription(invoice.subscription),
  };
}

interface NormalizedState {
  eventType: BillingEventType;
  lifecycle: BillingLifecycle;
  effectiveAt: number;
  currentPeriodEnd: number | null;
  graceEnd: number | null;
  terminalAt: number | null;
  trustedReactivation: boolean;
}

function normalizeLifecycle(
  event: StripeEvent,
  subscription: StripeSubscription,
  invoice: StripeInvoice | null,
): NormalizedState {
  const effectiveAt = trustedEffectiveTime(event, subscription, invoice);
  if (event.type === 'charge.dispute.created') {
    return terminal('chargeback', 'chargeback', effectiveAt);
  }
  if (
    event.type === 'charge.refunded' ||
    event.type === 'refund.created' ||
    event.type === 'refund.updated'
  ) {
    return terminal('refunded', 'refunded', effectiveAt);
  }

  const periodEnd = subscription.trial_end ?? subscription.current_period_end;
  if (subscription.status === 'trialing') {
    return activeWindow('trial_started', 'trialing', effectiveAt, periodEnd, false);
  }
  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_action_required') {
    const graceEnd = invoice?.next_payment_attempt ?? null;
    return graceEnd && graceEnd > effectiveAt
      ? {
          eventType: 'past_due',
          lifecycle: 'past_due_grace',
          effectiveAt,
          currentPeriodEnd: null,
          graceEnd,
          terminalAt: null,
          trustedReactivation: false,
        }
      : terminal('expired', 'expired', effectiveAt);
  }
  if (
    subscription.status === 'active' &&
    (subscription.cancel_at_period_end || event.type === 'customer.subscription.deleted')
  ) {
    return periodEnd > effectiveAt
      ? activeWindow('cancelled', 'cancelled_paid_through', effectiveAt, periodEnd, false)
      : terminal('expired', 'expired', effectiveAt);
  }
  if (subscription.status === 'active' && subscription.pause_collection) {
    return periodEnd > effectiveAt
      ? activeWindow('paused', 'paused_paid_through', effectiveAt, periodEnd, false)
      : terminal('expired', 'expired', effectiveAt);
  }
  if (subscription.status === 'active') {
    const reactivated =
      event.type === 'customer.subscription.resumed' ||
      event.data.previous_attributes?.status === 'canceled' ||
      event.data.previous_attributes?.status === 'unpaid' ||
      event.data.previous_attributes?.status === 'past_due';
    return activeWindow(
      reactivated
        ? 'reactivated'
        : event.type === 'invoice.paid'
          ? 'renewed'
          : event.data.previous_attributes?.items
            ? 'quantity_changed'
            : 'activated',
      'active',
      effectiveAt,
      periodEnd,
      reactivated || event.type === 'invoice.paid',
    );
  }
  if (subscription.status === 'paused') {
    return periodEnd > effectiveAt
      ? activeWindow('paused', 'paused_paid_through', effectiveAt, periodEnd, false)
      : terminal('expired', 'expired', effectiveAt);
  }
  if (
    subscription.status === 'past_due' ||
    subscription.status === 'unpaid' ||
    subscription.status === 'incomplete'
  ) {
    const graceEnd = invoice?.next_payment_attempt ?? null;
    return graceEnd && graceEnd > effectiveAt
      ? {
          eventType: 'past_due',
          lifecycle: 'past_due_grace',
          effectiveAt,
          currentPeriodEnd: null,
          graceEnd,
          terminalAt: null,
          trustedReactivation: false,
        }
      : terminal('expired', 'expired', effectiveAt);
  }
  return terminal('expired', 'expired', Math.max(effectiveAt, subscription.ended_at ?? 0));
}

function trustedEffectiveTime(
  event: StripeEvent,
  subscription: StripeSubscription,
  invoice: StripeInvoice | null,
): number {
  if (event.type === 'invoice.paid') {
    return invoice?.status_transitions?.paid_at ?? event.created;
  }
  if (event.type === 'charge.dispute.created') {
    return parseDispute(event.data.object)?.created ?? event.created;
  }
  if (event.type === 'refund.created' || event.type === 'refund.updated') {
    return parseRefund(event.data.object)?.created ?? event.created;
  }
  if (event.type === 'customer.subscription.deleted') {
    return subscription.ended_at ?? subscription.canceled_at ?? event.created;
  }
  return event.created;
}

function activeWindow(
  eventType: BillingEventType,
  lifecycle: BillingLifecycle,
  effectiveAt: number,
  currentPeriodEnd: number,
  trustedReactivation: boolean,
): NormalizedState {
  return {
    eventType,
    lifecycle,
    effectiveAt,
    currentPeriodEnd,
    graceEnd: null,
    terminalAt: null,
    trustedReactivation,
  };
}

function terminal(
  eventType: BillingEventType,
  lifecycle: 'expired' | 'refunded' | 'chargeback',
  effectiveAt: number,
): NormalizedState {
  return {
    eventType,
    lifecycle,
    effectiveAt,
    currentPeriodEnd: null,
    graceEnd: null,
    terminalAt: effectiveAt,
    trustedReactivation: false,
  };
}

function parseRefund(value: unknown): StripeRefund | null {
  const record = asRecord(value);
  return typeof record.id === 'string' &&
    typeof record.charge === 'string' &&
    typeof record.created === 'number' &&
    typeof record.livemode === 'boolean'
    ? {
        id: record.id,
        charge: record.charge,
        created: record.created,
        livemode: record.livemode,
        status:
          typeof record.status === 'string' ? (record.status as StripeRefund['status']) : null,
      }
    : null;
}

function parseDispute(value: unknown): StripeDispute | null {
  const record = asRecord(value);
  return typeof record.id === 'string' &&
    typeof record.charge === 'string' &&
    typeof record.created === 'number' &&
    typeof record.livemode === 'boolean'
    ? {
        id: record.id,
        charge: record.charge,
        created: record.created,
        livemode: record.livemode,
      }
    : null;
}

function stringField(value: unknown, key: string): string | null {
  const field = asRecord(value)[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}
