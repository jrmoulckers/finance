// SPDX-License-Identifier: BUSL-1.1

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TimePeriod, ViewType } from '../components/charts';
import { AccountPurposeFilterControl } from '../components/accounts';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  SyncIndicator,
} from '../components/common';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  useAccounts,
  useBills,
  useBudgets,
  useCategories,
  useDashboardData,
  useGoals,
  usePredictiveBalance,
  useRetirementPlanner,
  useRmdTracking,
  useSpendingPace,
  useTransactions,
} from '../hooks';
import { useWidgetLayout } from '../hooks/useWidgetLayout';
import type { BudgetWithSpending } from '../db/repositories/budgets';
import type { Bill, Goal, Transaction } from '../kmp/bridge';
import { getBudgetStatusIndicator } from '../lib/a11y';
import {
  filterAccountsByPurpose,
  filterTransactionsByAccountPurpose,
  type AccountPurposeFilter,
} from '../lib/accountPurpose';
import { isLiabilityType } from '../lib/analytics/net-worth';
import { calculateSafeToSpend } from '../lib/dashboard/safe-to-spend';
import {
  buildSavingsRateCardModel,
  buildSavingsRateDashboardSummary,
  type MonthlyCashFlow,
  type SavingsRateCardModel,
} from '../lib/dashboard/savings-rate-summary';
import type { SpendingPace } from '../lib/notifications';
import type { PredictionSummary } from '../lib/predictiveBalance';
import { rollUpProtectedTransactions } from '../lib/ui/privacy';
import '../components/dashboard/dashboard.css';

const CategoryPieChart = React.lazy(() =>
  import('../components/charts/CategoryPieChart').then((module) => ({
    default: module.CategoryPieChart,
  })),
);
const SpendingBarChart = React.lazy(() =>
  import('../components/charts/SpendingBarChart').then((module) => ({
    default: module.SpendingBarChart,
  })),
);
const SpendingTrendChart = React.lazy(() =>
  import('../components/charts/SpendingTrendChart').then((module) => ({
    default: module.SpendingTrendChart,
  })),
);
const CustomizePanel = React.lazy(() =>
  import('../components/dashboard/CustomizePanel').then((module) => ({
    default: module.CustomizePanel,
  })),
);
const DashboardCoachSection = React.lazy(
  () => import('../components/dashboard/DashboardCoachSection'),
);
const DashboardMoodJournalSection = React.lazy(
  () => import('../components/dashboard/DashboardMoodJournalSection'),
);
const DashboardTaxReserveSection = React.lazy(
  () => import('../components/dashboard/DashboardTaxReserveSection'),
);
const DashboardThingsToCheckSection = React.lazy(
  () => import('../components/dashboard/DashboardThingsToCheckSection'),
);
const QueryEngine = React.lazy(() => import('../components/ai/QueryEngine'));
const WarrantyDashboard = React.lazy(() =>
  import('../components/warranty/WarrantyDashboard').then((module) => ({
    default: module.WarrantyDashboard,
  })),
);
// Lazily code-split so these spending-answer cards do not weigh down the
// (already large) dashboard route chunk — each loads as its own small async
// chunk on demand.
const SafeToSpendCard = React.lazy(() =>
  import('../components/dashboard/SafeToSpendCard').then((module) => ({
    default: module.SafeToSpendCard,
  })),
);
const GroceryModeSection = React.lazy(() => import('../components/dashboard/GroceryModeSection'));

const ChartFallback = () => <LoadingSpinner size={24} label="Loading chart" />;
const SectionFallback = ({ label }: { readonly label: string }) => (
  <div className="card" role="status" aria-label={label}>
    <LoadingSpinner size={24} label={label} />
  </div>
);

const PERIOD_DAYS: Record<Exclude<TimePeriod, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getLastNDaysBounds(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));

  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

function getCurrentMonthBounds(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

function getPreviousMonthBounds(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Day 0 of the current month is the last day of the previous month.
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  };
}

/** Sum income and expense (integer cents) for the savings-rate calculation. */
function toMonthlyCashFlow(month: string, transactions: readonly Transaction[]): MonthlyCashFlow {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const transaction of transactions) {
    if (transaction.type === 'INCOME') {
      incomeCents += Math.max(0, transaction.amount.amount);
    } else if (transaction.type === 'EXPENSE') {
      expenseCents += Math.abs(transaction.amount.amount);
    }
  }

  return { month, incomeCents, expenseCents };
}

