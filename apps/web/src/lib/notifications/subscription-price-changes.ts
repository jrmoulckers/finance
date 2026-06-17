// SPDX-License-Identifier: BUSL-1.1

/** Pure subscription price-change detection and notification builders. */

import { formatCentsForAlert } from './alert-engine';
import type { AppNotification } from './types';

export type SubscriptionCadence = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'unknown';

export interface SubscriptionCharge {
  readonly id: string;
  readonly merchantName: string;
  readonly amountCents: number;
  readonly chargedAt: string;
  readonly subscriptionId?: string;
  readonly cadence?: SubscriptionCadence;
  readonly cycleKey?: string;
  readonly isTrial?: boolean;
  readonly status?: 'posted' | 'pending' | 'void';
}

export interface SubscriptionPriceChangeConfig {
  readonly enabled?: boolean;
  readonly minimumIncreaseCents?: number;
  readonly minimumIncreasePercent?: number;
  readonly includeTrialConversions?: boolean;
}

export interface SubscriptionPriceChangeAlert {
  readonly subscriptionKey: string;
  readonly merchantName: string;
  readonly previousAmountCents: number;
  readonly newAmountCents: number;
  readonly increaseCents: number;
  readonly increasePercent: number | null;
  readonly annualImpactCents: number;
  readonly renewalTiming: string;
  readonly chargeId: string;
  readonly isTrialConversion: boolean;
  readonly deduplicationKey: string;
}

const DEFAULT_MIN_INCREASE_CENTS = 200;
const DEFAULT_MIN_INCREASE_PERCENT = 10;

function normalizedMerchantKey(merchantName: string): string {
  return merchantName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function subscriptionKey(charge: SubscriptionCharge): string {
  return charge.subscriptionId ?? normalizedMerchantKey(charge.merchantName);
}

function cadenceAnnualMultiplier(cadence: SubscriptionCadence | undefined): number {
  switch (cadence) {
    case 'weekly':
      return 52;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'annual':
      return 1;
    default:
      return 12;
  }
}

function cycleKey(charge: SubscriptionCharge): string {
  if (charge.cycleKey !== undefined) return charge.cycleKey;
  return charge.chargedAt.slice(0, 10);
}

function materialBucket(increaseCents: number): number {
  return Math.trunc(increaseCents / 100);
}

function buildAlert(
  previous: SubscriptionCharge,
  current: SubscriptionCharge,
): SubscriptionPriceChangeAlert {
  const increaseCents = current.amountCents - previous.amountCents;
  const increasePercent = previous.amountCents > 0 ? Math.round((increaseCents / previous.amountCents) * 100) : null;
  const annualImpactCents = increaseCents * cadenceAnnualMultiplier(current.cadence ?? previous.cadence);
  const isTrialConversion = previous.isTrial === true || previous.amountCents <= 0;
  const key = subscriptionKey(current);

  return {
    subscriptionKey: key,
    merchantName: current.merchantName,
    previousAmountCents: previous.amountCents,
    newAmountCents: current.amountCents,
    increaseCents,
    increasePercent,
    annualImpactCents,
    renewalTiming: current.cycleKey ?? current.chargedAt.slice(0, 10),
    chargeId: current.id,
    isTrialConversion,
    deduplicationKey: `subscription-price-${key}-${cycleKey(current)}-${materialBucket(increaseCents)}`,
  };
}

function isMaterialChange(
  previous: SubscriptionCharge,
  current: SubscriptionCharge,
  config: SubscriptionPriceChangeConfig,
): boolean {
  const increaseCents = current.amountCents - previous.amountCents;
  if (increaseCents <= 0) return false;
  const isTrialConversion = previous.isTrial === true || previous.amountCents <= 0;
  if (isTrialConversion) return config.includeTrialConversions !== false;

  const minimumIncreaseCents = config.minimumIncreaseCents ?? DEFAULT_MIN_INCREASE_CENTS;
  const minimumIncreasePercent = config.minimumIncreasePercent ?? DEFAULT_MIN_INCREASE_PERCENT;
  const increasePercent = previous.amountCents > 0 ? (increaseCents / previous.amountCents) * 100 : 100;
  return increaseCents >= minimumIncreaseCents || increasePercent >= minimumIncreasePercent;
}

export function detectSubscriptionPriceChanges(
  charges: readonly SubscriptionCharge[],
  config: SubscriptionPriceChangeConfig = {},
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): SubscriptionPriceChangeAlert[] {
  if (config.enabled === false) return [];

  const bySubscription = new Map<string, SubscriptionCharge[]>();
  for (const charge of charges) {
    if (charge.status === 'void') continue;
    if (charge.amountCents < 0) continue;
    const key = subscriptionKey(charge);
    bySubscription.set(key, [...(bySubscription.get(key) ?? []), charge]);
  }

  const alerts: SubscriptionPriceChangeAlert[] = [];
  for (const group of bySubscription.values()) {
    const sorted = [...group].sort((left, right) => Date.parse(left.chargedAt) - Date.parse(right.chargedAt));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous === undefined || current === undefined) continue;
      if (!isMaterialChange(previous, current, config)) continue;
      const alert = buildAlert(previous, current);
      if (!alreadyFiredKeys.has(alert.deduplicationKey)) {
        alerts.push(alert);
      }
    }
  }

  return alerts.sort((left, right) => left.merchantName.localeCompare(right.merchantName));
}

export function subscriptionPriceChangesToNotifications(
  alerts: readonly SubscriptionPriceChangeAlert[],
  createdAt: string = new Date().toISOString(),
): AppNotification[] {
  return alerts.map((alert) => {
    const percentCopy = alert.increasePercent === null ? 'trial converted to paid' : `${alert.increasePercent}% increase`;
    return {
      id: alert.deduplicationKey,
      type: 'subscription_price_change',
      severity: 'warning',
      title: 'Subscription price changed',
      message: `${alert.merchantName} changed from ${formatCentsForAlert(alert.previousAmountCents)} to ${formatCentsForAlert(
        alert.newAmountCents,
      )} (${percentCopy}). Estimated annual impact: ${formatCentsForAlert(alert.annualImpactCents)}. Renewal timing: ${alert.renewalTiming}.`,
      createdAt,
      status: 'unread',
      entityId: alert.subscriptionKey,
      entityType: 'transaction',
      actionLabel: 'Review subscription',
      deduplicationKey: alert.deduplicationKey,
    };
  });
}
