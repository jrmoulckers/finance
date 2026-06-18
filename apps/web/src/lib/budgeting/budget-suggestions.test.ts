// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { BudgetSuggestionCategory, BudgetSuggestionTransaction } from './budget-suggestions';
import { suggestCategoryBudgetAmount } from './budget-suggestions';

const categories: BudgetSuggestionCategory[] = [
  { id: 'food', name: 'Food', type: 'expense' },
  { id: 'groceries', name: 'Groceries', parentId: 'food', type: 'expense' },
  { id: 'rent', name: 'Rent', type: 'expense' },
  { id: 'paycheck', name: 'Paycheck', type: 'income' },
];

function expense(
  id: string,
  categoryId: string,
  date: string,
  amountCents: number,
): BudgetSuggestionTransaction {
  return { id, categoryId, amountCents, date, kind: 'expense', deleted: false };
}

describe('suggestCategoryBudgetAmount', () => {
  it('returns an accessible empty-history fallback when no spending exists', () => {
    const result = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      transactions: [],
      asOfMonth: '2025-04',
    });

    expect(result).toMatchObject({
      suggestedAmountCents: null,
      confidence: 'none',
      fallbackReason: 'empty-history',
      monthsWithSpend: 0,
    });
    expect(result.basis).toContain('No recent spending');
  });

  it('dampens high outliers in hybrid suggestions while preserving high-water rule', () => {
    const transactions = [
      expense('jan', 'food', '2025-01-05', 10_000),
      expense('feb', 'food', '2025-02-05', 10_000),
      expense('mar', 'food', '2025-03-05', 10_000),
      expense('apr', 'food', '2025-04-05', 100_000),
    ];

    const hybrid = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      transactions,
      asOfMonth: '2025-04',
      lookbackMonths: 4,
    });
    const highWater = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      transactions,
      asOfMonth: '2025-04',
      lookbackMonths: 4,
      rule: 'high-water',
    });

    expect(hybrid.outlierMonthKeys).toEqual(['2025-04']);
    expect(hybrid.suggestedAmountCents).toBe(10_000);
    expect(highWater.suggestedAmountCents).toBe(100_000);
  });

  it('marks sparse history as low confidence', () => {
    const result = suggestCategoryBudgetAmount({
      categoryId: 'rent',
      categories,
      transactions: [expense('rent-1', 'rent', '2025-04-01', 150_000)],
      asOfMonth: '2025-04',
    });

    expect(result).toMatchObject({
      confidence: 'low',
      fallbackReason: 'sparse-history',
      monthsWithSpend: 1,
    });
  });

  it('aggregates child category spending by default and excludes income/deleted rows', () => {
    const result = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      transactions: [
        expense('food-1', 'food', '2025-03-01', 20_000),
        expense('child-1', 'groceries', '2025-03-02', 30_000),
        { ...expense('deleted', 'food', '2025-03-03', 90_000), deleted: true },
        {
          id: 'income',
          categoryId: 'paycheck',
          amountCents: 500_000,
          date: '2025-03-04',
          kind: 'income',
        },
      ],
      asOfMonth: '2025-03',
      lookbackMonths: 1,
    });

    expect(result.includesChildren).toBe(true);
    expect(result.samples).toEqual([{ monthKey: '2025-03', amountCents: 50_000 }]);
    expect(result.suggestedAmountCents).toBe(50_000);
  });
});
