// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { detectSubscriptionPriceChanges, subscriptionPriceChangesToNotifications, type SubscriptionCharge } from './subscription-price-changes';

function charge(overrides: Partial<SubscriptionCharge> = {}): SubscriptionCharge {
  return {
    id: 'charge-1',
    merchantName: 'StreamCo',
    amountCents: 1000,
    chargedAt: '2025-01-01T12:00:00Z',
    cadence: 'monthly',
    status: 'posted',
    ...overrides,
  };
}

describe('detectSubscriptionPriceChanges', () => {
  it('detects material recurring amount increases', () => {
    const alerts = detectSubscriptionPriceChanges([
      charge({ id: 'jan', amountCents: 1000, chargedAt: '2025-01-01T12:00:00Z' }),
      charge({ id: 'feb', amountCents: 1300, chargedAt: '2025-02-01T12:00:00Z', cycleKey: '2025-02' }),
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.increaseCents).toBe(300);
    expect(alerts[0]?.increasePercent).toBe(30);
    expect(alerts[0]?.annualImpactCents).toBe(3600);
  });

  it('dedupes per subscription cycle and material amount bucket', () => {
    const alerts = detectSubscriptionPriceChanges([
      charge({ id: 'jan', amountCents: 1000, chargedAt: '2025-01-01T12:00:00Z' }),
      charge({ id: 'feb', amountCents: 1300, chargedAt: '2025-02-01T12:00:00Z', cycleKey: '2025-02' }),
    ]);

    const deduped = detectSubscriptionPriceChanges(
      [
        charge({ id: 'jan', amountCents: 1000, chargedAt: '2025-01-01T12:00:00Z' }),
        charge({ id: 'feb', amountCents: 1300, chargedAt: '2025-02-01T12:00:00Z', cycleKey: '2025-02' }),
      ],
      {},
      new Set(alerts.map((alert) => alert.deduplicationKey)),
    );

    expect(deduped).toEqual([]);
  });

  it('handles trial-to-paid conversion without percentage math noise', () => {
    const alerts = detectSubscriptionPriceChanges([
      charge({ id: 'trial', amountCents: 0, isTrial: true, chargedAt: '2025-01-01T12:00:00Z' }),
      charge({ id: 'paid', amountCents: 999, chargedAt: '2025-02-01T12:00:00Z' }),
    ]);

    expect(alerts[0]?.isTrialConversion).toBe(true);
    expect(alerts[0]?.increasePercent).toBeNull();
  });

  it('converts alerts to actionable notifications', () => {
    const alerts = detectSubscriptionPriceChanges([
      charge({ id: 'jan', amountCents: 1000, chargedAt: '2025-01-01T12:00:00Z' }),
      charge({ id: 'feb', amountCents: 1300, chargedAt: '2025-02-01T12:00:00Z' }),
    ]);

    const [notification] = subscriptionPriceChangesToNotifications(alerts, '2025-02-01T13:00:00Z');

    expect(notification?.type).toBe('subscription_price_change');
    expect(notification?.message).toContain('Estimated annual impact');
    expect(notification?.actionLabel).toBe('Review subscription');
  });
});