/** Format a savings-rate percentage compactly (e.g. `50%`, `37.5%`, `-20%`). */
function formatSavingsRatePercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Plain-language period-over-period trend description (text, not colour alone). */
function describeSavingsRateTrend(
  trend: SavingsRateCardModel['trend'],
  deltaPercentagePoints: number | null,
): string {
  if (deltaPercentagePoints === null) {
    return 'No prior month to compare yet';
  }
  if (trend === 'flat') {
    return 'Flat vs last month';
  }
  const magnitude = Math.round(Math.abs(deltaPercentagePoints) * 10) / 10;
  const points = Number.isInteger(magnitude) ? magnitude.toFixed(0) : magnitude.toFixed(1);
  return `${trend === 'up' ? 'Up' : 'Down'} ${points} pts vs last month`;
}

const SAVINGS_RATE_TREND_ICON: Record<SavingsRateCardModel['trend'], string> = {
  up: '▲',
  down: '▼',
  flat: '→',
};

function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }

  return transaction.amount.amount;
}

function buildTrendData(transactions: Transaction[], days: number) {
  const dailySpending = new Map<string, number>();

  for (const transaction of transactions) {
    dailySpending.set(
      transaction.date,
      (dailySpending.get(transaction.date) ?? 0) + Math.abs(transaction.amount.amount) / 100,
    );
  }

  const endDate = new Date();

  return Array.from({ length: days }, (_value, index) => {
    const pointDate = new Date(endDate);
    pointDate.setDate(endDate.getDate() - (days - index - 1));
    const dateKey = formatLocalDate(pointDate);

    return {
      label: pointDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      spending: dailySpending.get(dateKey) ?? 0,
    };
  });
}

function buildCategoryData(transactions: Transaction[], categoryNames: Map<string, string>) {
  const totalsByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const categoryName =
      transaction.categoryId !== null
        ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
        : 'Uncategorized';

    totalsByCategory.set(
      categoryName,
      (totalsByCategory.get(categoryName) ?? 0) + Math.abs(transaction.amount.amount) / 100,
    );
  }

  return Array.from(totalsByCategory, ([name, value]) => ({ name, value })).sort(
    (left, right) => right.value - left.value,
  );
}

/**
 * Compute average daily spending and period-over-period comparison.
 */
function computeSpendingStats(
  currentTransactions: Transaction[],
  days: number,
): { averageDaily: number; totalSpending: number } {
  const totalSpending = currentTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount.amount) / 100,
    0,
  );
  const averageDaily = days > 0 ? totalSpending / days : 0;
  return { averageDaily, totalSpending };
}

const RESERVED_BUDGET_KEYWORDS = [
  'bill',
  'debt',
  'goal',
  'insurance',
  'investment',
  'loan',
  'mortgage',
  'rent',
  'retirement',
  'saving',
  'tax',
  'utility',
];

function isBudgetActiveInMonth(
  budget: BudgetWithSpending,
  startDate: string,
  endDate: string,
): boolean {
  return (
    budget.period === 'MONTHLY' &&
    budget.startDate <= endDate &&
    (budget.endDate === null || budget.endDate >= startDate)
  );
}

function getPredictedRemainingIncomeCents(prediction: PredictionSummary | null): number {
  return (
    prediction?.accounts.reduce(
      (sum, account) => sum + Math.max(0, account.projectedIncomeCents),
      0,
    ) ?? 0
  );
}

function getRemainingBillsDueThisMonthCents(
  bills: readonly Bill[],
  startDate: string,
  endDate: string,
): number {
  return bills.reduce((sum, bill) => {
    const isUnpaid = bill.status === 'UPCOMING' || bill.status === 'OVERDUE';
    const isDueThisMonth = bill.dueDate >= startDate && bill.dueDate <= endDate;
    return isUnpaid && isDueThisMonth ? sum + Math.max(0, bill.amount.amount) : sum;
  }, 0);
}

