// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { SubscriptionPriceChangeAlert } from './subscription-price-changes';
import {
  normalizeSubscriptionPriceChangePreferences,
  recordSubscriptionPriceChangeAlert,
  shouldRealertSubscriptionPriceChange,
  toSubscriptionPriceChangeConfig,
  validateSubscriptionPriceChangePreferences,
} from './subscription-price-change-preferences';

function alert(
  overrides: Partial<SubscriptionPriceChangeAlert> = {},
): SubscriptionPriceChangeAlert {
  return {
    subscriptionKey: 'sub-streamco',
    merchantName: 'StreamCo',
    previousAmountCents: 1000,
    newAmountCents: 1300,
    increaseCents: 300,
    increasePercent: 30,
    annualImpactCents: 3600,
    renewalTiming: '2025-06',
    chargeId: 'charge-1',
    isTrialConversion: false,
    deduplicationKey: 'subscription-price-sub-streamco-2025-06-3',
    ...overrides,
  };
}

describe('subscription price change preferences', () => {
  it('normalizes configurable thresholds into detector config', () => {
    const preferences = normalizeSubscriptionPriceChangePreferences({
      minimumIncreaseCents: 500,
      minimumIncreasePercent: 15,
      trialToPaidEnabled: false,
    });

    expect(toSubscriptionPriceChangeConfig(preferences)).toEqual({
      enabled: true,
      minimumIncreaseCents: 500,
      minimumIncreasePercent: 15,
      includeTrialConversions: false,
    });
  });

  it('validates unusable threshold settings', () => {
    expect(
      validateSubscriptionPriceChangePreferences({
        ...normalizeSubscriptionPriceChangePreferences(),
        minimumIncreaseCents: 0,
        minimumIncreasePercent: 0,
      }).valid,
    ).toBe(false);
  });

  it('dedupes until a materially new amount appears', () => {
    const preferences = normalizeSubscriptionPriceChangePreferences({ materialRealertCents: 200 });
    const history = [recordSubscriptionPriceChangeAlert(alert(), '2025-06-01T00:00:00Z')];

    expect(shouldRealertSubscriptionPriceChange(alert(), history, preferences)).toBe(false);
    expect(
      shouldRealertSubscriptionPriceChange(
        alert({ newAmountCents: 1350, deduplicationKey: 'new-small' }),
        history,
        preferences,
      ),
    ).toBe(false);
    expect(
      shouldRealertSubscriptionPriceChange(
        alert({ newAmountCents: 1600, deduplicationKey: 'new-large' }),
        history,
        preferences,
      ),
    ).toBe(true);
  });
});
