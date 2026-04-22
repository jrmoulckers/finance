// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkFeatureAccess,
  getAvailableFeatures,
  getPremiumFeatures,
  loadSubscriptionState,
  saveSubscriptionState,
  type FeatureUsage,
} from './feature-gate-engine';

const defaultUsage: FeatureUsage = {
  accountCount: 0,
  budgetCount: 0,
  goalCount: 0,
  categoryCount: 0,
};

describe('feature-gate-engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('checkFeatureAccess', () => {
    it('allows free features on free tier', () => {
      const result = checkFeatureAccess('achievements', 'free');
      expect(result.allowed).toBe(true);
      expect(result.atLimit).toBe(false);
    });

    it('blocks premium features on free tier', () => {
      const result = checkFeatureAccess('data_export', 'free');
      expect(result.allowed).toBe(false);
      expect(result.gateMessage).toContain('premium');
    });

    it('allows premium features on premium tier', () => {
      const result = checkFeatureAccess('data_export', 'premium');
      expect(result.allowed).toBe(true);
    });

    it('allows free tier up to account limit', () => {
      const result = checkFeatureAccess('unlimited_accounts', 'free', {
        ...defaultUsage,
        accountCount: 2,
      });
      expect(result.allowed).toBe(true);
      expect(result.atLimit).toBe(false);
      expect(result.currentCount).toBe(2);
      expect(result.maxCount).toBe(3);
    });

    it('marks at limit when free tier limit reached', () => {
      const result = checkFeatureAccess('unlimited_accounts', 'free', {
        ...defaultUsage,
        accountCount: 3,
      });
      expect(result.allowed).toBe(true);
      expect(result.atLimit).toBe(true);
      expect(result.gateMessage).toContain('limit');
    });

    it('has no limit on premium tier for accounts', () => {
      const result = checkFeatureAccess('unlimited_accounts', 'premium', {
        ...defaultUsage,
        accountCount: 100,
      });
      expect(result.allowed).toBe(true);
      expect(result.atLimit).toBe(false);
    });

    it('enforces budget limit on free tier', () => {
      const result = checkFeatureAccess('unlimited_budgets', 'free', {
        ...defaultUsage,
        budgetCount: 3,
      });
      expect(result.atLimit).toBe(true);
    });

    it('enforces goal limit on free tier', () => {
      const result = checkFeatureAccess('unlimited_goals', 'free', {
        ...defaultUsage,
        goalCount: 2,
      });
      expect(result.atLimit).toBe(true);
    });

    it('enforces custom category limit on free tier', () => {
      const result = checkFeatureAccess('custom_categories', 'free', {
        ...defaultUsage,
        categoryCount: 5,
      });
      expect(result.atLimit).toBe(true);
    });

    it('blocks insights_dashboard on free tier', () => {
      const result = checkFeatureAccess('insights_dashboard', 'free');
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe('premium');
    });

    it('blocks recurring_transactions on free tier', () => {
      const result = checkFeatureAccess('recurring_transactions', 'free');
      expect(result.allowed).toBe(false);
    });

    it('blocks multi_currency on free tier', () => {
      const result = checkFeatureAccess('multi_currency', 'free');
      expect(result.allowed).toBe(false);
    });
  });

  describe('getAvailableFeatures', () => {
    it('returns only free features for free tier', () => {
      const features = getAvailableFeatures('free');
      expect(features.every((f) => f.requiredTier === 'free')).toBe(true);
    });

    it('returns all features for premium tier', () => {
      const features = getAvailableFeatures('premium');
      // Premium tier gets all features (both free-tier and premium-tier)
      expect(features.length).toBe(12); // Total feature count
    });
  });

  describe('getPremiumFeatures', () => {
    it('returns only premium features', () => {
      const features = getPremiumFeatures();
      expect(features.every((f) => f.requiredTier === 'premium')).toBe(true);
      expect(features.length).toBeGreaterThan(0);
    });
  });

  describe('subscription state persistence', () => {
    it('returns free tier by default', () => {
      const state = loadSubscriptionState();
      expect(state.tier).toBe('free');
      expect(state.isActive).toBe(true);
    });

    it('saves and loads subscription state', () => {
      saveSubscriptionState({
        tier: 'premium',
        isActive: true,
        periodEnd: '2025-12-31T00:00:00Z',
      });
      const state = loadSubscriptionState();
      expect(state.tier).toBe('premium');
      expect(state.periodEnd).toBe('2025-12-31T00:00:00Z');
    });

    it('handles corrupt localStorage gracefully', () => {
      localStorage.setItem('finance_subscription', 'not-json');
      const state = loadSubscriptionState();
      expect(state.tier).toBe('free');
    });
  });
});
