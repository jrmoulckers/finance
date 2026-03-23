// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook that projects end-of-month balance based on recurring
 * transactions and average daily spending / income.
 *
 * All monetary values are in cents (integer arithmetic) to match KMP
 * conventions and avoid floating-point precision issues.
 *
 * Usage:
 * ```tsx
 * const { projections, endOfMonthBalance, confidence } = usePredictiveBalance();
 * ```
 *
 * References: issue #324
 */

import { useMemo } from 'react';
import { useAccounts } from './useAccounts';
import { useTransactions } from './useTransactions';
import { useRecurringRules } from './useRecurringRules';
import type { RecurringRule } from '../db/repositories/recurring-rules';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single day's balance projection. */
export interface BalanceProjection {
  /** ISO local date in YYYY-MM-DD format. */
  date: string;
  /** Projected balance in cents. */
  projected: number;
  /** Actual balance in cents, or `null` for future dates. */
  actual: number | null;
  /** Human-readable label (e.g. "Mar 23"). */
  label: string;
}

/** Shape returned by {@link usePredictiveBalance}. */
export interface UsePredictiveBalanceResult {
  /** Daily projections from start of month through end of month. */
  projections: BalanceProjection[];
  /** Projected balance at the end of the month in cents. */
  endOfMonthBalance: number;
  /** Confidence level based on available data quality. */
  confidence: 'high' | 'medium' | 'low';
  /** Number of calendar days remaining in the current month (including today). */
  daysRemaining: number;
  /** `true` while underlying data is still loading. */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD using local values. */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the number of days in a given month (1-indexed). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Format a YYYY-MM-DD date as a short label, e.g. "Mar 23". */
export function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Advance a date string by the given recurring frequency.
 * Mirrors the logic in the recurring-rules repository.
 */
function advanceByFrequency(dateStr: string, frequency: RecurringRule['frequency']): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number];

  switch (frequency) {
    case 'DAILY':
      return formatLocalDate(new Date(year, month - 1, day + 1));
    case 'WEEKLY':
      return formatLocalDate(new Date(year, month - 1, day + 7));
    case 'BIWEEKLY':
      return formatLocalDate(new Date(year, month - 1, day + 14));
    case 'MONTHLY': {
      let newMonth = month + 1;
      let newYear = year;
      if (newMonth > 12) {
        newMonth = 1;
        newYear = year + 1;
      }
      const newDay = Math.min(day, daysInMonth(newYear, newMonth));
      return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
    }
    case 'YEARLY': {
      const yy = year + 1;
      const dd = Math.min(day, daysInMonth(yy, month));
      return `${yy}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
}

/**
 * Get all upcoming occurrences of a recurring rule that fall between
 * `startDate` (inclusive) and `endDate` (inclusive).
 *
 * Returns net amounts: positive for INCOME, negative for EXPENSE.
 */
export function getRecurringOccurrencesInRange(
  rule: RecurringRule,
  startDate: string,
  endDate: string,
): Map<string, number> {
  const occurrences = new Map<string, number>();
  if (!rule.isActive) return occurrences;

  let currentDate = rule.startDate;

  // Fast-forward past dates that precede the range
  while (currentDate < startDate) {
    currentDate = advanceByFrequency(currentDate, rule.frequency);
  }

  // Collect occurrences within the range
  while (currentDate <= endDate) {
    if (rule.endDate && currentDate > rule.endDate) break;

    const amount =
      rule.type === 'INCOME' ? Math.abs(rule.amount.amount) : -Math.abs(rule.amount.amount);

    occurrences.set(currentDate, (occurrences.get(currentDate) ?? 0) + amount);
    currentDate = advanceByFrequency(currentDate, rule.frequency);
  }

  return occurrences;
}

/**
 * Determine confidence level based on the number of days of transaction
 * history available in the lookback window.
 */
export function determineConfidence(transactionDays: number): 'high' | 'medium' | 'low' {
  if (transactionDays >= 30) return 'high';
  if (transactionDays >= 14) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePredictiveBalance(): UsePredictiveBalanceResult {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { transactions, loading: txnLoading } = useTransactions();
  const { rules, loading: rulesLoading } = useRecurringRules();

  const loading = accountsLoading || txnLoading || rulesLoading;

  const result = useMemo(() => {
    // -------------------------------------------------------------------
    // Date boundaries
    // -------------------------------------------------------------------
    const now = new Date();
    const todayStr = formatLocalDate(now);
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed
    const totalDaysInMonth = daysInMonth(year, month);
    const today = now.getDate();
    const daysRemaining = totalDaysInMonth - today + 1; // including today

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(totalDaysInMonth).padStart(2, '0')}`;

    // -------------------------------------------------------------------
    // Current total balance (sum of all account balances)
    // -------------------------------------------------------------------
    const currentBalance = accounts.reduce((sum, acct) => sum + acct.currentBalance.amount, 0);

    // -------------------------------------------------------------------
    // Last 30 days of transactions for averages
    // -------------------------------------------------------------------
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = formatLocalDate(thirtyDaysAgo);

    const recentTransactions = transactions.filter(
      (t) => t.date >= thirtyDaysAgoStr && t.date <= todayStr,
    );

    // Count distinct days with transactions for confidence
    const distinctDays = new Set(recentTransactions.map((t) => t.date)).size;

    // Sum expenses and income over last 30 days
    let totalExpenses30d = 0;
    let totalIncome30d = 0;
    for (const t of recentTransactions) {
      if (t.type === 'EXPENSE') {
        totalExpenses30d += Math.abs(t.amount.amount);
      } else if (t.type === 'INCOME') {
        totalIncome30d += Math.abs(t.amount.amount);
      }
    }

    // Actual number of calendar days in the lookback window
    const lookbackDays = Math.max(
      1,
      Math.round((now.getTime() - thirtyDaysAgo.getTime()) / 86_400_000) + 1,
    );

    const avgDailyExpense = Math.round(totalExpenses30d / lookbackDays);
    const avgDailyIncome = Math.round(totalIncome30d / lookbackDays);

    // -------------------------------------------------------------------
    // Recurring transaction occurrences for the rest of the month
    // -------------------------------------------------------------------
    // Merge all recurring rule occurrences into a single day→net map
    const recurringByDay = new Map<string, number>();
    for (const rule of rules) {
      const occurrences = getRecurringOccurrencesInRange(rule, todayStr, monthEnd);
      for (const [date, amount] of occurrences) {
        recurringByDay.set(date, (recurringByDay.get(date) ?? 0) + amount);
      }
    }

    // -------------------------------------------------------------------
    // Actual daily balance changes from transactions this month
    // (up to and including today)
    // -------------------------------------------------------------------
    const txnThisMonth = transactions.filter((t) => t.date >= monthStart && t.date <= todayStr);
    const dailyActualChange = new Map<string, number>();
    for (const t of txnThisMonth) {
      let delta = 0;
      if (t.type === 'INCOME') delta = Math.abs(t.amount.amount);
      else if (t.type === 'EXPENSE') delta = -Math.abs(t.amount.amount);
      dailyActualChange.set(t.date, (dailyActualChange.get(t.date) ?? 0) + delta);
    }

    // -------------------------------------------------------------------
    // Build day-by-day projections
    // -------------------------------------------------------------------
    const projections: BalanceProjection[] = [];

    // We need the balance at the start of the month.
    // Work backwards from currentBalance by subtracting today's already-
    // accounted-for transactions.
    const totalChangeThisMonth = Array.from(dailyActualChange.values()).reduce((s, v) => s + v, 0);
    const balanceAtMonthStart = currentBalance - totalChangeThisMonth;

    let runningActual = balanceAtMonthStart;
    let runningProjected = balanceAtMonthStart;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      if (!isFuture) {
        // Actual date — use real transaction data
        const actualChange = dailyActualChange.get(dateStr) ?? 0;
        runningActual += actualChange;
        // Also advance projected to track actuals through today
        runningProjected = runningActual;

        projections.push({
          date: dateStr,
          projected: runningProjected,
          actual: runningActual,
          label: formatDayLabel(dateStr),
        });
      } else {
        // Future date — project using averages + known recurring
        const recurringDelta = recurringByDay.get(dateStr) ?? 0;
        const netDailyChange = avgDailyIncome - avgDailyExpense + recurringDelta;
        runningProjected += netDailyChange;

        projections.push({
          date: dateStr,
          projected: runningProjected,
          actual: null,
          label: formatDayLabel(dateStr),
        });
      }
    }

    const endOfMonthBalance =
      projections.length > 0 ? projections[projections.length - 1]!.projected : currentBalance;

    const confidence = determineConfidence(distinctDays);

    return {
      projections,
      endOfMonthBalance,
      confidence,
      daysRemaining,
    };
  }, [accounts, transactions, rules]);

  return {
    ...result,
    loading,
  };
}