function parseLocalDate(dateValue: string): Date {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMonthsUntilTargetInclusive(asOf: Date, targetDate: string): number {
  const target = parseLocalDate(targetDate);
  const monthDelta =
    (target.getFullYear() - asOf.getFullYear()) * 12 + (target.getMonth() - asOf.getMonth());
  return Math.max(1, monthDelta + 1);
}

function getPlannedGoalContributionsCents(goals: readonly Goal[], asOf: Date): number {
  return goals.reduce((sum, goal) => {
    if (goal.status !== 'ACTIVE' || goal.targetDate === null) {
      return sum;
    }

    const remaining = Math.max(0, goal.targetAmount.amount - goal.currentAmount.amount);
    if (remaining === 0) {
      return sum;
    }

    return sum + Math.ceil(remaining / getMonthsUntilTargetInclusive(asOf, goal.targetDate));
  }, 0);
}

function isReservedBudgetSpending(
  budget: BudgetWithSpending | undefined,
  categoryName: string | undefined,
  billCategoryIds: ReadonlySet<string>,
): boolean {
  if (budget?.categoryId !== undefined && billCategoryIds.has(budget.categoryId)) {
    return true;
  }

  const label = `${budget?.name ?? ''} ${categoryName ?? ''}`.toLowerCase();
  return RESERVED_BUDGET_KEYWORDS.some((keyword) => label.includes(keyword));
}

function getDiscretionarySpentCents(
  activeMonthlyBudgets: readonly BudgetWithSpending[],
  paces: readonly SpendingPace[],
  categoryNames: ReadonlyMap<string, string>,
  billCategoryIds: ReadonlySet<string>,
  fallbackSpentCents: number,
): number {
  if (paces.length === 0) {
    return Math.max(0, fallbackSpentCents);
  }

  const budgetById = new Map(activeMonthlyBudgets.map((budget) => [budget.id, budget]));
  return paces.reduce((sum, pace) => {
    const budget = budgetById.get(pace.budgetId);
    const categoryName = budget ? categoryNames.get(budget.categoryId) : undefined;
    if (isReservedBudgetSpending(budget, categoryName, billCategoryIds)) {
      return sum;
    }

    return sum + Math.max(0, pace.spentCents);
  }, 0);
}

export const DashboardPage: React.FC = () => {
  const widgetLayout = useWidgetLayout();
  const { data, loading, error, refresh } = useDashboardData();
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();
  const { bills, loading: billsLoading, error: billsError, refresh: refreshBills } = useBills();
  const {
    budgets,
    loading: budgetsLoading,
    error: budgetsError,
    refresh: refreshBudgets,
  } = useBudgets();
  const { goals, loading: goalsLoading, error: goalsError, refresh: refreshGoals } = useGoals();
  const {
    prediction,
    loading: predictionLoading,
    error: predictionError,
    refresh: refreshPrediction,
  } = usePredictiveBalance();
  const { params: retirementParams } = useRetirementPlanner();
  const {
    statuses: rmdStatuses,
    reminders: rmdReminders,
    loading: rmdLoading,
  } = useRmdTracking(retirementParams.currentAge);

  // Spending trend chart state
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState<AccountPurposeFilter>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('30d');
  const [viewType, setViewType] = useState<ViewType>('line');

  const activeDays = PERIOD_DAYS[selectedPeriod === 'custom' ? '30d' : selectedPeriod];

  const chartDateRange = useMemo(() => getLastNDaysBounds(activeDays), [activeDays]);
  const chartFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
      startDate: chartDateRange.startDate,
      endDate: chartDateRange.endDate,
    }),
    [chartDateRange],
  );
  const {
    transactions: chartTransactions,
    loading: chartTransactionsLoading,
    error: chartTransactionsError,
    refresh: refreshChartTransactions,
  } = useTransactions(chartFilters);

  const prevDateRange = useMemo(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - activeDays);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (activeDays - 1));
    return {
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
    };
  }, [activeDays]);

  const prevFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
      startDate: prevDateRange.startDate,
      endDate: prevDateRange.endDate,
    }),
    [prevDateRange],
  );
  const { transactions: prevTransactions } = useTransactions(prevFilters);

  const currentMonthRange = useMemo(() => getCurrentMonthBounds(), []);
  const activeMonthlyBudgets = useMemo(
    () =>
      budgets.filter((budget) =>
        isBudgetActiveInMonth(budget, currentMonthRange.startDate, currentMonthRange.endDate),
      ),
    [budgets, currentMonthRange],
  );
  const spendingPace = useSpendingPace(activeMonthlyBudgets);
  const currentMonthFilters = useMemo(
    () => ({
      startDate: currentMonthRange.startDate,
      endDate: currentMonthRange.endDate,
    }),
    [currentMonthRange],
  );
  const {
    transactions: currentMonthTransactions,
    loading: currentMonthTransactionsLoading,
    error: currentMonthTransactionsError,
    refresh: refreshCurrentMonthTransactions,
  } = useTransactions(currentMonthFilters);
  const previousMonthRange = useMemo(() => getPreviousMonthBounds(), []);
  const previousMonthFilters = useMemo(
    () => ({
      startDate: previousMonthRange.startDate,
      endDate: previousMonthRange.endDate,
    }),
    [previousMonthRange],
  );
  const {
    transactions: previousMonthTransactions,
    loading: previousMonthTransactionsLoading,
    error: previousMonthTransactionsError,
    refresh: refreshPreviousMonthTransactions,
  } = useTransactions(previousMonthFilters);
  const dashboardAsOf = useMemo(() => new Date(), []);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const filteredChartTransactions = useMemo(
    () => filterTransactionsByAccountPurpose(chartTransactions, accounts, selectedPurposeFilter),
    [chartTransactions, accounts, selectedPurposeFilter],
  );
  const filteredPrevTransactions = useMemo(
    () => filterTransactionsByAccountPurpose(prevTransactions, accounts, selectedPurposeFilter),
    [prevTransactions, accounts, selectedPurposeFilter],
  );
  const filteredCurrentMonthTransactions = useMemo(
    () =>
      filterTransactionsByAccountPurpose(currentMonthTransactions, accounts, selectedPurposeFilter),
    [currentMonthTransactions, accounts, selectedPurposeFilter],
  );
  const filteredPreviousMonthTransactions = useMemo(
    () =>
      filterTransactionsByAccountPurpose(
        previousMonthTransactions,
        accounts,
        selectedPurposeFilter,
      ),
    [previousMonthTransactions, accounts, selectedPurposeFilter],
  );
  const filteredRecentTransactions = useMemo(
    () =>
      data === null
        ? []
        : filterTransactionsByAccountPurpose(
            data.recentTransactions,
            accounts,
            selectedPurposeFilter,
          ),
    [data, accounts, selectedPurposeFilter],
  );
  const filteredAccounts = useMemo(
    () => filterAccountsByPurpose(accounts, selectedPurposeFilter),
    [accounts, selectedPurposeFilter],
  );
  const chartCurrency =
    filteredChartTransactions[0]?.currency.code ??
    filteredRecentTransactions[0]?.currency.code ??
    'USD';
  const filteredAccountIds = useMemo(
    () => new Set(filteredAccounts.map((account) => account.id)),
    [filteredAccounts],
  );
  const filteredBills = useMemo(
    () =>
      selectedPurposeFilter === 'all'
        ? bills
        : bills.filter((bill) => bill.accountId === null || filteredAccountIds.has(bill.accountId)),
    [bills, filteredAccountIds, selectedPurposeFilter],
  );
  const filteredGoals = useMemo(
    () =>
      selectedPurposeFilter === 'all'
        ? goals
        : goals.filter((goal) => goal.accountId === null || filteredAccountIds.has(goal.accountId)),
    [filteredAccountIds, goals, selectedPurposeFilter],
  );
  const safeToSpendCurrency =
    filteredBills[0]?.currency.code ?? filteredGoals[0]?.currency.code ?? chartCurrency;
  const safeToSpendBreakdown = useMemo(() => {
    const billCategoryIds = new Set(
      filteredBills
        .filter(
          (bill) =>
            (bill.status === 'UPCOMING' || bill.status === 'OVERDUE') &&
            bill.dueDate >= currentMonthRange.startDate &&
            bill.dueDate <= currentMonthRange.endDate &&
            bill.categoryId !== null,
        )
        .map((bill) => bill.categoryId as string),
    );

    return calculateSafeToSpend({
      expectedMonthlyIncomeCents:
        (data?.incomeThisMonth ?? 0) + getPredictedRemainingIncomeCents(prediction),
      remainingBillsCents: getRemainingBillsDueThisMonthCents(
        filteredBills,
        currentMonthRange.startDate,
        currentMonthRange.endDate,
      ),
      plannedSavingsCents: getPlannedGoalContributionsCents(filteredGoals, dashboardAsOf),
      discretionarySpentCents: getDiscretionarySpentCents(
        activeMonthlyBudgets,
        spendingPace.paces,
        categoryNames,
        billCategoryIds,
        data?.spentThisMonth ?? 0,
      ),
    });
  }, [
    activeMonthlyBudgets,
    categoryNames,
    currentMonthRange,
    data?.incomeThisMonth,
    data?.spentThisMonth,
    filteredBills,
    filteredGoals,
    prediction,
    spendingPace.paces,
    dashboardAsOf,
  ]);

  // Grocery mode — fast "can I afford this?" / safe-to-spend-before-payday card.
  // The account/bill/category/income mapping lives in the lazily-loaded
  // GroceryModeSection so it stays out of the dashboard route chunk; only the
  // reserved-funds and "today" scalars (which reuse local helpers) are computed
  // here from data already in scope.
  const groceryReservedCents = useMemo(
    () => getPlannedGoalContributionsCents(filteredGoals, dashboardAsOf),
    [filteredGoals, dashboardAsOf],
  );
  const groceryToday = useMemo(() => formatLocalDate(dashboardAsOf), [dashboardAsOf]);

  const chartPrivacyRollup = useMemo(
    () => rollUpProtectedTransactions(filteredChartTransactions, categories),
    [filteredChartTransactions, categories],
  );

  const recentPrivacyRollup = useMemo(
    () => rollUpProtectedTransactions(filteredRecentTransactions, categories),
    [filteredRecentTransactions, categories],
  );

  const { trendData, barData, categoryData, hasChartData } = useMemo(() => {
    const transformedCategoryData = buildCategoryData(
      chartPrivacyRollup.visibleTransactions,
      categoryNames,
    );

    if (chartPrivacyRollup.protectedRollup !== null) {
      transformedCategoryData.push({
        name: `${chartPrivacyRollup.protectedRollup.label} (${chartPrivacyRollup.protectedRollup.count})`,
        value: chartPrivacyRollup.protectedRollup.totalCents / 100,
      });
    }

    return {
      trendData: buildTrendData(chartPrivacyRollup.visibleTransactions, activeDays),
      barData: transformedCategoryData.map(({ name, value }) => ({ name, amount: value })),
      categoryData: transformedCategoryData,
      hasChartData: transformedCategoryData.length > 0,
    };
  }, [chartPrivacyRollup, categoryNames, activeDays]);

  const { averageDaily, totalSpending } = useMemo(
    () => computeSpendingStats(chartPrivacyRollup.visibleTransactions, activeDays),
    [chartPrivacyRollup, activeDays],
  );

  const prevPrivacyRollup = useMemo(
    () => rollUpProtectedTransactions(filteredPrevTransactions, categories),
    [filteredPrevTransactions, categories],
  );

  const comparison = useMemo(() => {
    if (prevPrivacyRollup.visibleTransactions.length === 0 && totalSpending === 0) return null;
    const prevTotal = prevPrivacyRollup.visibleTransactions.reduce(
      (sum, t) => sum + Math.abs(t.amount.amount) / 100,
      0,
    );
    if (prevTotal === 0) return null;
    const percentChange = ((totalSpending - prevTotal) / prevTotal) * 100;
    return {
      percentChange,
      absoluteChange: totalSpending - prevTotal,
    };
  }, [prevPrivacyRollup, totalSpending]);

  const handlePeriodChange = useCallback((period: TimePeriod) => {
    setSelectedPeriod(period);
  }, []);

  const handleViewTypeChange = useCallback((type: ViewType) => {
    setViewType(type);
  }, []);

  const netWorth = useMemo(
    () => filteredAccounts.reduce((sum, account) => sum + account.currentBalance.amount, 0),
    [filteredAccounts],
  );
  const spentThisMonth = useMemo(
    () =>
      filteredCurrentMonthTransactions.reduce(
        (sum, transaction) =>
          transaction.type === 'EXPENSE' ? sum + Math.abs(transaction.amount.amount) : sum,
        0,
      ),
    [filteredCurrentMonthTransactions],
  );
  // Savings rate = (income − expenses) / income for the current month, compared
  // with the prior calendar month. Reuses the integer-cents savings-rate math
  // from lib/dashboard/savings-rate-summary (safe against divide-by-zero).
  const savingsRateCard = useMemo(() => {
    const currentMonthKey = currentMonthRange.startDate.slice(0, 7);
    const previousMonthKey = previousMonthRange.startDate.slice(0, 7);
    const cashFlows: MonthlyCashFlow[] = [
      toMonthlyCashFlow(previousMonthKey, filteredPreviousMonthTransactions),
      toMonthlyCashFlow(currentMonthKey, filteredCurrentMonthTransactions),
    ];

    return buildSavingsRateCardModel(buildSavingsRateDashboardSummary(cashFlows, currentMonthKey));
  }, [
    currentMonthRange.startDate,
    previousMonthRange.startDate,
    filteredCurrentMonthTransactions,
    filteredPreviousMonthTransactions,
  ]);
  const debtSummary = useMemo(
    () =>
      filteredAccounts.reduce(
        (summary, account) => {
          if (!isLiabilityType(account.type)) {
            return summary;
          }

          return {
            balance: summary.balance + Math.abs(account.currentBalance.amount),
            count: summary.count + 1,
          };
        },
        { balance: 0, count: 0 },
      ),
    [filteredAccounts],
  );
  const visibleWidgetIds = useMemo(
    () => new Set(widgetLayout.visibleWidgets.map((widget) => widget.id)),
    [widgetLayout.visibleWidgets],
  );

  const isDashboardEmpty =
    data === null ||
    (netWorth === 0 &&
      spentThisMonth === 0 &&
      data.monthlyBudget === 0 &&
      data.budgetSpent === 0 &&
      filteredRecentTransactions.length === 0 &&
      filteredAccounts.length === 0);

  const isLoading =
    loading ||
    accountsLoading ||
    categoriesLoading ||
    billsLoading ||
    budgetsLoading ||
    goalsLoading ||
    predictionLoading ||
    chartTransactionsLoading ||
    currentMonthTransactionsLoading ||
    previousMonthTransactionsLoading;
  const resolvedError =
    error ??
    accountsError ??
    categoriesError ??
    billsError ??
    budgetsError ??
    goalsError ??
    predictionError ??
    chartTransactionsError ??
    currentMonthTransactionsError ??
    previousMonthTransactionsError;
  const budgetPercentage =
    data !== null && data.monthlyBudget > 0
      ? Math.round((data.budgetSpent / data.monthlyBudget) * 100)
      : 0;
  const budgetStatusTone =
    budgetPercentage > 90 ? 'negative' : budgetPercentage > 75 ? 'warning' : 'positive';
  const dashboardBudgetStatus = getBudgetStatusIndicator(budgetPercentage);
  const rmdDueCount = rmdStatuses.filter((status) => !status.isSatisfied).length;
  const rmdBadgeTone = rmdReminders.some((status) => status.urgency === 'overdue')
    ? 'negative'
    : rmdReminders.length > 0
      ? 'warning'
      : 'info';
  const handleRetry = () => {
    refresh();
    refreshAccounts();
    refreshCategories();
    refreshBills();
    refreshBudgets();
    refreshGoals();
    refreshPrediction();
    refreshChartTransactions();
    refreshCurrentMonthTransactions();
    refreshPreviousMonthTransactions();
  };

  return (
    <>
      <OfflineBanner />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-4)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            margin: 0,
          }}
        >
          Dashboard
        </h2>
        {!rmdLoading && rmdDueCount > 0 && (
          <Link
            to="/planning"
            aria-label={`${rmdDueCount} required minimum distribution ${rmdDueCount === 1 ? 'reminder' : 'reminders'} due`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              padding: 'var(--spacing-2) var(--spacing-3)',
              borderRadius: '999px',
              border: '1px solid var(--semantic-border-default)',
              color:
                rmdBadgeTone === 'negative'
                  ? 'var(--semantic-status-negative)'
                  : rmdBadgeTone === 'warning'
                    ? 'var(--semantic-status-warning)'
                    : 'var(--semantic-interactive-default)',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            RMD due
            <span aria-hidden="true">{rmdDueCount}</span>
          </Link>
        )}
        <SyncIndicator />
      </div>
      <button
        type="button"
        className="dashboard-customize-btn"
        onClick={widgetLayout.startCustomizing}
        aria-haspopup="dialog"
      >
        Customize workspace
      </button>
      <AccountPurposeFilterControl
        value={selectedPurposeFilter}
        onChange={setSelectedPurposeFilter}
        label="Filter dashboard by account purpose"
      />
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading dashboard" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : (
        <>
          {isDashboardEmpty ? (
            <EmptyState
              title={
                selectedPurposeFilter === 'all'
                  ? 'No dashboard data yet'
                  : 'No matching account activity'
              }
              description={
                selectedPurposeFilter === 'all'
                  ? 'Add accounts, budgets, or transactions to see your financial summary here.'
                  : 'Try a different purpose filter or tag more accounts for this view.'
              }
            />
          ) : (
            <>
              <section
                className="page-section safe-to-spend-section"
                aria-label="Monthly spending answer"
              >
                <Suspense fallback={<SectionFallback label="Loading monthly spending answer" />}>
                  <SafeToSpendCard
                    breakdown={safeToSpendBreakdown}
                    currency={safeToSpendCurrency}
                  />
                </Suspense>
              </section>
              <Suspense fallback={<SectionFallback label="Loading grocery mode" />}>
                <GroceryModeSection
                  accounts={filteredAccounts}
                  reservedCents={groceryReservedCents}
                  bills={filteredBills}
                  budgets={activeMonthlyBudgets}
                  categoryNames={categoryNames}
                  transactions={filteredCurrentMonthTransactions}
                  today={groceryToday}
                  fallbackPayday={currentMonthRange.endDate}
                  currency={safeToSpendCurrency}
                />
              </Suspense>
              <section className="page-section" aria-label="Financial summary">
                <div className="card-grid card-grid--4">
                  <article
                    className={`card savings-rate-card savings-rate-card--${savingsRateCard.tone}`}
                    aria-label="Savings rate this month"
                  >
                    <div className="card__header">
                      <h3 className="card__title">Savings Rate</h3>
                    </div>
                    <div className="card__value" aria-live="polite">
                      {savingsRateCard.hasIncome ? (
                        <span
                          aria-label={`${formatSavingsRatePercent(savingsRateCard.savingsRatePercent)} savings rate this month`}
                        >
                          {formatSavingsRatePercent(savingsRateCard.savingsRatePercent)}
                        </span>
                      ) : (
                        <span aria-label="Savings rate not available — no income recorded this month">
                          N/A
                        </span>
                      )}
                    </div>
                    <p className="list-item__secondary">
                      {savingsRateCard.hasIncome ? (
                        <>
                          <CurrencyDisplay
                            amount={savingsRateCard.savingsCents}
                            currency={safeToSpendCurrency}
                            colorize
                            showSign
                            context="saved this month"
                          />{' '}
                          saved this month
                        </>
                      ) : (
                        'Add income this month to calculate your savings rate.'
                      )}
                    </p>
                    {savingsRateCard.hasIncome ? (
                      <p className="savings-rate-card__trend">
                        <span className="savings-rate-card__trend-icon" aria-hidden="true">
                          {SAVINGS_RATE_TREND_ICON[savingsRateCard.trend]}
                        </span>
                        {describeSavingsRateTrend(
                          savingsRateCard.trend,
                          savingsRateCard.deltaPercentagePoints,
                        )}
                      </p>
                    ) : null}
                    <p className="savings-rate-card__status">{savingsRateCard.statusLabel}</p>
                  </article>
                  {visibleWidgetIds.has('net-worth') ? (
                    <article className="card" aria-label="Net worth">
                      <div className="card__header">
                        <h3 className="card__title">Net Worth</h3>
                      </div>
                      <div className="card__value" aria-live="polite">
                        <CurrencyDisplay amount={netWorth} colorize context="net worth" />
                      </div>
                    </article>
                  ) : null}
                  {visibleWidgetIds.has('monthly-spending') ? (
                    <article className="card" aria-label="Monthly spending">
                      <div className="card__header">
                        <h3 className="card__title">Spent This Month</h3>
                      </div>
                      <div className="card__value" aria-live="polite">
                        <CurrencyDisplay amount={spentThisMonth} context="spent this month" />
                      </div>
                    </article>
                  ) : null}
                  {visibleWidgetIds.has('budget-health') ? (
                    <article className="card" aria-label="Budget health">
                      <div className="card__header">
                        <h3 className="card__title">Budget Health</h3>
                      </div>
                      <div className="card__value" aria-live="polite">
                        <span aria-hidden="true">{dashboardBudgetStatus.icon} </span>
                        {budgetPercentage}% used
                        <span className="sr-only">, {dashboardBudgetStatus.label}</span>
                      </div>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuenow={budgetPercentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Budget ${budgetPercentage} percent used, ${dashboardBudgetStatus.label}`}
                      >
                        <div
                          className={`progress-bar__fill progress-bar__fill--${budgetStatusTone}`}
                          style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
                        />
                      </div>
                    </article>
                  ) : null}
                  <article className="card" aria-label="Debt status">
                    <div className="card__header">
                      <h3 className="card__title">Debt Payoff</h3>
                    </div>
                    <div className="card__value" aria-live="polite">
                      {debtSummary.balance > 0 ? (
                        <CurrencyDisplay
                          amount={debtSummary.balance}
                          context="tracked debt balance"
                        />
                      ) : (
                        'Plan payoff'
                      )}
                    </div>
                    <p className="list-item__secondary">
                      {debtSummary.count > 0
                        ? `${debtSummary.count} debt account${debtSummary.count === 1 ? '' : 's'} tracked.`
                        : 'Compare avalanche and snowball strategies.'}
                    </p>
                    <Link to="/debt" className="auth-footer__link" aria-label="Open Debt workspace">
                      Open Debt workspace
                    </Link>
                  </article>
                </div>
              </section>
              <Suspense fallback={<SectionFallback label="Loading things to check" />}>
                <DashboardThingsToCheckSection
                  accounts={accounts}
                  selectedPurposeFilter={selectedPurposeFilter}
                />
              </Suspense>
              <Suspense fallback={<SectionFallback label="Loading tax reserve guidance" />}>
                <DashboardTaxReserveSection
                  accounts={accounts}
                  currentMonthTransactions={currentMonthTransactions}
                  fallbackCurrency={chartCurrency}
                />
              </Suspense>
              {hasChartData &&
              (visibleWidgetIds.has('spending-trend') ||
                visibleWidgetIds.has('spending-by-category') ||
                visibleWidgetIds.has('category-pie')) ? (
                <section className="page-section dashboard-charts" aria-label="Financial charts">
                  {visibleWidgetIds.has('spending-trend') ? (
                    <div className="chart-container" aria-label="Spending trend chart">
                      <Suspense fallback={<ChartFallback />}>
                        <SpendingTrendChart
                          data={trendData}
                          currency={chartCurrency}
                          title="Spending Trend"
                          selectedPeriod={selectedPeriod}
                          onPeriodChange={handlePeriodChange}
                          viewType={viewType}
                          onViewTypeChange={handleViewTypeChange}
                          averageDailySpending={averageDaily}
                          comparison={comparison}
                        />
                      </Suspense>
                    </div>
                  ) : null}
                  {visibleWidgetIds.has('spending-by-category') ? (
                    <div className="chart-container" aria-label="Category spending bar chart">
                      <Suspense fallback={<ChartFallback />}>
                        <SpendingBarChart
                          data={barData}
                          currency={chartCurrency}
                          title="Spending by Category"
                        />
                      </Suspense>
                    </div>
                  ) : null}
                  {visibleWidgetIds.has('category-pie') ? (
                    <div className="chart-container" aria-label="Category share pie chart">
                      <Suspense fallback={<ChartFallback />}>
                        <CategoryPieChart
                          data={categoryData}
                          currency={chartCurrency}
                          width={280}
                          height={280}
                          title="Category Share"
                        />
                      </Suspense>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <Suspense fallback={<SectionFallback label="Loading financial coach" />}>
                <DashboardCoachSection />
              </Suspense>
            </>
          )}

          <Suspense fallback={<SectionFallback label="Loading warranty dashboard" />}>
            <WarrantyDashboard />
          </Suspense>

          <Suspense fallback={<SectionFallback label="Loading mood journal" />}>
            <DashboardMoodJournalSection categories={categories} currency={chartCurrency} />
          </Suspense>
          {!isDashboardEmpty && visibleWidgetIds.has('recent-transactions') ? (
            <section className="page-section" aria-label="Recent transactions">
              <h3 className="page-section__title">Recent Transactions</h3>
              <div className="card">
                {(recentPrivacyRollup?.visibleTransactions.length ?? 0) === 0 &&
                recentPrivacyRollup?.protectedRollup === null ? (
                  <EmptyState
                    title="No recent transactions"
                    description="Transactions you add will appear here."
                  />
                ) : (
                  <ul className="list-group" role="list">
                    {recentPrivacyRollup?.protectedRollup !== null &&
                      recentPrivacyRollup?.protectedRollup !== undefined && (
                        <li className="list-item" role="listitem">
                          <div className="list-item__content">
                            <p className="list-item__primary">Protected</p>
                            <p className="list-item__secondary">
                              {recentPrivacyRollup.protectedRollup.count} protected transaction
                              {recentPrivacyRollup.protectedRollup.count === 1 ? '' : 's'} hidden
                            </p>
                          </div>
                          <div className="list-item__trailing">
                            <CurrencyDisplay
                              amount={recentPrivacyRollup.protectedRollup.totalCents}
                              currency={recentPrivacyRollup.protectedRollup.currency}
                              context="protected transactions total"
                            />
                          </div>
                        </li>
                      )}
                    {recentPrivacyRollup?.visibleTransactions.map((transaction) => (
                      <li key={transaction.id} className="list-item" role="listitem">
                        <Link
                          to={`/transactions/${transaction.id}`}
                          className="list-item__link"
                          aria-label={`View transaction: ${transaction.payee ?? transaction.note ?? 'Transaction'}`}
                        >
                          <div className="list-item__content">
                            <p className="list-item__primary">
                              {transaction.payee ??
                                transaction.note ??
                                (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')}
                            </p>
                            <p className="list-item__secondary">
                              {transaction.categoryId !== null
                                ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                                : 'Uncategorized'}
                            </p>
                          </div>
                          <div className="list-item__trailing">
                            <CurrencyDisplay
                              amount={getTransactionDisplayAmount(transaction)}
                              currency={transaction.currency.code}
                              colorize
                              showSign
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}
        </>
      )}
      <Suspense fallback={null}>
        <CustomizePanel
          isOpen={widgetLayout.isCustomizing}
          widgets={widgetLayout.widgets}
          onToggle={widgetLayout.toggleWidget}
          onMove={widgetLayout.moveWidget}
          onReset={widgetLayout.resetLayout}
          onClose={widgetLayout.stopCustomizing}
        />
      </Suspense>
      <Suspense fallback={null}>
        <QueryEngine />
      </Suspense>
    </>
  );
};

export default DashboardPage;
