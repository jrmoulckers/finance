// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the subscription portfolio analyzer.
 *
 * Covers: category breakdown, duplicate detection, full portfolio
 * analysis, most expensive subscription, average cost.
 *
 * Edge cases: empty list, all cancelled, single subscription,
 * mixed billing cycles, zero-cost subscriptions, trial-only portfolio.
 *
 * References: issues #1619, #1629
 */

import { describe, expect, it } from 'vitest';
import {
  analyzeSubscriptions,
  calculateCategoryBreakdown,
  detectDuplicates,
} from './subscription-analyzer';
import type { Subscription } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Test Service',
    priceCents: 1499,
    billingCycle: 'monthly',
    category: 'streaming',
    status: 'active',
    startDate: '2024-01-01',
    nextBillingDate: '2025-02-01',
    provider: 'TestCo',
    priceHistory: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateCategoryBreakdown
// ---------------------------------------------------------------------------

describe('calculateCategoryBreakdown', () => {
  it('groups subscriptions by category', () => {
    const subs = [
      makeSub({ id: 's1', category: 'streaming', priceCents: 1599 }),
      makeSub({ id: 's2', category: 'streaming', priceCents: 999 }),
      makeSub({ id: 's3', category: 'software', priceCents: 1999 }),
    ];

    const breakdown = calculateCategoryBreakdown(subs);
    expect(breakdown).toHaveLength(2);

    const streaming = breakdown.find((b) => b.category === 'streaming');
    expect(streaming).toBeDefined();
    expect(streaming!.count).toBe(2);
    expect(streaming!.monthlyCostCents).toBe(2598);

    const software = breakdown.find((b) => b.category === 'software');
    expect(software).toBeDefined();
    expect(software!.count).toBe(1);
    expect(software!.monthlyCostCents).toBe(1999);
  });

  it('sorts by monthly cost descending', () => {
    const subs = [
      makeSub({ id: 's1', category: 'streaming', priceCents: 999 }),
      makeSub({ id: 's2', category: 'software', priceCents: 1999 }),
    ];

    const breakdown = calculateCategoryBreakdown(subs);
    expect(breakdown[0].category).toBe('software');
    expect(breakdown[1].category).toBe('streaming');
  });

  it('excludes cancelled subscriptions', () => {
    const subs = [
      makeSub({ id: 's1', status: 'active', priceCents: 999 }),
      makeSub({ id: 's2', status: 'cancelled', priceCents: 1999 }),
    ];

    const breakdown = calculateCategoryBreakdown(subs);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].monthlyCostCents).toBe(999);
  });

  it('includes trial subscriptions', () => {
    const subs = [makeSub({ status: 'trial', priceCents: 0 })];
    const breakdown = calculateCategoryBreakdown(subs);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].count).toBe(1);
  });

  it('calculates percent of total', () => {
    const subs = [
      makeSub({ id: 's1', category: 'streaming', priceCents: 1000 }),
      makeSub({ id: 's2', category: 'software', priceCents: 1000 }),
    ];

    const breakdown = calculateCategoryBreakdown(subs);
    expect(breakdown[0].percentOfTotal).toBe(50);
    expect(breakdown[1].percentOfTotal).toBe(50);
  });

  it('returns empty for empty list', () => {
    expect(calculateCategoryBreakdown([])).toHaveLength(0);
  });

  it('handles mixed billing cycles', () => {
    const subs = [
      makeSub({ id: 's1', priceCents: 1200, billingCycle: 'monthly' }),
      makeSub({ id: 's2', priceCents: 12000, billingCycle: 'annual', category: 'software' }),
    ];

    const breakdown = calculateCategoryBreakdown(subs);
    const streaming = breakdown.find((b) => b.category === 'streaming');
    const software = breakdown.find((b) => b.category === 'software');

    expect(streaming!.monthlyCostCents).toBe(1200);
    expect(software!.monthlyCostCents).toBe(1000); // 12000/12
  });
});

