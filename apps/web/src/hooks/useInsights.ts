// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook that computes deeper financial analytics beyond the basic dashboard.
 *
 * Processes transaction data to derive monthly income/expense breakdowns,
 * category spending analysis with trends, top payees, average daily spend,
 * and savings rate over a configurable lookback period.
 *
 * All monetary values are in cents (integer arithmetic) to match KMP conventions.
 *
 * Usage:
 * ```tsx
 * const { monthlyBreakdown, categoryBreakdown, topPayees, savingsRate } = useInsights();
 * ```
 *
 * References: issue #241
 */

import { useMemo, useState } from 'react';
import { useTransactions } from './useTransactions';
import { useCategories } from './useCategories';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Income, expenses, and net for a single month. */
export interface MonthlyBreakdown {
  /** Month key in YYYY-MM format (e.g. "2026-03"). */
  month: string;
  /** Total income in cents. */
  income: number;
  /** Total expenses in cents (positive value). */
  expenses: number;
  /** Net = income − expenses, in cents. */
  net: number;
  /** Number of transactions in this month. */
  transactionCount: number;
}

/** Spending breakdown for a single category. */
export interface CategoryBreakdown {
  /** Category sync ID, or `null` for uncategorized transactions. */
  categoryId: string | null;
  /** Human-readable category name. */
  categoryName: string;
  /** Total spending in cents (positive). */
  total: number;
  /** Percentage of total spending (0-100). */
  percentage: number;
  /** Number of transactions in this category. */
  transactionCount: number;
  /** Trend vs the previous period of equal length. */
  trend: 'up' | 'down' | 'stable';
}

/** A payee ranked by total spend. */
export interface TopPayee {
  /** Payee / merchant name. */
  name: string;
  /** Total amount spent in cents (positive). */
  total: number;
  /** Number of transactions with this payee. */
  transactionCount: number;
}

/** Shape returned by {@link useInsights}. */
export interface UseInsightsResult {
  /** Month-by-month income, expenses, and net for the selected period. */
  monthlyBreakdown: MonthlyBreakdown[];
  /** Spending grouped by category with percentages and trends. */
  categoryBreakdown: CategoryBreakdown[];
  /** Top 10 payees by total amount. */
  topPayees: TopPayee[];
  /** Average daily spending in cents. */
  averageDailySpend: number;
  /** Savings rate as a percentage (0-100). */
  savingsRate: number;
  /** Whether data is still loading. */
  loading: boolean;
  /** Error message, or `null`. */
  error: string | null;
  /** Number of months being analyzed (3, 6, or 12). */
  selectedPeriod: number;
  /** Update the lookback period. */
  setSelectedPeriod: (months: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Return an ISO local-date string (YYYY-MM-DD) for the start of the period
 * that is `months` months before today.
 */
export function getPeriodStartDate(months: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  d.setDate(1); // first of that month
  return formatLocalDate(d);
}

/** Format a Date as YYYY-MM-DD. */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Extract the YYYY-MM portion from a YYYY-MM-DD date string. */
function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Count the number of calendar days between two ISO date strings (inclusive). */
export function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / 86_400_000) + 1);
}

/**
 * Generate all YYYY-MM month keys between two dates (inclusive of both
 * endpoint months).
 */
