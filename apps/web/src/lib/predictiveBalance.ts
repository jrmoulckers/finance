// SPDX-License-Identifier: BUSL-1.1

/**
 * Predictive balance engine.
 *
 * Computes end-of-month balance predictions based on:
 *   1. Current account balances
 *   2. Historical spending patterns (daily average from past months)
 *   3. Known recurring transactions
 *   4. Days remaining in the current month
 *
 * All monetary values are in cents (integer arithmetic).
 *
 * Pure functions — no side effects, fully testable.
 *
 * References: issue #324
 */

import type { Transaction } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Prediction result for a single account. */
export interface AccountPrediction {
  /** Account identifier. */
  readonly accountId: string;
  /** Account name (for display). */
  readonly accountName: string;
  /** Current balance in cents. */
  readonly currentBalanceCents: number;
  /** Predicted end-of-month balance in cents. */
  readonly predictedBalanceCents: number;
  /** Projected spending for the rest of the month in cents. */
  readonly projectedSpendingCents: number;
  /** Projected income for the rest of the month in cents. */
  readonly projectedIncomeCents: number;
  /** Average daily spending based on historical data in cents. */
  readonly avgDailySpendingCents: number;
  /** Average daily income based on historical data in cents. */
  readonly avgDailyIncomeCents: number;
  /** Number of days remaining in the current month. */
  readonly daysRemaining: number;
  /** Confidence score (0-1) based on data quality. */
  readonly confidence: number;
  /** Trend direction: positive, negative, or flat. */
  readonly trend: 'positive' | 'negative' | 'flat';
}

/** Overall prediction summary across all accounts. */
export interface PredictionSummary {
  /** Per-account predictions. */
  readonly accounts: AccountPrediction[];
  /** Total predicted end-of-month balance across all accounts. */
  readonly totalPredictedBalanceCents: number;
  /** Total current balance across all accounts. */
  readonly totalCurrentBalanceCents: number;
  /** Predicted change from current balance. */
  readonly predictedChangeCents: number;
  /** Date of prediction generation (ISO). */
  readonly generatedAt: string;
  /** End of current month (ISO local date). */
  readonly endOfMonth: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getDaysRemaining(): number {
  const now = new Date();
  const totalDays = getDaysInMonth(now.getFullYear(), now.getMonth());
  return Math.max(0, totalDays - now.getDate());
}

function getDaysElapsed(): number {
  return new Date().getDate();
}

function getEndOfMonth(): string {
  const now = new Date();
  const totalDays = getDaysInMonth(now.getFullYear(), now.getMonth());
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(totalDays).padStart(2, '0')}`;
}

function getMonthStart(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function getMonthEnd(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo + 1, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Compute average daily spending and income from historical transactions.
 *
 * @param transactions - All transactions for the lookback period.
 * @param lookbackMonths - Number of months to look back (default 3).
 * @returns Average daily spending and income in cents.
 */
export function computeHistoricalAverages(
  transactions: Transaction[],
  lookbackMonths = 3,
): { avgDailySpendingCents: number; avgDailyIncomeCents: number; totalDays: number } {
  let totalSpending = 0;
  let totalIncome = 0;
  let totalDays = 0;

  for (let i = 1; i <= lookbackMonths; i++) {
    const start = getMonthStart(i);
    const end = getMonthEnd(i);
    const daysInThatMonth = getDaysInMonth(
      new Date(start).getFullYear(),
      new Date(start).getMonth(),
    );
    totalDays += daysInThatMonth;

    for (const tx of transactions) {
      if (tx.date >= start && tx.date <= end) {
        if (tx.type === 'EXPENSE') {
          totalSpending += Math.abs(tx.amount.amount);
        } else if (tx.type === 'INCOME') {
          totalIncome += tx.amount.amount;
        }
      }
    }
  }

  return {
    avgDailySpendingCents: totalDays > 0 ? Math.round(totalSpending / totalDays) : 0,
    avgDailyIncomeCents: totalDays > 0 ? Math.round(totalIncome / totalDays) : 0,
    totalDays,
  };
}

/**
 * Compute spending already done in the current month.
 */
export function computeCurrentMonthSpending(transactions: Transaction[]): {
  spentCents: number;
  incomeCents: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${year}-${month}-01`;
  const today = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

