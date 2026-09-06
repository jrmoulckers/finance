// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  checkFeatureAccess,
  getAvailableFeatures,
  getPremiumFeatures,
} from './feature-gate-engine';

describe('local capability registry', () => {
  it('keeps export unrestricted for every displayed entitlement tier', () => {
    for (const tier of ['free', 'plus', 'premium', 'family'] as const) {
      expect(checkFeatureAccess('data_export', tier)).toMatchObject({
        allowed: true,
        atLimit: false,
        maxCount: null,
        requiredTier: null,
      });
    }
  });

  it('does not impose local account, budget, goal, or category tier limits', () => {
    const usage = {
      accountCount: 10_000,
      budgetCount: 10_000,
      goalCount: 10_000,
      categoryCount: 10_000,
    };
    for (const feature of [
      'unlimited_accounts',
      'unlimited_budgets',
      'unlimited_goals',
      'custom_categories',
    ] as const) {
      expect(checkFeatureAccess(feature, 'free', usage).atLimit).toBe(false);
    }
  });

  it('contains no premium feature allocation matrix', () => {
    expect(getAvailableFeatures('free')).toHaveLength(12);
    expect(getPremiumFeatures()).toEqual([]);
  });
});
