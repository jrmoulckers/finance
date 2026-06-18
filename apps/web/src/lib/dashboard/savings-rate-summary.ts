// SPDX-License-Identifier: BUSL-1.1

export interface MonthlyCashFlow {
  readonly month: string;
  readonly incomeCents: number;
  readonly expenseCents: number;
}

export interface SavingsRatePeriodSummary {
  readonly month: string;
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly savingsCents: number;
  readonly savingsRatePercent: number;
}

export interface SavingsRateDashboardSummary {
  readonly current: SavingsRatePeriodSummary | null;
  readonly prior: SavingsRatePeriodSummary | null;
  readonly trailingThreeMonth: SavingsRatePeriodSummary | null;
}

function summarize(month: string, rows: readonly MonthlyCashFlow[]): SavingsRatePeriodSummary {
  const incomeCents = rows.reduce((sum, row) => sum + Math.max(0, row.incomeCents), 0);
  const expenseCents = rows.reduce((sum, row) => sum + Math.max(0, row.expenseCents), 0);
  const savingsCents = incomeCents - expenseCents;
  return {
    month,
    incomeCents,
    expenseCents,
    savingsCents,
    savingsRatePercent:
      incomeCents === 0 ? 0 : Math.round((savingsCents / incomeCents) * 10000) / 100,
  };
}

export function buildSavingsRateDashboardSummary(
  rows: readonly MonthlyCashFlow[],
  currentMonth: string,
): SavingsRateDashboardSummary {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const currentIndex = sorted.findIndex((row) => row.month === currentMonth);
  const currentRows = sorted.filter((row) => row.month === currentMonth);
  const priorRows =
    currentIndex <= 0 ? [] : sorted.filter((row) => row.month === sorted[currentIndex - 1].month);
  const trailingRows = sorted.filter((row) => row.month <= currentMonth).slice(-3);

  return {
    current: currentRows.length === 0 ? null : summarize(currentMonth, currentRows),
    prior: priorRows.length === 0 ? null : summarize(priorRows[0].month, priorRows),
    trailingThreeMonth:
      trailingRows.length === 0
        ? null
        : summarize(`${trailingRows[0].month}..${currentMonth}`, trailingRows),
  };
}
