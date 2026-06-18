// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  suggestCategoryBudgetAmount,
  type BudgetSuggestionCategory,
  type BudgetSuggestionTransaction,
} from '../budget-suggestions';

const categories: BudgetSuggestionCategory[] = [
  { id: 'food', name: 'Food', type: 'expense' },
  { id: 'groceries', name: 'Groceries', parentId: 'food', type: 'expense' },
  { id: 'dining', name: 'Dining', parentId: 'food', type: 'expense' },
  { id: 'salary', name: 'Salary', type: 'income' },
];

function tx(overrides: Partial<BudgetSuggestionTransaction>): BudgetSuggestionTransaction {
  return {
    id: `tx-${overrides.date}-${overrides.categoryId}`,
    categoryId: 'groceries',
    amountCents: 10_000,
    date: '2025-06-01',
    kind: 'expense',
    ...overrides,
  };
}

describe('suggestCategoryBudgetAmount', () => {
  it('returns a clear fallback when there is no spending history', () => {
    const suggestion = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      transactions: [],
      asOfMonth: '2025-06',
    });

    expect(suggestion.suggestedAmountCents).toBeNull();
    expect(suggestion.confidence).toBe('none');
    expect(suggestion.fallbackReason).toBe('empty-history');
  });

  it('includes child categories when suggesting a parent amount', () => {
    const suggestion = suggestCategoryBudgetAmount({
      categoryId: 'food',
      categories,
      asOfMonth: '2025-06',
      rule: 'average',
      transactions: [
        tx({
          id: 'jan-grocery',
          date: '2025-01-05',
          categoryId: 'groceries',
          amountCents: -40_000,
        }),
        tx({ id: 'jan-dining', date: '2025-01-10', categoryId: 'dining', amountCents: -10_000 }),
        tx({
          id: 'feb-grocery',
          date: '2025-02-05',
          categoryId: 'groceries',
          amountCents: -30_000,
        }),
        tx({
          id: 'income',
          date: '2025-02-10',
          categoryId: 'salary',
          amountCents: 300_000,
          kind: 'income',
        }),
      ],
    });

    expect(suggestion.includesChildren).toBe(true);
    expect(suggestion.monthsWithSpend).toBe(2);
    expect(suggestion.suggestedAmountCents).toBe(40_000);
    expect(suggestion.fallbackReason).toBe('sparse-history');
  });

  it('dampens outliers with the hybrid rule', () => {
    const suggestion = suggestCategoryBudgetAmount({
      categoryId: 'groceries',
      categories,
      asOfMonth: '2025-06',
      transactions: [
        tx({ id: 'jan', date: '2025-01-05', amountCents: -10_000 }),
        tx({ id: 'feb', date: '2025-02-05', amountCents: -11_000 }),
        tx({ id: 'mar', date: '2025-03-05', amountCents: -10_500 }),
        tx({ id: 'apr', date: '2025-04-05', amountCents: -12_000 }),
        tx({ id: 'may', date: '2025-05-05', amountCents: -100_000 }),
        tx({ id: 'jun', date: '2025-06-05', amountCents: -11_500 }),
      ],
    });

    expect(suggestion.outlierMonthKeys).toEqual(['2025-05']);
    expect(suggestion.suggestedAmountCents).toBe(11_125);
    expect(suggestion.confidence).toBe('medium');
  });

  it('can use high-water mark when users prefer a conservative suggestion', () => {
    const suggestion = suggestCategoryBudgetAmount({
      categoryId: 'groceries',
      categories,
      asOfMonth: '2025-03',
      rule: 'high-water',
      transactions: [
        tx({ id: 'jan', date: '2025-01-05', amountCents: -10_000 }),
        tx({ id: 'feb', date: '2025-02-05', amountCents: -20_000 }),
        tx({ id: 'mar', date: '2025-03-05', amountCents: -15_000 }),
      ],
    });

    expect(suggestion.suggestedAmountCents).toBe(20_000);
    expect(suggestion.basis).toContain('high-water');
  });
});
