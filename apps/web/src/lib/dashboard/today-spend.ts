// SPDX-License-Identifier: BUSL-1.1

export interface TodaySpendInput {
  readonly expectedIncomeCents: number;
  readonly spentTodayCents: number;
  readonly remainingBillsCents: number;
  readonly plannedSavingsCents: number;
  readonly pinnedCategoryBudgetsCents: readonly number[];
}

export interface TodaySpendSummary {
  readonly todaySpendCents: number;
  readonly reservedCents: number;
  readonly funMoneyCents: number;
  readonly canSpendToday: boolean;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function calculateTodaySpendSummary(input: TodaySpendInput): TodaySpendSummary {
  const todaySpendCents = nonNegative(input.spentTodayCents);
  const reservedCents =
    nonNegative(input.remainingBillsCents) +
    nonNegative(input.plannedSavingsCents) +
    input.pinnedCategoryBudgetsCents.reduce((sum, value) => sum + nonNegative(value), 0);
  const funMoneyCents = nonNegative(input.expectedIncomeCents) - reservedCents - todaySpendCents;

  return {
    todaySpendCents,
    reservedCents,
    funMoneyCents,
    canSpendToday: funMoneyCents > 0,
  };
}
