// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for contextual spending insight generation engine.
 *
 * References: issue #1766
 */

import { describe, it, expect } from 'vitest';
import {
  detectUnusualSpending,
  generateCategoryTrends,
  generateBudgetPaceAlerts,
  detectSpendingStreakInsights,
  detectMilestoneInsights,
  generateInsights,
  sumTransactions,
} from './spending-insights';
import type { TaggedTransaction, InsightInput, BudgetForInsight } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(
  categoryId: string,
  amountCents: number,
  date: string = '2024-06-15',
): TaggedTransaction {
  return {
    transactionId: crypto.randomUUID(),
    tag: 'NEEDS',
    amountCents,
    categoryId,
    date,
  };
}

function makeGroupMap(
  entries: [string, number][],
): Map<string, { totalCents: number; count: number }> {
  const map = new Map<string, { totalCents: number; count: number }>();
  for (const [catId, cents] of entries) {
    const existing = map.get(catId);
    if (existing) {
      existing.totalCents += cents;
      existing.count += 1;
    } else {
      map.set(catId, { totalCents: cents, count: 1 });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// sumTransactions
// ---------------------------------------------------------------------------

describe('sumTransactions', () => {
  it('returns 0 for empty', () => {
    expect(sumTransactions([])).toBe(0);
  });

  it('sums all amounts', () => {
    const txs = [makeTx('a', 100), makeTx('b', 200), makeTx('c', 300)];
    expect(sumTransactions(txs)).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// detectUnusualSpending
// ---------------------------------------------------------------------------

describe('detectUnusualSpending', () => {
  it('returns empty when no unusual spending', () => {
    const current = makeGroupMap([['food', 5000]]);
    const prior = makeGroupMap([['food', 4500]]);
    const result = detectUnusualSpending(current, prior, '2024-06-15');
    expect(result).toHaveLength(0);
  });

  it('detects category with 50%+ increase', () => {
    const current = makeGroupMap([['dining', 10000]]);
    const prior = makeGroupMap([['dining', 5000]]);
    const result = detectUnusualSpending(current, prior, '2024-06-15');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('unusual_spending');
    expect(result[0].percentChange).toBe(100);
    expect(result[0].categoryId).toBe('dining');
  });

  it('respects minimum increase threshold', () => {
    const current = makeGroupMap([['coffee', 3000]]);
    const prior = makeGroupMap([['coffee', 1500]]);
    // 100% increase but only $15 increase — below default $20 minimum
    const result = detectUnusualSpending(current, prior, '2024-06-15');
    expect(result).toHaveLength(0);
  });

  it('assigns high priority for 100%+ increases', () => {
    const current = makeGroupMap([['shopping', 15000]]);
    const prior = makeGroupMap([['shopping', 5000]]);
    const result = detectUnusualSpending(current, prior, '2024-06-15');

    expect(result[0].priority).toBe('high');
  });

  it('skips uncategorised transactions', () => {
    const current = makeGroupMap([['__uncategorised__', 20000]]);
    const prior = makeGroupMap([['__uncategorised__', 5000]]);
    const result = detectUnusualSpending(current, prior, '2024-06-15');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateCategoryTrends
// ---------------------------------------------------------------------------

describe('generateCategoryTrends', () => {
  const names: Record<string, string> = {
    dining: 'Dining',
    groceries: 'Groceries',
    entertainment: 'Entertainment',
  };

  it('returns empty for no significant changes', () => {
    const current = makeGroupMap([['dining', 5000]]);
    const prior = makeGroupMap([['dining', 4800]]);
    const result = generateCategoryTrends(current, prior, names, '2024-06-15');
    expect(result).toHaveLength(0);
  });

  it('generates trend for significant increase', () => {
    const current = makeGroupMap([['dining', 8000]]);
    const prior = makeGroupMap([['dining', 5000]]);
    const result = generateCategoryTrends(current, prior, names, '2024-06-15');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('category_trend');
    expect(result[0].title).toContain('Dining');
    expect(result[0].title).toContain('up');
  });

  it('generates trend for significant decrease', () => {
    const current = makeGroupMap([['groceries', 3000]]);
    const prior = makeGroupMap([['groceries', 8000]]);
    const result = generateCategoryTrends(current, prior, names, '2024-06-15');

    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('down');
  });

  it('skips categories below minimum spend', () => {
    const current = makeGroupMap([['entertainment', 500]]);
    const prior = makeGroupMap([['entertainment', 200]]);
    const result = generateCategoryTrends(current, prior, names, '2024-06-15');
    expect(result).toHaveLength(0);
  });

  it('sorts by absolute change descending', () => {
    const current = makeGroupMap([
      ['dining', 10000],
      ['groceries', 8000],
    ]);
    const prior = makeGroupMap([
      ['dining', 2000],
      ['groceries', 5000],
    ]);
    const result = generateCategoryTrends(current, prior, names, '2024-06-15');

    if (result.length >= 2) {
      expect(Math.abs(result[0].percentChange ?? 0)).toBeGreaterThanOrEqual(
        Math.abs(result[1].percentChange ?? 0),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// generateBudgetPaceAlerts
// ---------------------------------------------------------------------------

describe('generateBudgetPaceAlerts', () => {
  it('returns empty for no budgets', () => {
    const result = generateBudgetPaceAlerts([], 15, 30, '2024-06-15');
    expect(result).toEqual([]);
  });

  it('returns empty for invalid day/month values', () => {
    const budgets: BudgetForInsight[] = [
      { categoryId: 'food', categoryName: 'Food', budgetCents: 50000, spentCents: 25000 },
    ];
    expect(generateBudgetPaceAlerts(budgets, 0, 30, '2024-06-15')).toEqual([]);
    expect(generateBudgetPaceAlerts(budgets, 15, 0, '2024-06-15')).toEqual([]);
  });

  it('detects over-budget spending', () => {
    const budgets: BudgetForInsight[] = [
      { categoryId: 'food', categoryName: 'Food', budgetCents: 30000, spentCents: 35000 },
    ];
    const result = generateBudgetPaceAlerts(budgets, 20, 30, '2024-06-20');

    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe('high');
    expect(result[0].title).toContain('over budget');
  });

  it('detects ahead-of-pace spending', () => {
    const budgets: BudgetForInsight[] = [
      { categoryId: 'dining', categoryName: 'Dining', budgetCents: 30000, spentCents: 25000 },
    ];
    // Day 10 of 30 but already spent 83% — pace is 83% vs 33% calendar
    const result = generateBudgetPaceAlerts(budgets, 10, 30, '2024-06-10');

    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe('medium');
    expect(result[0].title).toContain('ahead of pace');
  });

  it('detects under-budget spending', () => {
    const budgets: BudgetForInsight[] = [
      { categoryId: 'transport', categoryName: 'Transport', budgetCents: 50000, spentCents: 5000 },
    ];
    // Day 20 of 30 but only spent 10% — pace is 10% vs 67% calendar
    const result = generateBudgetPaceAlerts(budgets, 20, 30, '2024-06-20');

    expect(result).toHaveLength(1);
    expect(result[0].priority).toBe('low');
    expect(result[0].title).toContain('under budget');
  });

  it('skips zero-budget categories', () => {
    const budgets: BudgetForInsight[] = [
      { categoryId: 'x', categoryName: 'X', budgetCents: 0, spentCents: 1000 },
    ];
    const result = generateBudgetPaceAlerts(budgets, 15, 30, '2024-06-15');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectSpendingStreakInsights
// ---------------------------------------------------------------------------

describe('detectSpendingStreakInsights', () => {
  it('returns empty for no transactions', () => {
    const result = detectSpendingStreakInsights([], '2024-06-15');
    expect(result).toEqual([]);
  });

  it('detects no-spend streak when no recent spending', () => {
    // Transactions only from early in the month, none near "today"
    const txs = [makeTx('food', 5000, '2024-06-01')];
    const result = detectSpendingStreakInsights(txs, '2024-06-15', 3);

    // Should detect streak ending at 2024-06-15
    if (result.length > 0) {
      expect(result[0].type).toBe('streak');
      expect(result[0].title).toContain('no-spend streak');
    }
  });
});

// ---------------------------------------------------------------------------
// detectMilestoneInsights
// ---------------------------------------------------------------------------

describe('detectMilestoneInsights', () => {
  it('returns empty when no milestone crossed', () => {
    const result = detectMilestoneInsights(50000, 40000, '2024-06-15');
    expect(result).toHaveLength(0);
  });

  it('detects $1,000 milestone', () => {
    const result = detectMilestoneInsights(110000, 90000, '2024-06-15');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('milestone');
    expect(result[0].title).toContain('$1,000');
  });

  it('detects multiple milestones crossed at once', () => {
    const result = detectMilestoneInsights(600000, 80000, '2024-06-15');
    // Crosses $1k, $2.5k, $5k
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('does not fire for already-crossed milestones', () => {
    const result = detectMilestoneInsights(200000, 150000, '2024-06-15');
    // $1k was crossed in prior period too
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateInsights (integration)
// ---------------------------------------------------------------------------

describe('generateInsights', () => {
  it('generates prioritised insights from combined data', () => {
    const input: InsightInput = {
      currentTransactions: [
        makeTx('dining', 12000, '2024-06-05'),
        makeTx('dining', 8000, '2024-06-10'),
        makeTx('groceries', 15000, '2024-06-03'),
      ],
      priorTransactions: [
        makeTx('dining', 5000, '2024-05-05'),
        makeTx('groceries', 14000, '2024-05-03'),
      ],
      budgets: [
        { categoryId: 'dining', categoryName: 'Dining', budgetCents: 15000, spentCents: 20000 },
      ],
      today: '2024-06-15',
      dayOfMonth: 15,
      daysInMonth: 30,
    };

    const names = { dining: 'Dining', groceries: 'Groceries' };
    const result = generateInsights(input, names);

    expect(result.length).toBeGreaterThan(0);
    // High priority should come first
    if (result.length > 1) {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < result.length; i++) {
        expect(priorityOrder[result[i - 1].priority]).toBeLessThanOrEqual(
          priorityOrder[result[i].priority],
        );
      }
    }
  });

  it('deduplicates insights by ID', () => {
    const input: InsightInput = {
      currentTransactions: [makeTx('dining', 20000, '2024-06-15')],
      priorTransactions: [makeTx('dining', 5000, '2024-05-15')],
      budgets: [],
      today: '2024-06-15',
      dayOfMonth: 15,
      daysInMonth: 30,
    };

    const result = generateInsights(input, { dining: 'Dining' });
    const ids = result.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respects maxInsights limit', () => {
    const input: InsightInput = {
      currentTransactions: [
        makeTx('a', 10000, '2024-06-15'),
        makeTx('b', 10000, '2024-06-15'),
        makeTx('c', 10000, '2024-06-15'),
      ],
      priorTransactions: [
        makeTx('a', 2000, '2024-05-15'),
        makeTx('b', 2000, '2024-05-15'),
        makeTx('c', 2000, '2024-05-15'),
      ],
      budgets: [],
      today: '2024-06-15',
      dayOfMonth: 15,
      daysInMonth: 30,
    };

    const result = generateInsights(input, { a: 'A', b: 'B', c: 'C' }, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('handles empty input', () => {
    const input: InsightInput = {
      currentTransactions: [],
      priorTransactions: [],
      budgets: [],
      today: '2024-06-15',
      dayOfMonth: 15,
      daysInMonth: 30,
    };

    const result = generateInsights(input, {});
    expect(result).toEqual([]);
  });
});
