// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for computing financial insights and analytics.
 *
 * Aggregates spending trends, category breakdowns, and actionable
 * recommendations from local transaction and budget data.
 *
 * Usage:
 * ```tsx
 * const { insights, loading, error, refresh } = useInsights();
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getTransactionsByDateRange } from '../db/repositories/transactions';
import { getAllCategories } from '../db/repositories/categories';
import type { Transaction, Category } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Spending data for a single category. All amounts in cents. */
export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  transactionCount: number;
  percentOfTotal: number;
}

/** Daily spending aggregate. Amount in cents. */
export interface DailySpending {
  date: string;
  amount: number;
}

/** Month-over-month comparison for a metric. */
export interface MonthComparison {
  current: number;
  previous: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

/** A single actionable recommendation. */
export interface Recommendation {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'success';
  category?: string;
}

/** Complete financial insights data. */
export interface InsightsData {
  /** Spending by category, sorted by amount descending. */
  categorySpending: CategorySpending[];
  /** Daily spending for the current month. */
  dailySpending: DailySpending[];
  /** Daily spending for the previous month (for comparison). */
  previousDailySpending: DailySpending[];
  /** Total spending this month in cents. */
  totalSpentThisMonth: number;
  /** Total spending last month in cents. */
  totalSpentLastMonth: number;
  /** Total income this month in cents. */
  totalIncomeThisMonth: number;
  /** Total income last month in cents. */
  totalIncomeLastMonth: number;
  /** Spending comparison month-over-month. */
  spendingComparison: MonthComparison;
  /** Income comparison month-over-month. */
  incomeComparison: MonthComparison;
  /** Top spending categories (top 5). */
  topCategories: CategorySpending[];
  /** Average daily spending this month in cents. */
  averageDailySpending: number;
  /** Actionable recommendations based on the data. */
  recommendations: Recommendation[];
  /** Net cash flow this month (income - expenses) in cents. */
  netCashFlow: number;
  /** Savings rate as a percentage (0-100). */
  savingsRate: number;
}

/** Shape returned by {@link useInsights}. */
export interface UseInsightsResult {
  /** Computed financial insights, or null before first load. */
  insights: InsightsData | null;
  /** True while data is being computed. */
  loading: boolean;
  /** Human-readable error message or null. */
  error: string | null;
  /** Trigger a re-computation. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthBounds(year: number, month: number): { startDate: string; endDate: string } {
  const pad = (v: number) => String(v).padStart(2, '0');
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  return {
    startDate: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`,
    endDate: `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`,
  };
}

function makeComparison(current: number, previous: number): MonthComparison {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current > 0 ? 100 : 0,
      direction: current > previous ? 'up' : current < previous ? 'down' : 'flat',
    };
  }
  const changePercent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return {
    current,
    previous,
    changePercent,
    direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat',
  };
}

