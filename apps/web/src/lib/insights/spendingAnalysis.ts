// SPDX-License-Identifier: BUSL-1.1

import type { Category, Transaction } from '../../kmp/bridge';
import { compareValues, getMonthToDateWindows, normalizeExpense } from './helpers';
import type { SpendingAnalysis } from './types';

function buildCategoryTotals(
  transactions: readonly Transaction[],
  categoriesById: ReadonlyMap<string, string>,
  startDate: string,
  endDate: string,
): Map<string, { categoryId: string | null; categoryName: string; amount: number }> {
  const totals = new Map<
    string,
    { categoryId: string | null; categoryName: string; amount: number }
  >();

  for (const transaction of transactions) {
    if (
      transaction.type !== 'EXPENSE' ||
      transaction.date < startDate ||
      transaction.date > endDate
    ) {
      continue;
    }

    const key = transaction.categoryId ?? '__uncategorized__';
    const existing = totals.get(key) ?? {
      categoryId: transaction.categoryId,
      categoryName:
        transaction.categoryId === null
          ? 'Uncategorized'
          : (categoriesById.get(transaction.categoryId) ?? 'Unknown'),
      amount: 0,
    };

    existing.amount += normalizeExpense(transaction.amount.amount);
    totals.set(key, existing);
  }

  return totals;
}

export function analyzeSpendingByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  now: Date = new Date(),
): SpendingAnalysis {
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const { current, previous } = getMonthToDateWindows(now);
  const currentTotals = buildCategoryTotals(
    transactions,
    categoriesById,
    current.startDate,
    current.endDate,
  );
  const previousTotals = buildCategoryTotals(
    transactions,
    categoriesById,
    previous.startDate,
    previous.endDate,
  );

  const totalCurrentSpending = Array.from(currentTotals.values()).reduce(
    (sum, category) => sum + category.amount,
    0,
  );
  const totalPreviousSpending = Array.from(previousTotals.values()).reduce(
    (sum, category) => sum + category.amount,
    0,
  );

  const topCategories = Array.from(
    new Set([...currentTotals.keys(), ...previousTotals.keys()]),
    (key) => {
      const currentCategory = currentTotals.get(key) ?? previousTotals.get(key);
      const currentAmount = currentTotals.get(key)?.amount ?? 0;
      const previousAmount = previousTotals.get(key)?.amount ?? 0;

      return {
        categoryId: currentCategory?.categoryId ?? null,
        categoryName: currentCategory?.categoryName ?? 'Uncategorized',
        currentAmount,
        previousAmount,
        shareOfSpending:
          totalCurrentSpending > 0 ? Math.round((currentAmount / totalCurrentSpending) * 100) : 0,
        change: compareValues(currentAmount, previousAmount),
      };
    },
  )
    .sort((left, right) => {
      if (right.currentAmount !== left.currentAmount) {
        return right.currentAmount - left.currentAmount;
      }

      return right.previousAmount - left.previousAmount;
    })
    .slice(0, 5);

  return {
    totalCurrentSpending,
    totalPreviousSpending,
    change: compareValues(totalCurrentSpending, totalPreviousSpending),
    topCategories,
  };
}