// ---------------------------------------------------------------------------
// detectDuplicates
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  it('detects multiple active subscriptions in same category', () => {
    const subs = [
      makeSub({ id: 's1', name: 'Netflix', category: 'streaming' }),
      makeSub({ id: 's2', name: 'Hulu', category: 'streaming' }),
    ];

    const duplicates = detectDuplicates(subs);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].subscriptionNames).toContain('Netflix');
    expect(duplicates[0].subscriptionNames).toContain('Hulu');
    expect(duplicates[0].category).toBe('streaming');
  });

  it('does not flag single subscriptions per category', () => {
    const subs = [
      makeSub({ id: 's1', category: 'streaming' }),
      makeSub({ id: 's2', category: 'software' }),
    ];

    expect(detectDuplicates(subs)).toHaveLength(0);
  });

  it('excludes cancelled subscriptions', () => {
    const subs = [
      makeSub({ id: 's1', category: 'streaming', status: 'active' }),
      makeSub({ id: 's2', category: 'streaming', status: 'cancelled' }),
    ];

    expect(detectDuplicates(subs)).toHaveLength(0);
  });

  it('calculates combined monthly cost', () => {
    const subs = [
      makeSub({ id: 's1', priceCents: 1599, category: 'streaming' }),
      makeSub({ id: 's2', priceCents: 999, category: 'streaming' }),
    ];

    const duplicates = detectDuplicates(subs);
    expect(duplicates[0].combinedMonthlyCostCents).toBe(2598);
  });

  it('returns empty for empty list', () => {
    expect(detectDuplicates([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeSubscriptions
// ---------------------------------------------------------------------------

describe('analyzeSubscriptions', () => {
  it('computes total monthly and annual costs', () => {
    const subs = [makeSub({ id: 's1', priceCents: 1599 }), makeSub({ id: 's2', priceCents: 999 })];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.totalMonthlyCostCents).toBe(2598);
    expect(analysis.totalAnnualCostCents).toBe(31176);
  });

  it('counts active and trial subscriptions', () => {
    const subs = [
      makeSub({ id: 's1', status: 'active' }),
      makeSub({ id: 's2', status: 'trial' }),
      makeSub({ id: 's3', status: 'cancelled' }),
    ];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.activeCount).toBe(1);
    expect(analysis.trialCount).toBe(1);
  });

  it('finds the most expensive subscription', () => {
    const subs = [
      makeSub({ id: 's1', name: 'Cheap', priceCents: 499 }),
      makeSub({ id: 's2', name: 'Expensive', priceCents: 2999 }),
    ];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.mostExpensive?.name).toBe('Expensive');
  });

  it('calculates average monthly cost', () => {
    const subs = [makeSub({ id: 's1', priceCents: 1000 }), makeSub({ id: 's2', priceCents: 2000 })];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.averageMonthlyCostCents).toBe(1500);
  });

  it('handles empty subscription list', () => {
    const analysis = analyzeSubscriptions([]);
    expect(analysis.totalMonthlyCostCents).toBe(0);
    expect(analysis.totalAnnualCostCents).toBe(0);
    expect(analysis.activeCount).toBe(0);
    expect(analysis.trialCount).toBe(0);
    expect(analysis.mostExpensive).toBeNull();
    expect(analysis.averageMonthlyCostCents).toBe(0);
    expect(analysis.categoryBreakdown).toHaveLength(0);
    expect(analysis.duplicates).toHaveLength(0);
  });

  it('handles all-cancelled portfolio', () => {
    const subs = [
      makeSub({ id: 's1', status: 'cancelled' }),
      makeSub({ id: 's2', status: 'cancelled' }),
    ];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.totalMonthlyCostCents).toBe(0);
    expect(analysis.mostExpensive).toBeNull();
  });

  it('handles zero-cost subscriptions', () => {
    const subs = [makeSub({ priceCents: 0 })];
    const analysis = analyzeSubscriptions(subs);
    expect(analysis.totalMonthlyCostCents).toBe(0);
    expect(analysis.averageMonthlyCostCents).toBe(0);
  });

  it('considers annual billing for most expensive', () => {
    const subs = [
      makeSub({ id: 's1', priceCents: 1200, billingCycle: 'monthly' }), // $1200/mo
      makeSub({ id: 's2', priceCents: 18000, billingCycle: 'annual' }), // $1500/mo equiv
    ];

    const analysis = analyzeSubscriptions(subs);
    expect(analysis.mostExpensive?.id).toBe('s2');
  });
});