function buildCategorySpending(
  transactions: Transaction[],
  categories: Category[],
): CategorySpending[] {
  const categoryMap = new Map<string, { name: string }>();
  for (const cat of categories) {
    categoryMap.set(cat.id, { name: cat.name });
  }

  const spending = new Map<string, { amount: number; count: number }>();
  let totalExpenses = 0;

  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    const key = tx.categoryId ?? '__uncategorized__';
    const existing = spending.get(key) ?? { amount: 0, count: 0 };
    const txAmount = Math.abs(tx.amount.amount);
    existing.amount += txAmount;
    existing.count += 1;
    spending.set(key, existing);
    totalExpenses += txAmount;
  }

  const result: CategorySpending[] = [];
  for (const [key, data] of spending.entries()) {
    result.push({
      categoryId: key === '__uncategorized__' ? null : key,
      categoryName:
        key === '__uncategorized__' ? 'Uncategorized' : (categoryMap.get(key)?.name ?? 'Unknown'),
      amount: data.amount,
      transactionCount: data.count,
      percentOfTotal: totalExpenses > 0 ? Math.round((data.amount / totalExpenses) * 100) : 0,
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

function buildDailySpending(transactions: Transaction[]): DailySpending[] {
  const daily = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    daily.set(tx.date, (daily.get(tx.date) ?? 0) + Math.abs(tx.amount.amount));
  }
  return Array.from(daily.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function generateRecommendations(
  categorySpending: CategorySpending[],
  spendingComparison: MonthComparison,
  savingsRate: number,
  netCashFlow: number,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Warning if spending increased significantly
  if (spendingComparison.direction === 'up' && spendingComparison.changePercent > 20) {
    recs.push({
      id: 'spending-increased',
      title: 'Spending increased significantly',
      description: `Your spending is up ${spendingComparison.changePercent}% compared to last month. Review your top categories for areas to cut back.`,
      severity: 'warning',
    });
  }

  // Success if spending decreased
  if (spendingComparison.direction === 'down' && Math.abs(spendingComparison.changePercent) > 10) {
    recs.push({
      id: 'spending-decreased',
      title: 'Great job reducing spending!',
      description: `You spent ${Math.abs(spendingComparison.changePercent)}% less than last month. Keep up the momentum!`,
      severity: 'success',
    });
  }

  // Low savings rate warning
  if (savingsRate >= 0 && savingsRate < 10) {
    recs.push({
      id: 'low-savings-rate',
      title: 'Savings rate below 10%',
      description:
        'Financial experts recommend saving at least 20% of your income. Look for discretionary expenses you can reduce.',
      severity: 'warning',
    });
  }

  // Negative cash flow
  if (netCashFlow < 0) {
    recs.push({
      id: 'negative-cash-flow',
      title: 'Negative cash flow this month',
      description:
        'You are spending more than you earn. Prioritize reducing non-essential expenses.',
      severity: 'warning',
    });
  }

  // High savings rate congratulation
  if (savingsRate >= 30) {
    recs.push({
      id: 'high-savings-rate',
      title: 'Excellent savings rate!',
      description: `You're saving ${savingsRate}% of your income — well above the recommended 20%.`,
      severity: 'success',
    });
  }

  // Dominant category warning (single category > 50% of spending)
  if (categorySpending.length > 0 && categorySpending[0].percentOfTotal > 50) {
    recs.push({
      id: 'dominant-category',
      title: `${categorySpending[0].categoryName} dominates your spending`,
      description: `${categorySpending[0].categoryName} accounts for ${categorySpending[0].percentOfTotal}% of your total spending. Consider diversifying your expense distribution.`,
      severity: 'info',
      category: categorySpending[0].categoryName,
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useInsights(): UseInsightsResult {
  const db = useDatabase();

  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const currentMonth = getMonthBounds(now.getFullYear(), now.getMonth());
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = getMonthBounds(prevDate.getFullYear(), prevDate.getMonth());

      const currentTransactions = getTransactionsByDateRange(
        db,
        currentMonth.startDate,
        currentMonth.endDate,
      );
      const previousTransactions = getTransactionsByDateRange(
        db,
        previousMonth.startDate,
        previousMonth.endDate,
      );

      const categories = getAllCategories(db);

      // Current month aggregates
      let totalSpentThisMonth = 0;
      let totalIncomeThisMonth = 0;
      for (const tx of currentTransactions) {
        if (tx.type === 'EXPENSE') totalSpentThisMonth += Math.abs(tx.amount.amount);
        else if (tx.type === 'INCOME') totalIncomeThisMonth += tx.amount.amount;
      }

      // Previous month aggregates
      let totalSpentLastMonth = 0;
      let totalIncomeLastMonth = 0;
      for (const tx of previousTransactions) {
        if (tx.type === 'EXPENSE') totalSpentLastMonth += Math.abs(tx.amount.amount);
        else if (tx.type === 'INCOME') totalIncomeLastMonth += tx.amount.amount;
      }

      const categorySpending = buildCategorySpending(currentTransactions, categories);
      const dailySpending = buildDailySpending(currentTransactions);
      const previousDailySpending = buildDailySpending(previousTransactions);

      const spendingComparison = makeComparison(totalSpentThisMonth, totalSpentLastMonth);
      const incomeComparison = makeComparison(totalIncomeThisMonth, totalIncomeLastMonth);

      const daysElapsed = now.getDate();
      const averageDailySpending =
        daysElapsed > 0 ? Math.round(totalSpentThisMonth / daysElapsed) : 0;

      const netCashFlow = totalIncomeThisMonth - totalSpentThisMonth;
      const savingsRate =
        totalIncomeThisMonth > 0
          ? Math.round(((totalIncomeThisMonth - totalSpentThisMonth) / totalIncomeThisMonth) * 100)
          : 0;

      const topCategories = categorySpending.slice(0, 5);
      const recommendations = generateRecommendations(
        categorySpending,
        spendingComparison,
        savingsRate,
        netCashFlow,
      );

      setInsights({
        categorySpending,
        dailySpending,
        previousDailySpending,
        totalSpentThisMonth,
        totalSpentLastMonth,
        totalIncomeThisMonth,
        totalIncomeLastMonth,
        spendingComparison,
        incomeComparison,
        topCategories,
        averageDailySpending,
        recommendations,
        netCashFlow,
        savingsRate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute insights.');
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  return { insights, loading, error, refresh };
}
