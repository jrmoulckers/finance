// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook that aggregates financial summary data for the dashboard.
 *
 * Queries the local SQLite-WASM database directly via repository helpers to
 * compute net worth, current-month cash flow, budget progress, recent
 * transactions, and account totals grouped by account type.
 *
 * Usage:
 * ```tsx
 * const { data, loading, error, refresh } = useDashboardData();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getAllAccounts } from '../db/repositories/accounts';
import { getBudgetWithSpending, getBudgetsByPeriod } from '../db/repositories/budgets';
import { getRecentTransactions, getTransactionsByDateRange } from '../db/repositories/transactions';
import type { Budget, Transaction } from '../kmp/bridge';

/** Summary of total balance grouped by account type. */
export interface DashboardAccountSummary {
  type: string;
  total: number;
}

/** Aggregated financial snapshot for the dashboard. Monetary values are in cents. */
export interface DashboardData {
  /** Sum of all account balances in cents. */
  netWorth: number;
  /** Total expense amount for the current month in cents. */
  spentThisMonth: number;
  /** Total income amount for the current month in cents. */
  incomeThisMonth: number;
  /** Total amount budgeted for active monthly budgets this month in cents. */
  monthlyBudget: number;
  /** Total spending against active monthly budgets this month in cents. */
  budgetSpent: number;
  /** Most recent transactions, newest first. */
  recentTransactions: Transaction[];
  /** Account totals grouped by account type in cents. */
  accountSummary: DashboardAccountSummary[];
}

/** Shape returned by {@link useDashboardData}. */
export interface UseDashboardDataResult {
  /** Aggregated dashboard metrics, or `null` before the first successful load. */
  data: DashboardData | null;
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message if aggregation failed, or `null`. */
  error: string | null;
  /** Trigger a full re-aggregation of all dashboard metrics. */
  refresh: () => void;
}

/** Return ISO-8601 local-date strings for the first and last day of the current calendar month. */
function getCurrentMonthBounds(): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    startDate: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`,
    endDate: `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`,
  };
}

/** Return `true` when a monthly budget overlaps the current month bounds. */
function isBudgetActiveInMonth(budget: Budget, startDate: string, endDate: string): boolean {
  if (budget.startDate > endDate) {
    return false;
  }

  if (budget.endDate !== null && budget.endDate < startDate) {
    return false;
  }

  return true;
}

/** Aggregate dashboard metrics from the database using targeted repository queries. */
function aggregateDashboardData(db: ReturnType<typeof useDatabase>): DashboardData {
  const accounts = getAllAccounts(db);
  const netWorth = accounts.reduce((sum, account) => sum + account.currentBalance.amount, 0);

  const accountTotals = new Map<string, number>();
  for (const account of accounts) {
    accountTotals.set(account.type, (accountTotals.get(account.type) ?? 0) + account.currentBalance.amount);
  }

  const accountSummary = Array.from(accountTotals.entries())
    .map(([type, total]) => ({ type, total }))
    .sort((left, right) => left.type.localeCompare(right.type));

  const { startDate, endDate } = getCurrentMonthBounds();
  const monthlyTransactions = getTransactionsByDateRange(db, startDate, endDate);

  let spentThisMonth = 0;
  let incomeThisMonth = 0;
  for (const transaction of monthlyTransactions) {
    if (transaction.type === 'EXPENSE') {
      spentThisMonth += Math.abs(transaction.amount.amount);
    } else if (transaction.type === 'INCOME') {
      incomeThisMonth += transaction.amount.amount;
    }
  }

  const monthlyBudgets = getBudgetsByPeriod(db, 'MONTHLY').filter((budget) =>
    isBudgetActiveInMonth(budget, startDate, endDate),
  );

  let monthlyBudget = 0;
  let budgetSpent = 0;
  for (const budget of monthlyBudgets) {
    monthlyBudget += budget.amount.amount;
    const budgetWithSpending = getBudgetWithSpending(db, budget.id);
    budgetSpent += budgetWithSpending?.spentAmount.amount ?? 0;
  }

  return {
    netWorth,
    spentThisMonth,
    incomeThisMonth,
    monthlyBudget,
    budgetSpent,
    recentTransactions: getRecentTransactions(db, 10),
    accountSummary,
  };
}

/** Aggregate and return the financial summary data needed by the dashboard. */
export function useDashboardData(): UseDashboardDataResult {
  const db = useDatabase();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Trigger a full re-aggregation of all dashboard metrics. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((currentValue) => currentValue + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      setData(aggregateDashboardData(db));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  return { data, loading, error, refresh };
}