function generateMonthKeys(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  const [startY, startM] = startDate.split('-').map(Number) as [number, number];
  const [endY, endM] = endDate.split('-').map(Number) as [number, number];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInsights(): UseInsightsResult {
  const [selectedPeriod, setSelectedPeriod] = useState(6);

  const { transactions, loading: txnLoading, error: txnError } = useTransactions();
  const { categories, loading: catLoading, error: catError } = useCategories();

  const loading = txnLoading || catLoading;
  const error = txnError ?? catError ?? null;

  /** Map category ID → name for fast lookup. */
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const insights = useMemo(() => {
    // -----------------------------------------------------------------------
    // Date boundaries
    // -----------------------------------------------------------------------
    const now = new Date();
    const periodStart = getPeriodStartDate(selectedPeriod, now);
    const periodEnd = formatLocalDate(now);
    const previousPeriodStart = getPeriodStartDate(selectedPeriod * 2, now);

    // -----------------------------------------------------------------------
    // Filter transactions to the selected period
    // -----------------------------------------------------------------------
    const periodTransactions = transactions.filter(
      (t) => t.date >= periodStart && t.date <= periodEnd,
    );

    // Previous period transactions (for trend comparison)
    const prevTransactions = transactions.filter(
      (t) => t.date >= previousPeriodStart && t.date < periodStart,
    );

    // -----------------------------------------------------------------------
    // 1. Monthly breakdown
    // -----------------------------------------------------------------------
    const allMonthKeys = generateMonthKeys(periodStart, periodEnd);

    const monthMap = new Map<string, { income: number; expenses: number; count: number }>();

    // Initialise every month so the chart has no gaps.
    for (const mk of allMonthKeys) {
      monthMap.set(mk, { income: 0, expenses: 0, count: 0 });
    }

    for (const t of periodTransactions) {
      const mk = monthKey(t.date);
      const entry = monthMap.get(mk) ?? { income: 0, expenses: 0, count: 0 };

      if (t.type === 'INCOME') {
        entry.income += Math.abs(t.amount.amount);
      } else if (t.type === 'EXPENSE') {
        entry.expenses += Math.abs(t.amount.amount);
      }
      // TRANSFER transactions do not affect income or expenses.
      entry.count += 1;
      monthMap.set(mk, entry);
    }

    const monthlyBreakdown: MonthlyBreakdown[] = allMonthKeys.map((mk) => {
      const entry = monthMap.get(mk)!;
      return {
        month: mk,
        income: entry.income,
        expenses: entry.expenses,
        net: entry.income - entry.expenses,
        transactionCount: entry.count,
      };
    });

    // -----------------------------------------------------------------------
    // 2. Category breakdown
    // -----------------------------------------------------------------------
    const catMap = new Map<string | null, { total: number; count: number }>();
    const prevCatMap = new Map<string | null, number>();

    for (const t of periodTransactions) {
      if (t.type !== 'EXPENSE') continue;
      const key = t.categoryId ?? null;
      const entry = catMap.get(key) ?? { total: 0, count: 0 };
      entry.total += Math.abs(t.amount.amount);
      entry.count += 1;
      catMap.set(key, entry);
    }

    for (const t of prevTransactions) {
      if (t.type !== 'EXPENSE') continue;
      const key = t.categoryId ?? null;
      prevCatMap.set(key, (prevCatMap.get(key) ?? 0) + Math.abs(t.amount.amount));
    }

    const totalExpenses = Array.from(catMap.values()).reduce((s, e) => s + e.total, 0);

    const categoryBreakdown: CategoryBreakdown[] = Array.from(catMap.entries())
      .map(([catId, entry]) => {
        const prevTotal = prevCatMap.get(catId) ?? 0;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (prevTotal > 0) {
          const change = (entry.total - prevTotal) / prevTotal;
          if (change > 0.05) trend = 'up';
          else if (change < -0.05) trend = 'down';
        } else if (entry.total > 0) {
          trend = 'up';
        }

        return {
          categoryId: catId,
          categoryName: catId !== null ? (categoryMap.get(catId) ?? 'Unknown') : 'Uncategorized',
          total: entry.total,
          percentage: totalExpenses > 0 ? (entry.total / totalExpenses) * 100 : 0,
          transactionCount: entry.count,
          trend,
        };
      })
      .sort((a, b) => b.total - a.total);

    // -----------------------------------------------------------------------
    // 3. Top payees
    // -----------------------------------------------------------------------
    const payeeMap = new Map<string, { total: number; count: number }>();

    for (const t of periodTransactions) {
      if (t.type !== 'EXPENSE') continue;
      const name = t.payee ?? 'Unknown';
      const entry = payeeMap.get(name) ?? { total: 0, count: 0 };
      entry.total += Math.abs(t.amount.amount);
      entry.count += 1;
      payeeMap.set(name, entry);
    }

    const topPayees: TopPayee[] = Array.from(payeeMap.entries())
      .map(([name, entry]) => ({
        name,
        total: entry.total,
        transactionCount: entry.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // -----------------------------------------------------------------------
    // 4. Aggregate metrics
    // -----------------------------------------------------------------------
    const totalIncome = monthlyBreakdown.reduce((s, m) => s + m.income, 0);
    const totalExp = monthlyBreakdown.reduce((s, m) => s + m.expenses, 0);
    const daysInPeriod = daysBetween(periodStart, periodEnd);
    const averageDailySpend = daysInPeriod > 0 ? Math.round(totalExp / daysInPeriod) : 0;
    const savingsRate =
      totalIncome > 0 ? Math.round(((totalIncome - totalExp) / totalIncome) * 100) : 0;

    return {
      monthlyBreakdown,
      categoryBreakdown,
      topPayees,
      averageDailySpend,
      savingsRate,
    };
  }, [transactions, selectedPeriod, categoryMap]);

  return {
    ...insights,
    loading,
    error,
    selectedPeriod,
    setSelectedPeriod,
  };
}
