// SPDX-License-Identifier: BUSL-1.1

import { RevenueCatEvidenceError } from './errors.ts';
import type { RevenueCatEvent } from './normalization.ts';

export type NormalizedLifecycle =
  | 'trialing'
  | 'active'
  | 'cancelled_paid_through'
  | 'past_due_grace'
  | 'paused_paid_through'
  | 'expired'
  | 'refunded'
  | 'chargeback';

export type NormalizedEventType =
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

export interface LifecycleMapping {
  eventType: NormalizedEventType;
  lifecycle: NormalizedLifecycle;
  effectiveAtMs: number;
  currentPeriodEndMs: number | null;
  graceEndMs: number | null;
  terminalAtMs: number | null;
  trustedReactivation: boolean;
}

function requiredMillis(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RevenueCatEvidenceError('invalid_lifecycle');
  }
  return value;
}

function optionalMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return requiredMillis(value);
}

export function lifecycleFor(event: RevenueCatEvent): LifecycleMapping | null {
  const generatedAt = requiredMillis(event.event_timestamp_ms);
  const purchasedAt = optionalMillis(event.purchased_at_ms) ?? generatedAt;
  const periodEnd = optionalMillis(event.expiration_at_ms);
  const graceEnd = optionalMillis(event.grace_period_expiration_at_ms);

  switch (event.type) {
    case 'INITIAL_PURCHASE':
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: event.period_type === 'TRIAL' ? 'trial_started' : 'activated',
        lifecycle: event.period_type === 'TRIAL' ? 'trialing' : 'active',
        effectiveAtMs: purchasedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: false,
      };
    case 'RENEWAL':
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'renewed',
        lifecycle: 'active',
        effectiveAtMs: purchasedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: true,
      };
    case 'SUBSCRIPTION_EXTENDED':
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'renewed',
        lifecycle: 'active',
        effectiveAtMs: generatedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: false,
      };
    case 'UNCANCELLATION':
    case 'REFUND_REVERSED':
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'reactivated',
        lifecycle: 'active',
        effectiveAtMs: generatedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: true,
      };
    case 'CANCELLATION': {
      const reason = String(event.cancel_reason ?? '');
      if (reason === 'CUSTOMER_SUPPORT' || reason === 'REFUND') {
        return {
          eventType: 'refunded',
          lifecycle: 'refunded',
          effectiveAtMs: generatedAt,
          currentPeriodEndMs: null,
          graceEndMs: null,
          terminalAtMs: generatedAt,
          trustedReactivation: false,
        };
      }
      if (reason === 'CHARGEBACK') {
        return {
          eventType: 'chargeback',
          lifecycle: 'chargeback',
          effectiveAtMs: generatedAt,
          currentPeriodEndMs: null,
          graceEndMs: null,
          terminalAtMs: generatedAt,
          trustedReactivation: false,
        };
      }
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'cancelled',
        lifecycle: 'cancelled_paid_through',
        effectiveAtMs: generatedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: false,
      };
    }
    case 'BILLING_ISSUE':
      if (!graceEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'past_due',
        lifecycle: 'past_due_grace',
        effectiveAtMs: generatedAt,
        currentPeriodEndMs: null,
        graceEndMs: graceEnd,
        terminalAtMs: null,
        trustedReactivation: false,
      };
    case 'SUBSCRIPTION_PAUSED':
      if (!periodEnd) throw new RevenueCatEvidenceError('invalid_lifecycle');
      return {
        eventType: 'paused',
        lifecycle: 'paused_paid_through',
        effectiveAtMs: generatedAt,
        currentPeriodEndMs: periodEnd,
        graceEndMs: null,
        terminalAtMs: null,
        trustedReactivation: false,
      };
    case 'EXPIRATION': {
      const terminalAt = periodEnd ?? generatedAt;
      return {
        eventType: 'expired',
        lifecycle: 'expired',
        effectiveAtMs: terminalAt,
        currentPeriodEndMs: null,
        graceEndMs: null,
        terminalAtMs: terminalAt,
        trustedReactivation: false,
      };
    }
    case 'PRODUCT_CHANGE':
      return null;
    default:
      return null;
  }
}
