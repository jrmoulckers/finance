// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { DetectedSubscription } from '../analytics/subscriptions';
import { detectSubscriptionPriceChanges } from './subscription-price-changes';
import {
  buildSubscriptionPriceChangeDispatchPlans,
  subscriptionToPriceChangeCharge,
  subscriptionsToPriceChangeCharges,
} from './subscription-price-change-integration';

const subscription: DetectedSubscription = {
  id: 'sub-streamco',
  name: 'StreamCo',
  categoryId: null,
  categoryName: 'Entertainment',
  amountCents: 1000,
  cadence: 'monthly',
  monthlyCostCents: 1000,
  annualCostCents: 12000,
  transactionCount: 3,
  lastDate: '2025-06-01',
  status: 'active',
};

describe('subscription price change integration', () => {
  it('adapts detected subscriptions to charge snapshots', () => {
    const charge = subscriptionToPriceChangeCharge(subscription);

    expect(charge.subscriptionId).toBe('sub-streamco');
    expect(charge.cadence).toBe('monthly');
    expect(charge.status).toBe('posted');
  });

  it('builds dispatch plans with review/update/cancel commands and routes', () => {
    const alerts = detectSubscriptionPriceChanges([
      ...subscriptionsToPriceChangeCharges([
        { ...subscription, amountCents: 1000, lastDate: '2025-05-01' },
      ]),
      ...subscriptionsToPriceChangeCharges([
        { ...subscription, amountCents: 1300, lastDate: '2025-06-01' },
      ]),
    ]);

    const [plan] = buildSubscriptionPriceChangeDispatchPlans(alerts, '2025-06-01T13:00:00Z');

    expect(plan?.notification.type).toBe('subscription_price_change');
    expect(plan?.route).toContain('/subscriptions?subscriptionId=sub-streamco');
    expect(plan?.commands.map((command) => command.action)).toEqual([
      'review',
      'update_budget',
      'cancel_subscription',
    ]);
  });
});
