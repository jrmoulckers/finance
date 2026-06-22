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

// ---------------------------------------------------------------------------
// Dashboard card presentation model
// ---------------------------------------------------------------------------

/** Direction of the period-over-period savings-rate change. */
export type SavingsRateTrend = 'up' | 'down' | 'flat';

/** Semantic tone used to colour/label the card without relying on colour alone. */
export type SavingsRateTone = 'positive' | 'neutral' | 'caution';

/**
 * Presentation-ready model for the dashboard Savings Rate card.
 *
 * All monetary fields are integer cents. The savings rate is a percentage
 * (e.g. `37.5` means 37.5%) and is `0` when there is no income, with
 * `hasIncome` distinguishing the genuine-zero case (income equals spend) from
 * the no-income case (rate is not meaningful → display "N/A").
 */
export interface SavingsRateCardModel {
  /** Whether the current period has any income (false → show "N/A"). */
  readonly hasIncome: boolean;
  /** Current-period savings rate as a percentage (0 when no income). */
  readonly savingsRatePercent: number;
  /** Dollars saved this period in cents (income − spend; negative if overspent). */
  readonly savingsCents: number;
  /** Total income this period in cents. */
  readonly incomeCents: number;
  /** Total spend this period in cents. */
  readonly expenseCents: number;
  /** Prior-period savings rate, or null when there is no comparable prior period. */
  readonly priorSavingsRatePercent: number | null;
  /** Change in savings rate vs the prior period, in percentage points (null when no prior). */
  readonly deltaPercentagePoints: number | null;
  /** Direction of the period-over-period change. */
  readonly trend: SavingsRateTrend;
  /** Semantic tone for styling and the screen-reader status. */
  readonly tone: SavingsRateTone;
  /** Short plain-language status describing the current savings rate. */
  readonly statusLabel: string;
}

function classifySavingsRate(
  hasIncome: boolean,
  savingsRatePercent: number,
): { tone: SavingsRateTone; statusLabel: string } {
  if (!hasIncome) {
    return { tone: 'neutral', statusLabel: 'Add income to see your savings rate' };
  }
  if (savingsRatePercent < 0) {
    return { tone: 'caution', statusLabel: 'Spending more than you earn this period' };
  }
  if (savingsRatePercent < 10) {
    return { tone: 'neutral', statusLabel: 'Saving a little — aim for 20%' };
  }
  if (savingsRatePercent < 20) {
    return { tone: 'positive', statusLabel: 'Solid progress toward a 20% goal' };
  }
  return { tone: 'positive', statusLabel: 'Strong — at or above the 20% target' };
}

/**
 * Derive the dashboard Savings Rate card model from a savings-rate summary.
 *
 * Reuses the integer-cents savings-rate math from
 * {@link buildSavingsRateDashboardSummary} and adds the period-over-period
 * delta, trend direction, and a plain-language status. Division by zero is
 * already guarded upstream (income 0 → rate 0); this helper additionally
 * surfaces `hasIncome` so callers can render "N/A" instead of a misleading 0%.
 *
 * @param summary - Output of {@link buildSavingsRateDashboardSummary}.
 * @returns A presentation-ready, side-effect-free card model.
 */
export function buildSavingsRateCardModel(
  summary: SavingsRateDashboardSummary,
): SavingsRateCardModel {
  const current = summary.current;
  const prior = summary.prior;

  const incomeCents = current?.incomeCents ?? 0;
  const expenseCents = current?.expenseCents ?? 0;
  const savingsCents = current?.savingsCents ?? 0;
  const savingsRatePercent = current?.savingsRatePercent ?? 0;
  const hasIncome = incomeCents > 0;

  const priorSavingsRatePercent =
    prior !== null && prior.incomeCents > 0 ? prior.savingsRatePercent : null;

  const deltaPercentagePoints =
    !hasIncome || priorSavingsRatePercent === null
      ? null
      : Math.round((savingsRatePercent - priorSavingsRatePercent) * 100) / 100;

  const trend: SavingsRateTrend =
    deltaPercentagePoints === null || deltaPercentagePoints === 0
      ? 'flat'
      : deltaPercentagePoints > 0
        ? 'up'
        : 'down';

  const { tone, statusLabel } = classifySavingsRate(hasIncome, savingsRatePercent);

  return {
    hasIncome,
    savingsRatePercent,
    savingsCents,
    incomeCents,
    expenseCents,
    priorSavingsRatePercent,
    deltaPercentagePoints,
    trend,
    tone,
    statusLabel,
  };
}
