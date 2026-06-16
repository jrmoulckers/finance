// SPDX-License-Identifier: BUSL-1.1

/**
 * Safe-to-spend calculation for the retiree dashboard glance card.
 *
 * Formula, in cents:
 * expected monthly income
 *   − unpaid bills still due this month
 *   − planned savings or goal contributions for this month
 *   − discretionary spending already made this month
 * = safe-to-spend amount remaining.
 *
 * Inputs are normalized to non-negative cents so missing or invalid upstream data
 * cannot accidentally increase the amount shown to the user.
 */
export interface SafeToSpendInput {
  readonly expectedMonthlyIncomeCents: number;
  readonly remainingBillsCents: number;
  readonly plannedSavingsCents: number;
  readonly discretionarySpentCents: number;
}

export interface SafeToSpendBreakdown extends SafeToSpendInput {
  readonly safeToSpendCents: number;
}

function normalizeCents(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendBreakdown {
  const expectedMonthlyIncomeCents = normalizeCents(input.expectedMonthlyIncomeCents);
  const remainingBillsCents = normalizeCents(input.remainingBillsCents);
  const plannedSavingsCents = normalizeCents(input.plannedSavingsCents);
  const discretionarySpentCents = normalizeCents(input.discretionarySpentCents);

  return {
    expectedMonthlyIncomeCents,
    remainingBillsCents,
    plannedSavingsCents,
    discretionarySpentCents,
    safeToSpendCents:
      expectedMonthlyIncomeCents -
      remainingBillsCents -
      plannedSavingsCents -
      discretionarySpentCents,
  };
}
