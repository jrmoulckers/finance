// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildCategoryTrends,
  calculateSavingsRate,
  calculateSpendingTrajectory,
  comparePeriods,
  getBudgetHealth,
  projectCategoryOverspend,
} from './budget-analytics';

describe('calculateSavingsRate', () => {
  it('returns 0 when income is zero', () => {
    expect(calculateSavingsRate(0, 500_00)).toBe(0);
  });

  it('returns 0 when income is negative', () => {
    expect(calculateSavingsRate(-100_00, 50_00)).toBe(0);
  });

  it('calculates correct rate when spending is less than income', () => {
    // Income $5000, spending $3500 → saved $1500 → 30%
    expect(calculateSavingsRate(500_000, 350_000)).toBe(30);
  });

  it('returns 0 when spending equals income', () => {
    expect(calculateSavingsRate(100_000, 100_000)).toBe(0);
  });

  it('returns negative when spending exceeds income', () => {
    // Income $1000, spending $1200 → -20%
    expect(calculateSavingsRate(100_000, 120_000)).toBe(-20);
  });

  it('returns 100 when spending is zero', () => {
    expect(calculateSavingsRate(100_000, 0)).toBe(100);
  });
});

describe('calculateSpendingTrajectory', () => {
  it('returns spentSoFar when daysElapsed is 0', () => {
    expect(calculateSpendingTrajectory(50_000, 0, 30)).toBe(50_000);
  });

  it('projects full-period spending from current rate', () => {
    // Spent $300 in 10 days → $30/day → $900 projected for 30 days
    expect(calculateSpendingTrajectory(30_000, 10, 30)).toBe(90_000);
  });

  it('returns exact spent when period is complete', () => {
    expect(calculateSpendingTrajectory(60_000, 30, 30)).toBe(60_000);
  });

  it('handles single day elapsed', () => {
    // Spent $100 in 1 day → $100/day → $3100 for 31 days
    expect(calculateSpendingTrajectory(10_000, 1, 31)).toBe(310_000);
  });
});

describe('getBudgetHealth', () => {
  it('returns on-track when spending rate is below budget rate', () => {
    // Budget $900 over 30 days = $30/day, spent $200 in 10 days = $20/day
    expect(getBudgetHealth(20_000, 90_000, 10, 30)).toBe('on-track');
  });

  it('returns on-track when spending rate equals budget rate', () => {
    // Budget $900 over 30 days = $30/day, spent $300 in 10 days = $30/day
    expect(getBudgetHealth(30_000, 90_000, 10, 30)).toBe('on-track');
  });

  it('returns at-risk when spending rate is slightly above budget rate', () => {
    // Budget $900/30 = $30/day, spent $340/10 = $34/day → ratio 1.13
    expect(getBudgetHealth(34_000, 90_000, 10, 30)).toBe('at-risk');
  });

  it('returns over-budget when spending rate is significantly above budget rate', () => {
    // Budget $900/30 = $30/day, spent $400/10 = $40/day → ratio 1.33
    expect(getBudgetHealth(40_000, 90_000, 10, 30)).toBe('over-budget');
  });

  it('returns over-budget when spent exceeds budget', () => {
    expect(getBudgetHealth(100_000, 90_000, 10, 30)).toBe('over-budget');
  });

  it('returns on-track when budget is zero', () => {
    expect(getBudgetHealth(0, 0, 10, 30)).toBe('on-track');
  });

  it('returns on-track when daysElapsed is zero', () => {
    expect(getBudgetHealth(0, 90_000, 0, 30)).toBe('on-track');
  });
});

