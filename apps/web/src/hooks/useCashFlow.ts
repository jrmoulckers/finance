// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for computing cash flow analytics over time.
 *
 * Aggregates income, expenses, and net income by month from local
 * transaction data. Supports configurable time ranges (6/12/24 months).
 *
 * Usage:
 * ```tsx
 * const { aggregates, summary, incomeSources, loading } = useCashFlow(12);
 * ```
 *
 * References: issue #1587
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import { getTransactionsByDateRange } from '../db/repositories/transactions';
import { getAllCategories } from '../db/repositories/categories';
import {
  computeMonthlyAggregates,
  computeCashFlowSummary,
  computeIncomeSources,
  exportCashFlowCsv,
  generateMonthRange,
} from '../lib/analytics/cash-flow';
import type { MonthlyAggregate, CashFlowSummary, IncomeSource } from '../lib/analytics/cash-flow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape returned by {@link useCashFlow}. */
export interface UseCashFlowResult {
  /** Monthly income/expenses/net-income aggregates. */
  aggregates: MonthlyAggregate[];
  /** Summary statistics (averages, totals). */
  summary: CashFlowSummary;
  /** Income breakdown by category/source. */
  incomeSources: IncomeSource[];
  /** True while data is being computed. */
  loading: boolean;
  /** Human-readable error message or null. */
  error: string | null;
  /** Trigger a re-computation. */
  refresh: () => void;
  /** Download cash flow data as CSV. */
  exportCsv: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Computes cash flow analytics for the given number of months.
 *
 * @param monthCount - Number of months to analyze (default 12)
 * @returns Cash flow analytics data
 */
export function useCashFlow(monthCount = 12): UseCashFlowResult {
  const db = useDatabase();

  const [aggregates, setAggregates] = useState<MonthlyAggregate[]>([]);
  const [summary, setSummary] = useState<CashFlowSummary>({
    averageMonthlyIncome: 0,
    averageMonthlyExpenses: 0,
    averageMonthlyNetIncome: 0,
    totalIncome: 0,
    totalExpenses: 0,
    totalNetIncome: 0,
    monthCount: 0,
  });
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  const months = useMemo(() => generateMonthRange(monthCount), [monthCount]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      // Date range spanning all months
      const startDate = `${months[0]}-01`;
      const lastMonth = months[months.length - 1];
      const [y, m] = lastMonth.split('-').map(Number);
      const endOfMonth = new Date(y, m, 0);
      const endDate = `${y}-${String(m).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`;

      const transactions = getTransactionsByDateRange(db, startDate, endDate);
      const categories = getAllCategories(db);

      const aggs = computeMonthlyAggregates(transactions, months);
      const sum = computeCashFlowSummary(aggs);
      const sources = computeIncomeSources(transactions, categories);

      setAggregates(aggs);
      setSummary(sum);
      setIncomeSources(sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compute cash flow analytics.');
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken, months]);

  const exportCsv = useCallback(() => {
    const csv = exportCashFlowCsv(aggregates);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-flow-${months[0]}-to-${months[months.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [aggregates, months]);

  return { aggregates, summary, incomeSources, loading, error, refresh, exportCsv };
}
