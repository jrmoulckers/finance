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
import { getAllTransactions, getTransactionsByDateRange } from '../db/repositories/transactions';
import { getAllCategories } from '../db/repositories/categories';
import { getAllAccounts } from '../db/repositories/accounts';
import type { Transaction, Category } from '../kmp/bridge';
import {
  buildCategoryDrillDown,
  buildSpendingTrendInsight,
  buildYearInReview,
  type AnnualSummary,
  type CategoryDrillDown,
  type SpendingTrendInsight,
} from '../lib/reports/reporting-beta';
import { computeSavingsRatePercent } from '../lib/savings/savings-rate-format';
import { getStoredSavingsTargetPercent } from '../lib/savings-target';

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

export interface SpendingBenchmarkDefinition {
  key: string;
  label: string;
  aliases: string[];
  minPercent: number;
  maxPercent: number;
  recommendedPercent?: number;
  group: 'needs' | 'wants' | 'savings';
  kind: 'expense' | 'savings';
}

export interface SpendingBenchmarkResult {
  key: string;
  label: string;
  amount: number;
  userPercent: number;
  minPercent: number;
  maxPercent: number;
  recommendedPercent?: number;
  benchmarkLabel: string;
  status: 'good' | 'warning' | 'danger';
  isOnTrack: boolean;
  summary: string;
  group: 'needs' | 'wants' | 'savings';
  kind: 'expense' | 'savings';
}

export interface FinancialHealthScore {
  score: number;
  total: number;
  percent: number;
  label: string;
}

export interface BudgetRuleBucket {
  key: 'needs' | 'wants' | 'savings';
  label: string;
  actualPercent: number;
  targetPercent: number;
  status: 'good' | 'warning' | 'danger';
}

