// SPDX-License-Identifier: BUSL-1.1

import type { BudgetVelocity, SpendingVelocityInput } from './types';

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthBounds(today: string) {
  const currentDate = parseLocalDate(today);
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  return {
    monthStart: formatLocalDate(monthStart),
    monthEnd: formatLocalDate(monthEnd),
    daysInMonth: monthEnd.getDate(),
    daysElapsed: Math.max(1, currentDate.getDate()),
  };
}

function isBudgetActiveThisMonth(
  budgetStartDate: string,
  budgetEndDate: string | null,
  monthStart: string,
  monthEnd: string,
): boolean {
  if (budgetStartDate > monthEnd) {
    return false;
  }

  if (budgetEndDate !== null && budgetEndDate < monthStart) {
    return false;
  }

  return true;
}

export function analyzeSpendingVelocity({
  budgets,
  categoriesById,
  transactions,
  today = formatLocalDate(new Date()),
}: SpendingVelocityInput): BudgetVelocity[] {
  const { monthStart, monthEnd, daysInMonth, daysElapsed } = getMonthBounds(today);

  return budgets
    .filter(
      (budget) =>
        budget.period === 'MONTHLY' &&
        isBudgetActiveThisMonth(budget.startDate, budget.endDate, monthStart, monthEnd),
    )
    .map((budget) => {
      const spentCents = transactions.reduce((total, transaction) => {
        if (
          transaction.type !== 'EXPENSE' ||
          transaction.categoryId !== budget.categoryId ||
          transaction.date < monthStart ||
          transaction.date > today
        ) {
          return total;
        }

        return total + Math.abs(transaction.amount.amount);
      }, 0);

      const budgetAmountCents = budget.amount.amount;
      const projectedSpendCents = Math.round((spentCents / daysElapsed) * daysInMonth);
      const remainingCents = budgetAmountCents - spentCents;
      const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
      const expectedSpendToDateCents = Math.round((budgetAmountCents / daysInMonth) * daysElapsed);
      const recommendedDailySpendCents =
        daysRemaining > 0 ? Math.max(0, Math.floor(remainingCents / daysRemaining)) : 0;

      return {
        id: `velocity:${budget.id}:${monthStart.slice(0, 7)}`,
        budgetId: budget.id,
        budgetName: budget.name,
        categoryId: budget.categoryId,
        categoryName: categoriesById.get(budget.categoryId) ?? budget.name,
        budgetAmountCents,
        spentCents,
        remainingCents,
        daysElapsed,
        daysRemaining,
        daysInMonth,
        projectedSpendCents,
        expectedSpendToDateCents,
        paceGapCents: projectedSpendCents - budgetAmountCents,
        recommendedDailySpendCents,
        isOverspendRisk: projectedSpendCents > budgetAmountCents,
      } satisfies BudgetVelocity;
    })
    .sort((left, right) => {
      if (left.isOverspendRisk !== right.isOverspendRisk) {
        return Number(right.isOverspendRisk) - Number(left.isOverspendRisk);
      }

      return right.paceGapCents - left.paceGapCents;
    });
}