  let spentCents = 0;
  let incomeCents = 0;

  for (const tx of transactions) {
    if (tx.date >= monthStart && tx.date <= today) {
      if (tx.type === 'EXPENSE') {
        spentCents += Math.abs(tx.amount.amount);
      } else if (tx.type === 'INCOME') {
        incomeCents += tx.amount.amount;
      }
    }
  }

  return { spentCents, incomeCents };
}

/**
 * Generate end-of-month balance predictions.
 *
 * @param accounts - Account data with current balances.
 * @param transactions - All transactions (current + historical).
 * @param lookbackMonths - Historical lookback window (default 3).
 */
export function generatePredictions(
  accounts: Array<{
    id: string;
    name: string;
    currentBalance: { amount: number };
    accountId?: string;
  }>,
  transactions: Transaction[],
  lookbackMonths = 3,
): PredictionSummary {
  const daysRemaining = getDaysRemaining();
  const daysElapsed = getDaysElapsed();
  const endOfMonth = getEndOfMonth();

  const accountPredictions: AccountPrediction[] = accounts.map((account) => {
    // Filter transactions for this account
    const accountTxs = transactions.filter((tx) => tx.accountId === account.id);

    // Compute historical averages
    const { avgDailySpendingCents, avgDailyIncomeCents, totalDays } = computeHistoricalAverages(
      accountTxs,
      lookbackMonths,
    );

    // Current month actuals
    const { spentCents: currentMonthSpent, incomeCents: currentMonthIncome } =
      computeCurrentMonthSpending(accountTxs);

    // Use current-month daily rate if we have enough data (at least 7 days)
    let effectiveDailySpending = avgDailySpendingCents;
    let effectiveDailyIncome = avgDailyIncomeCents;

    if (daysElapsed >= 7) {
      // Blend historical and current-month rate (60% current, 40% historical)
      const currentDailySpending = Math.round(currentMonthSpent / daysElapsed);
      const currentDailyIncome = Math.round(currentMonthIncome / daysElapsed);
      effectiveDailySpending = Math.round(currentDailySpending * 0.6 + avgDailySpendingCents * 0.4);
      effectiveDailyIncome = Math.round(currentDailyIncome * 0.6 + avgDailyIncomeCents * 0.4);
    }

    const projectedSpendingCents = effectiveDailySpending * daysRemaining;
    const projectedIncomeCents = effectiveDailyIncome * daysRemaining;
    const predictedBalanceCents =
      account.currentBalance.amount - projectedSpendingCents + projectedIncomeCents;

    // Confidence: higher when more historical data is available
    let confidence = 0.3; // Base
    if (totalDays > 60) confidence += 0.3;
    else if (totalDays > 30) confidence += 0.2;
    if (daysElapsed >= 7) confidence += 0.2;
    if (accountTxs.length > 10) confidence += 0.2;
    confidence = Math.min(confidence, 1);

    // Trend
    const netChange = projectedIncomeCents - projectedSpendingCents;
    const trend: 'positive' | 'negative' | 'flat' =
      netChange > 1000 ? 'positive' : netChange < -1000 ? 'negative' : 'flat';

    return {
      accountId: account.id,
      accountName: account.name,
      currentBalanceCents: account.currentBalance.amount,
      predictedBalanceCents,
      projectedSpendingCents,
      projectedIncomeCents,
      avgDailySpendingCents: effectiveDailySpending,
      avgDailyIncomeCents: effectiveDailyIncome,
      daysRemaining,
      confidence,
      trend,
    };
  });

  const totalPredictedBalanceCents = accountPredictions.reduce(
    (sum, p) => sum + p.predictedBalanceCents,
    0,
  );
  const totalCurrentBalanceCents = accountPredictions.reduce(
    (sum, p) => sum + p.currentBalanceCents,
    0,
  );

  return {
    accounts: accountPredictions,
    totalPredictedBalanceCents,
    totalCurrentBalanceCents,
    predictedChangeCents: totalPredictedBalanceCents - totalCurrentBalanceCents,
    generatedAt: new Date().toISOString(),
    endOfMonth,
  };
}