describe('comparePeriods', () => {
  it('returns flat when both are zero', () => {
    expect(comparePeriods(0, 0)).toEqual({ change: 0, direction: 'flat' });
  });

  it('flags growth from a zero baseline as "new" instead of a fixed 100%', () => {
    // Previous $0 → any current spend has no percentage baseline (#3364).
    expect(comparePeriods(500, 0)).toEqual({ change: 0, direction: 'up', isNew: true });
    // Magnitude no longer collapses to a single 100% value.
    expect(comparePeriods(5, 0)).toEqual({ change: 0, direction: 'up', isNew: true });
  });

  it('flags a decrease from a zero baseline as "new" (negative current)', () => {
    expect(comparePeriods(-500, 0)).toEqual({ change: 0, direction: 'down', isNew: true });
  });

  it('does not flag isNew when the previous value is non-zero', () => {
    expect(comparePeriods(600, 500).isNew).toBeUndefined();
    expect(comparePeriods(0, 500)).toEqual({ change: 100, direction: 'down' });
  });

  it('returns down when current is less than previous', () => {
    // $400 vs $500 → -20% → direction down, change 20
    expect(comparePeriods(400, 500)).toEqual({ change: 20, direction: 'down' });
  });

  it('returns up when current is greater than previous', () => {
    // $600 vs $500 → +20% → direction up, change 20
    expect(comparePeriods(600, 500)).toEqual({ change: 20, direction: 'up' });
  });

  it('returns flat when values are equal', () => {
    expect(comparePeriods(500, 500)).toEqual({ change: 0, direction: 'flat' });
  });
});

describe('buildCategoryTrends', () => {
  it('returns top N categories sorted by current spending', () => {
    const current = new Map([
      ['Food', 500],
      ['Housing', 1200],
      ['Transport', 300],
      ['Entertainment', 150],
      ['Health', 200],
      ['Clothing', 100],
    ]);
    const previous = new Map([
      ['Food', 450],
      ['Housing', 1100],
      ['Transport', 350],
    ]);

    const trends = buildCategoryTrends(current, previous, 3);

    expect(trends).toHaveLength(3);
    expect(trends[0].name).toBe('Housing');
    expect(trends[1].name).toBe('Food');
    expect(trends[2].name).toBe('Transport');
  });

  it('handles categories not in previous period', () => {
    const current = new Map([['NewCategory', 300]]);
    const previous = new Map<string, number>();

    const trends = buildCategoryTrends(current, previous);

    expect(trends).toHaveLength(1);
    expect(trends[0].previous).toBe(0);
    expect(trends[0].direction).toBe('up');
    // No prior-period baseline → flagged as new, not a misleading 100% (#3364).
    expect(trends[0].isNew).toBe(true);
    expect(trends[0].change).toBe(0);
  });

  it('defaults to top 5', () => {
    const current = new Map([
      ['A', 100],
      ['B', 200],
      ['C', 300],
      ['D', 400],
      ['E', 500],
      ['F', 600],
      ['G', 700],
    ]);
    const previous = new Map<string, number>();

    const trends = buildCategoryTrends(current, previous);
    expect(trends).toHaveLength(5);
  });

  it('returns empty array when no categories', () => {
    const trends = buildCategoryTrends(new Map(), new Map());
    expect(trends).toHaveLength(0);
  });
});

describe('projectCategoryOverspend', () => {
  it('flags a category on pace to exceed its budget', () => {
    // Spent $600 in 10 of 30 days -> projects to $1,800 against a $1,000 budget.
    const projections = projectCategoryOverspend(
      [{ name: 'Dining', spentCents: 60_000, budgetCents: 100_000 }],
      10,
      30,
    );
    const dining = projections.get('Dining');
    expect(dining).toBeDefined();
    expect(dining?.projectedCents).toBe(180_000);
    expect(dining?.overspendCents).toBe(80_000);
  });

  it('omits categories projected to stay within budget', () => {
    // Spent $200 in 10 of 30 days -> projects to $600 against a $1,000 budget.
    const projections = projectCategoryOverspend(
      [{ name: 'Groceries', spentCents: 20_000, budgetCents: 100_000 }],
      10,
      30,
    );
    expect(projections.has('Groceries')).toBe(false);
  });

  it('ignores categories without a positive budget', () => {
    const projections = projectCategoryOverspend(
      [{ name: 'Uncategorized', spentCents: 50_000, budgetCents: 0 }],
      10,
      30,
    );
    expect(projections.size).toBe(0);
  });

  it('returns an empty map when there are no categories', () => {
    expect(projectCategoryOverspend([], 10, 30).size).toBe(0);
  });
});
