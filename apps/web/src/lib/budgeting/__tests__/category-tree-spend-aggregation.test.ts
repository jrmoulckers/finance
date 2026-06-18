// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { aggregateCategoryTreeMonthlySpend } from '../category-tree-spend-aggregation';

describe('aggregateCategoryTreeMonthlySpend', () => {
  it('includes child categories and split transactions while excluding non-expense records', () => {
    const result = aggregateCategoryTreeMonthlySpend({
      asOfMonth: '2025-03',
      lookbackMonths: 3,
      categories: [
        { id: 'food', name: 'Food', type: 'expense' },
        { id: 'groceries', name: 'Groceries', parentId: 'food', type: 'expense' },
        { id: 'dining', name: 'Dining', parentId: 'food', type: 'expense' },
        { id: 'salary', name: 'Salary', type: 'income' },
      ],
      transactions: [
        {
          id: 'jan',
          categoryId: 'groceries',
          amountCents: -40_000,
          date: '2025-01-05',
          kind: 'expense',
        },
        {
          id: 'split',
          amountCents: -30_000,
          date: '2025-02-05',
          kind: 'expense',
          splits: [
            { categoryId: 'groceries', amountCents: -20_000 },
            { categoryId: 'dining', amountCents: -10_000 },
          ],
        },
        {
          id: 'income',
          categoryId: 'salary',
          amountCents: 300_000,
          date: '2025-02-10',
          kind: 'income',
        },
        {
          id: 'transfer',
          categoryId: 'food',
          amountCents: -5_000,
          date: '2025-02-10',
          kind: 'transfer',
        },
        {
          id: 'deleted',
          categoryId: 'food',
          amountCents: -5_000,
          date: '2025-02-10',
          deleted: true,
        },
      ],
    });

    expect(result.months).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(result.totalsByCategoryId).toMatchObject({
      food: 70_000,
      groceries: 60_000,
      dining: 10_000,
    });
    expect(
      result.monthlySpend.find(
        (sample) => sample.categoryId === 'food' && sample.monthKey === '2025-02',
      )?.amountCents,
    ).toBe(30_000);
  });
});
