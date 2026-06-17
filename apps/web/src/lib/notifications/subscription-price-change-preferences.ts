// SPDX-License-Identifier: BUSL-1.1

import type { SubscriptionPriceChangeConfig, SubscriptionPriceChangeAlert } from './subscription-price-changes';

export interface SubscriptionPriceChangePreferences {
  readonly enabled: boolean;
  readonly minimumIncreaseCents: number;
  readonly minimumIncreasePercent: number;
  readonly trialToPaidEnabled: boolean;
  readonly materialRealertCents: number;
}

export interface SubscriptionPriceChangePreferenceValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface SubscriptionPriceChangeAlertHistory {
  readonly subscriptionKey: string;
  readonly increaseCents: number;
  readonly newAmountCents: number;
  readonly deduplicationKey: string;
  readonly alertedAt: string;
}

export const DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES: SubscriptionPriceChangePreferences = {
  enabled: true,
  minimumIncreaseCents: 200,
  minimumIncreasePercent: 10,
  trialToPaidEnabled: true,
  materialRealertCents: 100,
};

export function normalizeSubscriptionPriceChangePreferences(
  partial: Partial<SubscriptionPriceChangePreferences> = {},
): SubscriptionPriceChangePreferences {
  return {
    enabled: partial.enabled ?? DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES.enabled,
    minimumIncreaseCents: Math.max(0, Math.round(partial.minimumIncreaseCents ?? DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES.minimumIncreaseCents)),
    minimumIncreasePercent: Math.max(0, partial.minimumIncreasePercent ?? DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES.minimumIncreasePercent),
    trialToPaidEnabled: partial.trialToPaidEnabled ?? DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES.trialToPaidEnabled,
    materialRealertCents: Math.max(0, Math.round(partial.materialRealertCents ?? DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES.materialRealertCents)),
  };
}

export function validateSubscriptionPriceChangePreferences(
  preferences: SubscriptionPriceChangePreferences,
): SubscriptionPriceChangePreferenceValidation {
  const errors: string[] = [];
  if (preferences.minimumIncreaseCents < 0) errors.push('Minimum dollar increase cannot be negative.');
  if (preferences.minimumIncreasePercent < 0) errors.push('Minimum percentage increase cannot be negative.');
  if (preferences.minimumIncreaseCents === 0 && preferences.minimumIncreasePercent === 0) {
    errors.push('At least one price-change threshold must be greater than zero.');
  }
  if (preferences.materialRealertCents < 0) errors.push('Material re-alert amount cannot be negative.');
  return { valid: errors.length === 0, errors };
}

export function toSubscriptionPriceChangeConfig(
  preferences: SubscriptionPriceChangePreferences,
): SubscriptionPriceChangeConfig {
  return {
    enabled: preferences.enabled,
    minimumIncreaseCents: preferences.minimumIncreaseCents,
    minimumIncreasePercent: preferences.minimumIncreasePercent,
    includeTrialConversions: preferences.trialToPaidEnabled,
  };
}

export function recordSubscriptionPriceChangeAlert(
  alert: SubscriptionPriceChangeAlert,
  alertedAt: string = new Date().toISOString(),
): SubscriptionPriceChangeAlertHistory {
  return {
    subscriptionKey: alert.subscriptionKey,
    increaseCents: alert.increaseCents,
    newAmountCents: alert.newAmountCents,
    deduplicationKey: alert.deduplicationKey,
    alertedAt,
  };
}

export function shouldRealertSubscriptionPriceChange(
  alert: SubscriptionPriceChangeAlert,
  history: readonly SubscriptionPriceChangeAlertHistory[],
  preferences: SubscriptionPriceChangePreferences,
): boolean {
  const prior = history
    .filter((entry) => entry.subscriptionKey === alert.subscriptionKey)
    .sort((left, right) => right.alertedAt.localeCompare(left.alertedAt))[0];
  if (prior === undefined) return true;
  if (prior.deduplicationKey === alert.deduplicationKey) return false;
  return Math.abs(alert.newAmountCents - prior.newAmountCents) >= preferences.materialRealertCents;
}
