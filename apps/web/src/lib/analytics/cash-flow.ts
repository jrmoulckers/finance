// SPDX-License-Identifier: BUSL-1.1

/**
 * Cash flow analytics calculation utilities.
 *
 * Pure functions for computing income, expenses, and net income
 * aggregations over time. All monetary values are in cents (integers).
 *
 * References: issue #1587
 */

import type { Transaction, Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Monthly income vs. expenses aggregate. All amounts in cents. */
export interface MonthlyAggregate {
  /** ISO month label, e.g. "2024-01". */
  month: string;
  /** Total income for the month in cents. */
  income: number;
  /** Total expenses for the month in cents. */
  expenses: number;
  /** Net income (income - expenses) in cents. */
  netIncome: number;
}

/** Category-level income source breakdown. */
export interface IncomeSource {
  categoryId: string | null;
  categoryName: string;
  /** Total income amount in cents. */
  amount: number;
  /** Number of income transactions. */
  transactionCount: number;
  /** Percentage of total income (0–100). */
  percentOfTotal: number;
}

/** Summary statistics for the cash flow view. */
export interface CashFlowSummary {
  /** Average monthly income in cents. */
  averageMonthlyIncome: number;
  /** Average monthly expenses in cents. */
  averageMonthlyExpenses: number;
  /** Average monthly net income in cents. */
  averageMonthlyNetIncome: number;
  /** Total income across all periods in cents. */
  totalIncome: number;
  /** Total expenses across all periods in cents. */
  totalExpenses: number;
  /** Total net income across all periods in cents. */
  totalNetIncome: number;
  /** Number of months analyzed. */
  monthCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the YYYY-MM portion from an ISO date string.
 *
 * @param date - ISO-8601 local date (e.g. "2024-01-15")
 * @returns Month key (e.g. "2024-01")
 */
export function dateToMonth(date: string): string {
  return date.slice(0, 7);
}

/**
 * Generates an array of YYYY-MM month keys for the last N months
 * ending at the given reference date (inclusive of that month).
 *
 * @param monthCount - How many months to include
 * @param referenceDate - Date to count back from (defaults to now)
 * @returns Array of month keys in chronological order
 */
export function generateMonthRange(monthCount: number, referenceDate?: Date): string[] {
  const ref = referenceDate ?? new Date();
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Aggregates transactions into monthly income/expense/net-income buckets.
 *
 * @param transactions - All transactions to aggregate
 * @param months - Ordered list of month keys to include
 * @returns Array of MonthlyAggregate, one per month in `months`
 */
export function computeMonthlyAggregates(
  transactions: Transaction[],
  months: string[],
): MonthlyAggregate[] {
  const incomeByMonth = new Map<string, number>();
  const expensesByMonth = new Map<string, number>();

  for (const tx of transactions) {
    const month = dateToMonth(tx.date);
    if (tx.type === 'INCOME') {
      incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + tx.amount.amount);
    } else if (tx.type === 'EXPENSE') {
      expensesByMonth.set(month, (expensesByMonth.get(month) ?? 0) + Math.abs(tx.amount.amount));
    }
  }

  return months.map((month) => {
    const income = incomeByMonth.get(month) ?? 0;
    const expenses = expensesByMonth.get(month) ?? 0;
    return { month, income, expenses, netIncome: income - expenses };
  });
}

/**
 * Computes summary statistics from monthly aggregates.
 *
 * @param aggregates - Monthly aggregates to summarize
 * @returns CashFlowSummary with averages and totals
 */
export function computeCashFlowSummary(aggregates: MonthlyAggregate[]): CashFlowSummary {
  const count = aggregates.length;
  if (count === 0) {
    return {
      averageMonthlyIncome: 0,
      averageMonthlyExpenses: 0,
      averageMonthlyNetIncome: 0,
      totalIncome: 0,
      totalExpenses: 0,
      totalNetIncome: 0,
      monthCount: 0,
    };
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const agg of aggregates) {
    totalIncome += agg.income;
    totalExpenses += agg.expenses;
  }
  const totalNetIncome = totalIncome - totalExpenses;

  return {
    averageMonthlyIncome: Math.round(totalIncome / count),
    averageMonthlyExpenses: Math.round(totalExpenses / count),
    averageMonthlyNetIncome: Math.round(totalNetIncome / count),
    totalIncome,
    totalExpenses,
    totalNetIncome,
    monthCount: count,
  };
}

/**
 * Breaks down income by category/source.
 *
 * @param transactions - All transactions (only INCOME types are used)
 * @param categories - Category lookup list
 * @returns Array of IncomeSource sorted by amount descending
 */
export function computeIncomeSources(
  transactions: Transaction[],
  categories: Category[],
): IncomeSource[] {
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat.name);
  }

  const sourceMap = new Map<string, { amount: number; count: number }>();
  let totalIncome = 0;

  for (const tx of transactions) {
    if (tx.type !== 'INCOME') continue;
    const key = tx.categoryId ?? '__uncategorized__';
    const existing = sourceMap.get(key) ?? { amount: 0, count: 0 };
    existing.amount += tx.amount.amount;
    existing.count += 1;
    sourceMap.set(key, existing);
    totalIncome += tx.amount.amount;
  }

  const result: IncomeSource[] = [];
  for (const [key, data] of sourceMap.entries()) {
    result.push({
      categoryId: key === '__uncategorized__' ? null : key,
      categoryName:
        key === '__uncategorized__' ? 'Uncategorized' : (categoryMap.get(key) ?? 'Unknown'),
      amount: data.amount,
      transactionCount: data.count,
      percentOfTotal: totalIncome > 0 ? Math.round((data.amount / totalIncome) * 100) : 0,
    });
  }

  return result.sort((a, b) => b.amount - a.amount);
}

/**
 * Formats monthly aggregates as CSV for export.
 *
 * @param aggregates - The monthly data to export
 * @returns CSV string with header row
 */
export function exportCashFlowCsv(aggregates: MonthlyAggregate[]): string {
  const header = 'Month,Income,Expenses,Net Income';
  const rows = aggregates.map(
    (a) =>
      `${a.month},${(a.income / 100).toFixed(2)},${(a.expenses / 100).toFixed(2)},${(a.netIncome / 100).toFixed(2)}`,
  );
  return [header, ...rows].join('\n');
}