export interface BudgetRuleOverview {
  buckets: BudgetRuleBucket[];
  summary: string;
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
  /** Spending benchmark comparison data. */
  spendingBenchmarks: SpendingBenchmarkResult[];
  /** Overall benchmark-based health score. */
  financialHealthScore: FinancialHealthScore;
  /** 50/30/20 budget rule overview. */
  budgetRuleOverview: BudgetRuleOverview;
  /** Spending trends and seasonality for 6/12/24 month windows. */
  spendingTrends: SpendingTrendInsight[];
  /** Current-month category drill-downs keyed by top category. */
  categoryDrillDowns: CategoryDrillDown[];
  /** Annual summaries available for year-in-review. */
  annualSummaries: AnnualSummary[];
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

export const SPENDING_BENCHMARKS: SpendingBenchmarkDefinition[] = [
  {
    key: 'housing',
    label: 'Housing',
    aliases: ['housing', 'rent', 'mortgage', 'home'],
    minPercent: 25,
    maxPercent: 35,
    recommendedPercent: 30,
    group: 'needs',
    kind: 'expense',
  },
  {
    key: 'food',
    label: 'Food',
    aliases: ['food', 'food & dining', 'dining', 'groceries', 'grocery'],
    minPercent: 10,
    maxPercent: 15,
    group: 'needs',
    kind: 'expense',
  },
  {
    key: 'transportation',
    label: 'Transportation',
    aliases: ['transportation', 'transport', 'transit', 'travel', 'car'],
    minPercent: 10,
    maxPercent: 15,
    group: 'needs',
    kind: 'expense',
  },
  {
    key: 'utilities',
    label: 'Utilities',
    aliases: ['utilities', 'utility', 'bills'],
    minPercent: 5,
    maxPercent: 10,
    group: 'needs',
    kind: 'expense',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    aliases: ['insurance'],
    minPercent: 10,
    maxPercent: 25,
    group: 'needs',
    kind: 'expense',
  },
  {
    key: 'savings',
    label: 'Savings',
    aliases: ['savings'],
    minPercent: 10,
    maxPercent: 20,
    recommendedPercent: 20,
    group: 'savings',
    kind: 'savings',
  },
  {
    key: 'entertainment',
    label: 'Entertainment',
    aliases: ['entertainment', 'fun', 'recreation'],
    minPercent: 5,
    maxPercent: 10,
    group: 'wants',
    kind: 'expense',
  },
  {
    key: 'personal',
    label: 'Personal',
    aliases: ['personal', 'personal care', 'shopping', 'clothing'],
    minPercent: 5,
    maxPercent: 10,
    group: 'wants',
    kind: 'expense',
  },
];

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

function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundPercent(value: number): number {
  return Math.round(value);
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
  targetPercent: number,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (spendingComparison.direction === 'up' && spendingComparison.changePercent > 20) {
    recs.push({
      id: 'spending-increased',
      title: 'Spending increased significantly',
      description: `Your spending is up ${spendingComparison.changePercent}% compared to last month. Review your top categories for areas to cut back.`,
      severity: 'warning',
    });
  }

  if (spendingComparison.direction === 'down' && Math.abs(spendingComparison.changePercent) > 10) {
    recs.push({
      id: 'spending-decreased',
      title: 'Great job reducing spending!',
      description: `You spent ${Math.abs(spendingComparison.changePercent)}% less than last month. Keep up the momentum!`,
      severity: 'success',
    });
  }

  const lowSavingsThreshold = Math.max(1, Math.round(targetPercent / 2));
  if (savingsRate >= 0 && savingsRate < lowSavingsThreshold) {
    recs.push({
      id: 'low-savings-rate',
      title: `Savings rate below ${lowSavingsThreshold}%`,
      description: `You're aiming to save at least ${targetPercent}% of your income. Look for discretionary expenses you can reduce.`,
      severity: 'warning',
    });
  }

  if (netCashFlow < 0) {
    recs.push({
      id: 'negative-cash-flow',
      title: 'Negative cash flow this month',
      description:
        'You are spending more than you earn. Prioritize reducing non-essential expenses.',
      severity: 'warning',
    });
  }

  if (savingsRate >= targetPercent && savingsRate > 0) {
    recs.push({
      id: 'high-savings-rate',
      title: 'Excellent savings rate!',
      description: `You're saving ${savingsRate}% of your income, at or above your ${targetPercent}% goal.`,
      severity: 'success',
    });
  }

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

function getExpenseBenchmarkStatus(
  value: number,
  benchmark: SpendingBenchmarkDefinition,
): Pick<SpendingBenchmarkResult, 'status' | 'isOnTrack'> {
  const effectiveMax = benchmark.recommendedPercent ?? benchmark.maxPercent;
  if (value > benchmark.maxPercent + 5) {
    return { status: 'danger', isOnTrack: false };
  }
  if (value > effectiveMax) {
    return { status: 'warning', isOnTrack: false };
  }
  return { status: 'good', isOnTrack: true };
}

function getSavingsBenchmarkStatus(
  value: number,
  benchmark: SpendingBenchmarkDefinition,
): Pick<SpendingBenchmarkResult, 'status' | 'isOnTrack'> {
  if (value < benchmark.minPercent - 5) {
    return { status: 'danger', isOnTrack: false };
  }
  if (value < benchmark.minPercent) {
    return { status: 'warning', isOnTrack: false };
  }
  return { status: 'good', isOnTrack: true };
}

function buildBenchmarkSummary(benchmark: SpendingBenchmarkDefinition, value: number): string {
  const rangeLabel = `${benchmark.minPercent}-${benchmark.maxPercent}%`;
  const lowerLabel = benchmark.label.toLowerCase();

  if (benchmark.kind === 'savings') {
    if (value < benchmark.minPercent - 5) {
      return `You save ${value}% of your income, significantly below the recommended ${rangeLabel} range.`;
    }
    if (value < benchmark.minPercent) {
      return `You save ${value}% of your income, slightly below the recommended ${rangeLabel} range.`;
    }
    if (benchmark.recommendedPercent && value >= benchmark.recommendedPercent) {
      return `You save ${value}% of your income, above the ${benchmark.recommendedPercent}% target.`;
    }
    return `You save ${value}% of your income, within the recommended ${rangeLabel} range, with ${benchmark.recommendedPercent}% as the ideal target.`;
  }

  if (value < benchmark.minPercent) {
    return `You spend ${value}% on ${lowerLabel}, below the typical ${rangeLabel} range.`;
  }
  if (
    benchmark.recommendedPercent &&
    value > benchmark.recommendedPercent &&
    value <= benchmark.maxPercent
  ) {
    return `You spend ${value}% on ${lowerLabel}, inside the ${rangeLabel} benchmark, but above the ideal ${benchmark.recommendedPercent}% target.`;
  }
  if (value <= benchmark.maxPercent) {
    return `You spend ${value}% on ${lowerLabel}. That's within the recommended ${rangeLabel} range.`;
  }
  if (value <= benchmark.maxPercent + 5) {
    return `You spend ${value}% on ${lowerLabel}, slightly above the recommended ${rangeLabel} range.`;
  }
  return `You spend ${value}% on ${lowerLabel}, significantly above the recommended ${rangeLabel} range.`;
}

function getBenchmarkLabel(benchmark: SpendingBenchmarkDefinition): string {
  if (benchmark.recommendedPercent && benchmark.recommendedPercent !== benchmark.maxPercent) {
    return `${benchmark.minPercent}-${benchmark.maxPercent}% (target ${benchmark.recommendedPercent}%)`;
  }
  return `${benchmark.minPercent}-${benchmark.maxPercent}%`;
}

function buildFinancialHealthScore(
  spendingBenchmarks: SpendingBenchmarkResult[],
): FinancialHealthScore {
  const score = spendingBenchmarks.filter((benchmark) => benchmark.isOnTrack).length;
  const total = spendingBenchmarks.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  let label = 'Needs attention';
  if (percent >= 88) label = 'Excellent';
  else if (percent >= 63) label = 'Good';
  else if (percent >= 38) label = 'Fair';

  return { score, total, percent, label };
}

function buildBudgetRuleOverview(
  spendingBenchmarks: SpendingBenchmarkResult[],
  savingsRate: number,
): BudgetRuleOverview {
  const actualByGroup = spendingBenchmarks.reduce<Record<'needs' | 'wants' | 'savings', number>>(
    (acc, benchmark) => {
      acc[benchmark.group] += benchmark.userPercent;
      return acc;
    },
    { needs: 0, wants: 0, savings: 0 },
  );

  actualByGroup.savings = savingsRate;

  const buckets: BudgetRuleBucket[] = [
    {
      key: 'needs',
      label: 'Needs',
      actualPercent: actualByGroup.needs,
      targetPercent: 50,
      status: actualByGroup.needs <= 50 ? 'good' : actualByGroup.needs <= 55 ? 'warning' : 'danger',
    },
    {
      key: 'wants',
      label: 'Wants',
      actualPercent: actualByGroup.wants,
      targetPercent: 30,
      status: actualByGroup.wants <= 30 ? 'good' : actualByGroup.wants <= 35 ? 'warning' : 'danger',
    },
    {
      key: 'savings',
      label: 'Savings',
      actualPercent: savingsRate,
      targetPercent: 20,
      status: savingsRate >= 20 ? 'good' : savingsRate >= 15 ? 'warning' : 'danger',
    },
  ];

  const summary = buckets.every((bucket) => bucket.status === 'good')
    ? `You're close to the 50/30/20 rule with ${actualByGroup.needs}% needs, ${actualByGroup.wants}% wants, and ${actualByGroup.savings}% savings.`
    : `Your current split is ${actualByGroup.needs}% needs, ${actualByGroup.wants}% wants, and ${actualByGroup.savings}% savings. Focus on keeping needs near 50%, wants near 30%, and savings near 20%.`;

  return { buckets, summary };
}

export function calculateSpendingBenchmarks(
  categorySpending: CategorySpending[],
  totalIncomeThisMonth: number,
  savingsRate: number,
): Pick<InsightsData, 'spendingBenchmarks' | 'financialHealthScore' | 'budgetRuleOverview'> {
  const matchedTotals = new Map<string, number>();

  for (const category of categorySpending) {
    const normalized = normalizeCategoryName(category.categoryName);
    const match = SPENDING_BENCHMARKS.find(
      (benchmark) =>
        benchmark.kind === 'expense' &&
        benchmark.aliases.some((alias) => normalizeCategoryName(alias) === normalized),
    );

    if (match) {
      matchedTotals.set(match.key, (matchedTotals.get(match.key) ?? 0) + category.amount);
    }
  }

  const spendingBenchmarks = SPENDING_BENCHMARKS.map((benchmark): SpendingBenchmarkResult => {
    const amount =
      benchmark.kind === 'savings'
        ? Math.round((totalIncomeThisMonth * savingsRate) / 100)
        : (matchedTotals.get(benchmark.key) ?? 0);

    const userPercent =
      benchmark.kind === 'savings'
        ? savingsRate
        : totalIncomeThisMonth > 0
          ? roundPercent((amount / totalIncomeThisMonth) * 100)
          : 0;

    const statusData =
      benchmark.kind === 'savings'
        ? getSavingsBenchmarkStatus(userPercent, benchmark)
        : getExpenseBenchmarkStatus(userPercent, benchmark);

    return {
      key: benchmark.key,
      label: benchmark.label,
      amount,
      userPercent,
      minPercent: benchmark.minPercent,
      maxPercent: benchmark.maxPercent,
      recommendedPercent: benchmark.recommendedPercent,
      benchmarkLabel: getBenchmarkLabel(benchmark),
      status: statusData.status,
      isOnTrack: statusData.isOnTrack,
      summary: buildBenchmarkSummary(benchmark, userPercent),
      group: benchmark.group,
      kind: benchmark.kind,
    };
  });

  return {
    spendingBenchmarks,
    financialHealthScore: buildFinancialHealthScore(spendingBenchmarks),
    budgetRuleOverview: buildBudgetRuleOverview(spendingBenchmarks, savingsRate),
  };
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

    void (async () => {
      try {
        const now = new Date();
        const currentMonth = getMonthBounds(now.getFullYear(), now.getMonth());
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonth = getMonthBounds(prevDate.getFullYear(), prevDate.getMonth());

        const currentTransactions = await getTransactionsByDateRange(
          db,
          currentMonth.startDate,
          currentMonth.endDate,
        );
        const previousTransactions = await getTransactionsByDateRange(
          db,
          previousMonth.startDate,
          previousMonth.endDate,
        );

        const categories = await getAllCategories(db);
        const accounts = await getAllAccounts(db);
        const allTransactions = await getAllTransactions(db);

        let totalSpentThisMonth = 0;
        let totalIncomeThisMonth = 0;
        for (const tx of currentTransactions) {
          if (tx.type === 'EXPENSE') totalSpentThisMonth += Math.abs(tx.amount.amount);
          else if (tx.type === 'INCOME') totalIncomeThisMonth += tx.amount.amount;
        }

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
        const savingsRate = computeSavingsRatePercent(totalIncomeThisMonth, totalSpentThisMonth);

        const topCategories = categorySpending.slice(0, 5);
        const savingsTargetPercent = getStoredSavingsTargetPercent();
        const recommendations = generateRecommendations(
          categorySpending,
          spendingComparison,
          savingsRate,
          netCashFlow,
          savingsTargetPercent,
        );
        const { spendingBenchmarks, financialHealthScore, budgetRuleOverview } =
          calculateSpendingBenchmarks(categorySpending, totalIncomeThisMonth, savingsRate);
        const spendingTrends = ([6, 12, 24] as const).map((period) =>
          buildSpendingTrendInsight(allTransactions, categories, period, now),
        );
        const categoryDrillDowns = topCategories.map((category) =>
          buildCategoryDrillDown(allTransactions, categories, accounts, {
            startDate: currentMonth.startDate,
            endDate: currentMonth.endDate,
            categoryId: category.categoryId,
          }),
        );
        const annualSummaries = Array.from(
          new Set(allTransactions.map((tx) => Number(tx.date.slice(0, 4))).filter(Number.isFinite)),
        )
          .sort((a, b) => b - a)
          .map((year) => buildYearInReview(allTransactions, categories, year));

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
          spendingBenchmarks,
          financialHealthScore,
          budgetRuleOverview,
          spendingTrends,
          categoryDrillDowns,
          annualSummaries,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compute insights.');
        setInsights(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [db, refreshToken]);

  return { insights, loading, error, refresh };
}
