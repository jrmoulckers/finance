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

import { useCallback } from 'react';
import { getAllAccounts } from '../db/repositories/accounts';
import { getBudgetWithSpending, getBudgetsByPeriod } from '../db/repositories/budgets';
import { getRecentTransactions, getTransactionsByDateRange } from '../db/repositories/transactions';
import type { SqliteDb } from '../db/sqlite-wasm';
import type { Budget, Transaction } from '../kmp/bridge';
import { useLiveQuery } from './useLiveQuery';

export interface DashboardAccountSummary {
  type: string;
  total: number;
}

export interface DashboardData {
  netWorth: number;
  spentThisMonth: number;
  incomeThisMonth: number;
  monthlyBudget: number;
  budgetSpent: number;
  recentTransactions: Transaction[];
  accountSummary: DashboardAccountSummary[];
}

export interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

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

function isBudgetActiveInMonth(budget: Budget, startDate: string, endDate: string): boolean {
  if (budget.startDate > endDate) {
    return false;
  }

  if (budget.endDate !== null && budget.endDate < startDate) {
    return false;
  }

  return true;
}

function aggregateDashboardData(db: SqliteDb): DashboardData {
  const accounts = getAllAccounts(db);
  const netWorth = accounts.reduce((sum, account) => sum + account.currentBalance.amount, 0);

  const accountTotals = new Map<string, number>();
  for (const account of accounts) {
    accountTotals.set(
      account.type,
      (accountTotals.get(account.type) ?? 0) + account.currentBalance.amount,
    );
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

export function useDashboardData(): UseDashboardDataResult {
  const runDashboardQuery = useCallback(
    (database: SqliteDb) => aggregateDashboardData(database),
    [],
  );
  const { data, error, loading, refresh } = useLiveQuery<DashboardData | null>(
    'SELECT id FROM account WHERE deleted_at IS NULL',
    [],
    {
      initialData: null,
      tables: ['account', 'transaction', 'budget'],
      queryFn: runDashboardQuery,
    },
  );

  return { data, loading, error, refresh };
}
