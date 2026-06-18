// SPDX-License-Identifier: BUSL-1.1

export interface SharedBillInput {
  readonly id: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly paid: boolean;
  readonly critical: boolean;
}

export interface PinnedCategoryInput {
  readonly id: string;
  readonly budgetCents: number;
  readonly spentCents: number;
  readonly pinned: boolean;
}

export interface SharedSafeToSpendInput {
  readonly expectedIncomeCents: number;
  readonly plannedSavingsCents: number;
  readonly discretionarySpentCents: number;
  readonly bills: readonly SharedBillInput[];
  readonly pinnedCategories: readonly PinnedCategoryInput[];
  readonly today: string;
  readonly periodEnd: string;
  readonly nextPayday: string;
  readonly lastUpdatedAt: string;
}

export interface SharedSafeToSpendSummary {
  readonly safeToSpendCents: number;
  readonly remainingCriticalBillsCents: number;
  readonly pinnedCategoryReserveCents: number;
  readonly dailyAllowanceUntilPaydayCents: number;
  readonly staleData: boolean;
  readonly warnings: readonly string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function daysBetween(start: string, end: string): number {
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / MS_PER_DAY));
}

export function calculateSharedSafeToSpend(
  input: SharedSafeToSpendInput,
): SharedSafeToSpendSummary {
  const remainingCriticalBillsCents = input.bills
    .filter(
      (bill) =>
        !bill.paid &&
        bill.critical &&
        bill.dueDate >= input.today &&
        bill.dueDate <= input.periodEnd,
    )
    .reduce((sum, bill) => sum + normalizeCents(bill.amountCents), 0);
  const pinnedCategoryReserveCents = input.pinnedCategories
    .filter((category) => category.pinned)
    .reduce(
      (sum, category) =>
        sum +
        Math.max(0, normalizeCents(category.budgetCents) - normalizeCents(category.spentCents)),
      0,
    );
  const safeToSpendCents =
    normalizeCents(input.expectedIncomeCents) -
    remainingCriticalBillsCents -
    normalizeCents(input.plannedSavingsCents) -
    normalizeCents(input.discretionarySpentCents) -
    pinnedCategoryReserveCents;
  const daysUntilPayday = Math.max(1, daysBetween(input.today, input.nextPayday) + 1);
  const staleData = daysBetween(input.lastUpdatedAt.slice(0, 10), input.today) > 3;
  const warnings: string[] = [];
  if (safeToSpendCents < 0) warnings.push('overspent');
  if (staleData) warnings.push('stale-data');

  return {
    safeToSpendCents,
    remainingCriticalBillsCents,
    pinnedCategoryReserveCents,
    dailyAllowanceUntilPaydayCents: Math.floor(safeToSpendCents / daysUntilPayday),
    staleData,
    warnings,
  };
}
