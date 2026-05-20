// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { DigestBudget, DigestTransaction } from './spending-digests';
import {
  aggregateCategorySpending,
  buildCategoryComparisons,
  formatCentsToDollars,
  generateNarratives,
  generateSpendingDigest,
  percentChange,
  pickTopTransactions,
} from './spending-digests';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TX_DINING: DigestTransaction = {
  id: 'tx-1',
  description: 'Sushi Place',
  amountCents: 4500,
  categoryId: 'cat-dining',
  categoryName: 'Dining',
  date: '2025-01-15',
};

const TX_GROCERIES: DigestTransaction = {
  id: 'tx-2',
  description: 'Whole Foods',
  amountCents: 8000,
  categoryId: 'cat-groceries',
  categoryName: 'Groceries',
  date: '2025-01-14',
};

const TX_DINING2: DigestTransaction = {
  id: 'tx-3',
  description: 'Pizza Joint',
  amountCents: 2500,
  categoryId: 'cat-dining',
  categoryName: 'Dining',
  date: '2025-01-16',
};

const TX_TRANSPORT: DigestTransaction = {
  id: 'tx-4',
  description: 'Gas Station',
  amountCents: 6000,
  categoryId: 'cat-transport',
  categoryName: 'Transport',
  date: '2025-01-13',
};

const BUDGETS: DigestBudget[] = [
  { categoryId: 'cat-dining', categoryName: 'Dining', allocatedCents: 5000 },
  { categoryId: 'cat-groceries', categoryName: 'Groceries', allocatedCents: 10000 },
];

const CURRENT_TXS = [TX_DINING, TX_GROCERIES, TX_DINING2, TX_TRANSPORT];
const PRIOR_TXS: DigestTransaction[] = [
  { ...TX_DINING, id: 'p-1', amountCents: 6000 },
  { ...TX_GROCERIES, id: 'p-2', amountCents: 9000 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('percentChange', () => {
  it('returns 0 when both are zero', () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it('returns 100 when prior is zero and current is positive', () => {
    expect(percentChange(0, 500)).toBe(100);
  });

  it('computes positive change correctly', () => {
    expect(percentChange(1000, 1150)).toBe(15);
  });

  it('computes negative change correctly', () => {
    expect(percentChange(1000, 850)).toBe(-15);
  });
});

describe('formatCentsToDollars', () => {
  it('formats positive amounts', () => {
    expect(formatCentsToDollars(1234)).toBe('$12.34');
  });

  it('formats zero', () => {
    expect(formatCentsToDollars(0)).toBe('$0.00');
  });

  it('formats negative amounts', () => {
    expect(formatCentsToDollars(-500)).toBe('-$5.00');
  });

  it('pads cents correctly', () => {
    expect(formatCentsToDollars(105)).toBe('$1.05');
  });
});

describe('aggregateCategorySpending', () => {
  it('aggregates spending by category', () => {
    const result = aggregateCategorySpending(CURRENT_TXS, BUDGETS);
    expect(result).toHaveLength(3);
    // Groceries = 8000 (highest)
    expect(result[0].categoryId).toBe('cat-groceries');
    expect(result[0].spentCents).toBe(8000);
  });

  it('computes budget usage percentage', () => {
    const result = aggregateCategorySpending(CURRENT_TXS, BUDGETS);
    const dining = result.find((c) => c.categoryId === 'cat-dining')!;
    // Dining: 4500 + 2500 = 7000 out of 5000 budget = 140%
    expect(dining.spentCents).toBe(7000);
    expect(dining.budgetUsedPercent).toBe(140);
  });

  it('sets budgetUsedPercent to 0 when no budget exists', () => {
    const result = aggregateCategorySpending(CURRENT_TXS, BUDGETS);
    const transport = result.find((c) => c.categoryId === 'cat-transport')!;
    expect(transport.budgetUsedPercent).toBe(0);
  });

  it('returns empty for empty transactions', () => {
    expect(aggregateCategorySpending([], BUDGETS)).toEqual([]);
  });
});

describe('pickTopTransactions', () => {
  it('returns top N transactions sorted by amount', () => {
    const result = pickTopTransactions(CURRENT_TXS, 2);
    expect(result).toHaveLength(2);
    expect(result[0].amountCents).toBe(8000);
    expect(result[1].amountCents).toBe(6000);
  });

  it('handles count larger than available', () => {
    const result = pickTopTransactions(CURRENT_TXS, 100);
    expect(result).toHaveLength(4);
  });

  it('handles zero count', () => {
    expect(pickTopTransactions(CURRENT_TXS, 0)).toEqual([]);
  });
});

describe('buildCategoryComparisons', () => {
  it('computes comparisons across periods', () => {
    const result = buildCategoryComparisons(CURRENT_TXS, PRIOR_TXS);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes categories only in current period', () => {
    const result = buildCategoryComparisons(CURRENT_TXS, PRIOR_TXS);
    const transport = result.find((c) => c.categoryId === 'cat-transport');
    expect(transport).toBeDefined();
    expect(transport!.priorCents).toBe(0);
    expect(transport!.currentCents).toBe(6000);
  });

  it('sorts by absolute change descending', () => {
    const result = buildCategoryComparisons(CURRENT_TXS, PRIOR_TXS);
    for (let i = 1; i < result.length; i++) {
      expect(Math.abs(result[i - 1].changeCents)).toBeGreaterThanOrEqual(
        Math.abs(result[i].changeCents),
      );
    }
  });
});

describe('generateNarratives', () => {
  it('generates at least one narrative', () => {
    const comparison = {
      priorTotalCents: 15000,
      currentTotalCents: 21000,
      changeCents: 6000,
      changePercent: 40,
    };
    const categories = aggregateCategorySpending(CURRENT_TXS, BUDGETS);
    const catComparisons = buildCategoryComparisons(CURRENT_TXS, PRIOR_TXS);
    const result = generateNarratives(comparison, catComparisons, categories, 'weekly');
    expect(result.length).toBeGreaterThan(0);
  });

  it('notes when spending decreased', () => {
    const comparison = {
      priorTotalCents: 20000,
      currentTotalCents: 15000,
      changeCents: -5000,
      changePercent: -25,
    };
    const result = generateNarratives(comparison, [], [], 'weekly');
    expect(result[0]).toContain('less');
  });
});

describe('generateSpendingDigest', () => {
  it('produces a complete digest', () => {
    const digest = generateSpendingDigest(
      'weekly',
      '2025-01-13',
      '2025-01-19',
      CURRENT_TXS,
      PRIOR_TXS,
      BUDGETS,
    );

    expect(digest.period).toBe('weekly');
    expect(digest.startDate).toBe('2025-01-13');
    expect(digest.endDate).toBe('2025-01-19');
    expect(digest.totalSpentCents).toBe(21000);
    expect(digest.topCategories.length).toBeGreaterThan(0);
    expect(digest.topTransactions.length).toBeGreaterThan(0);
    expect(digest.comparison).toBeDefined();
    expect(digest.narratives.length).toBeGreaterThan(0);
  });

  it('handles empty transactions', () => {
    const digest = generateSpendingDigest('daily', '2025-01-15', '2025-01-15', [], [], []);
    expect(digest.totalSpentCents).toBe(0);
    expect(digest.topCategories).toEqual([]);
    expect(digest.topTransactions).toEqual([]);
  });
});
