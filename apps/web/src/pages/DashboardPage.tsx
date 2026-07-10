// SPDX-License-Identifier: BUSL-1.1

import React, { Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TimePeriod, ViewType } from '../components/charts';
import { ChartEmptyState } from '../components/charts/ChartEmptyState';
import { groupTopNCategories } from '../components/charts/chart-palette';
import { SpendingInsightCard } from '../components/dashboard/SpendingInsightCard';
import { MultiCurrencyTotals } from '../components/dashboard/CurrencyDisplay';
import { AccountPurposeFilterControl } from '../components/accounts';
import { RecentTransactionsCard } from '../components/transactions';
import {
  CurrencyDisplay,
  DashboardSkeleton,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  ReadAloudButton,
} from '../components/common';
import { ExplainThis } from '../components/common/ExplainThis';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  useAccounts,
  useBills,
  useBudgets,
  useCategories,
  useDashboardData,
  useDisplayCurrencyRollup,
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
import { getCurrentLocale } from '../lib/i18n';
import {
  selectWorkspaceAccounts,
  selectWorkspaceTransactions,
  type AccountPurposeFilter,
} from '../lib/accountPurpose';
import { isLiabilityType } from '../lib/analytics/net-worth';
import { calculateSafeToSpend } from '../lib/dashboard/safe-to-spend';
import type { SpendingPace } from '../lib/notifications';
import type { PredictionSummary } from '../lib/predictiveBalance';
import { rollUpProtectedTransactions } from '../lib/ui/privacy';
import { useHiddenModuleIds } from '../contexts/HiddenModulesContext';
import '../components/dashboard/dashboard.css';
import './DashboardPage.css';

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
const SavingsRateCard = React.lazy(() =>
  import('../components/dashboard/SavingsRateCard').then((module) => ({
    default: module.SavingsRateCard,
  })),
);
const GroceryModeSection = React.lazy(() => import('../components/dashboard/GroceryModeSection'));
const IncomeVsExpenseCard = React.lazy(() =>
  import('../components/dashboard/IncomeVsExpenseCard').then((module) => ({
    default: module.IncomeVsExpenseCard,
  })),
);
const AccountSummaryCard = React.lazy(() =>
  import('../components/dashboard/AccountSummaryCard').then((module) => ({
    default: module.AccountSummaryCard,
  })),
);
const GoalsProgressCard = React.lazy(() =>
  import('../components/dashboard/GoalsProgressCard').then((module) => ({
    default: module.GoalsProgressCard,
  })),
);

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

/** Time-of-day greeting used in the dashboard header for a personal, oriented feel. */
function getTimeOfDayGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/** Localized long-form date (e.g. "Wednesday, July 9") for the dashboard header. */
function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString(getCurrentLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
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
      label: pointDate.toLocaleDateString(getCurrentLocale(), {
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

function getPredictedRemainingIncomeCents(
  prediction: PredictionSummary | null,
  visibleAccountIds?: ReadonlySet<string>,
): number {
  return (
    prediction?.accounts.reduce(
      (sum, account) =>
        visibleAccountIds && !visibleAccountIds.has(account.accountId)
          ? sum
          : sum + Math.max(0, account.projectedIncomeCents),
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
    () => selectWorkspaceTransactions(chartTransactions, accounts, selectedPurposeFilter),
    [chartTransactions, accounts, selectedPurposeFilter],
  );
  const filteredPrevTransactions = useMemo(
    () => selectWorkspaceTransactions(prevTransactions, accounts, selectedPurposeFilter),
    [prevTransactions, accounts, selectedPurposeFilter],
  );
  const filteredCurrentMonthTransactions = useMemo(
    () => selectWorkspaceTransactions(currentMonthTransactions, accounts, selectedPurposeFilter),
    [currentMonthTransactions, accounts, selectedPurposeFilter],
  );
  const filteredPreviousMonthTransactions = useMemo(
    () => selectWorkspaceTransactions(previousMonthTransactions, accounts, selectedPurposeFilter),
    [previousMonthTransactions, accounts, selectedPurposeFilter],
  );
  const filteredRecentTransactions = useMemo(
    () =>
      data === null
        ? []
        : selectWorkspaceTransactions(data.recentTransactions, accounts, selectedPurposeFilter),
    [data, accounts, selectedPurposeFilter],
  );
  const filteredAccounts = useMemo(
    () => selectWorkspaceAccounts(accounts, selectedPurposeFilter),
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
  // Workspace-scoped monthly income and spend, derived from the same scoped
  // transaction set as net worth. This keeps every summary figure consistent with
  // the selected workspace so "All" is a true aggregate across workspaces
  // (All === Personal + Business + Shared) rather than reusing the unscoped
  // useDashboardData totals, which always cover every account.
  const incomeThisMonth = useMemo(
    () =>
      filteredCurrentMonthTransactions.reduce(
        (sum, transaction) =>
          transaction.type === 'INCOME' ? sum + transaction.amount.amount : sum,
        0,
      ),
    [filteredCurrentMonthTransactions],
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
  // Predicted remaining income scoped to the visible workspace only, so projected
  // income never leaks across workspaces into the "Safe to Spend" income figure.
  const scopedPredictedIncomeCents = useMemo(
    () => getPredictedRemainingIncomeCents(prediction, filteredAccountIds),
    [prediction, filteredAccountIds],
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
      expectedMonthlyIncomeCents: incomeThisMonth + scopedPredictedIncomeCents,
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
        spentThisMonth,
      ),
    });
  }, [
    activeMonthlyBudgets,
    categoryNames,
    currentMonthRange,
    incomeThisMonth,
    spentThisMonth,
    scopedPredictedIncomeCents,
    filteredBills,
    filteredGoals,
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

  const { trendData, barData, categoryData, hasChartData } = useMemo(() => {
    // Cap the category charts at a readable Top N, rolling the remainder into a
    // single "Other" entry that preserves the grand total (#3757). Beyond ~6-8
    // categories a pie/bar becomes unreadable and the 6-color CVD-safe palette
    // starts to repeat.
    const transformedCategoryData = groupTopNCategories(
      buildCategoryData(chartPrivacyRollup.visibleTransactions, categoryNames),
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
  // Convert each account balance into the user's display currency before
  // summing so the card honours the display-currency preference instead of
  // rendering a raw cross-currency total in hardcoded USD (#3284/#3282). Sign
  // semantics are intentionally left unchanged here (sign-blind sum, matching
  // `netWorth` above) — the liability-sign fix is tracked separately (#3202);
  // this change only fixes the currency of the displayed figure.
  const netWorthDisplayAmounts = useMemo(
    () =>
      filteredAccounts.map((account) => ({
        id: account.id,
        amountCents: account.currentBalance.amount,
        currency: account.currency.code,
      })),
    [filteredAccounts],
  );
  const netWorthRollup = useDisplayCurrencyRollup(netWorthDisplayAmounts);
  const displayNetWorth = netWorthRollup.rollup.totalCents;
  // #3324: feed the multi-currency breakdown real per-account balances (in
  // their own currency) instead of sample props. Only surface it for users who
  // actually hold more than one currency so single-currency dashboards stay
  // uncluttered.
  const multiCurrencyItems = useMemo(
    () =>
      filteredAccounts.map((account) => ({
        amountCents: account.currentBalance.amount,
        currency: account.currency,
      })),
    [filteredAccounts],
  );
  const heldCurrencyCodes = useMemo(
    () => new Set(filteredAccounts.map((account) => account.currency.code)),
    [filteredAccounts],
  );
  const hasMultipleCurrencies = heldCurrencyCodes.size > 1;
  // #3287: disclose when the converted net-worth total leans on stale rates or
  // omits currencies we could not convert, so the headline figure stays honest.
  const netWorthDisclosure = useMemo(() => {
    const notes: string[] = [];
    if (netWorthRollup.unconvertedCurrencies.length > 0) {
      notes.push(
        'Excludes ' +
          netWorthRollup.unconvertedCurrencies.join(', ') +
          ' (no exchange rate available).',
      );
    }
    if (netWorthRollup.hasStaleRates) {
      notes.push('Converted using exchange rates that may be out of date.');
    }
    return notes;
  }, [netWorthRollup.unconvertedCurrencies, netWorthRollup.hasStaleRates]);
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
  // Whether the user has any chart widget enabled via Customize. When true but
  // there is no chart data we show a compact empty state instead of collapsing
  // the section to nothing; when false the section stays absent (#3751).
  const anyChartWidgetVisible = useMemo(
    () =>
      visibleWidgetIds.has('spending-trend') ||
      visibleWidgetIds.has('spending-by-category') ||
      visibleWidgetIds.has('category-pie'),
    [visibleWidgetIds],
  );
  const chartsEmptyMessage = useMemo(() => {
    const periodText: Record<TimePeriod, string> = {
      '7d': 'last 7 days',
      '30d': 'last 30 days',
      '90d': 'last 90 days',
      '1y': 'last year',
      custom: 'selected period',
    };
    const filterClause =
      selectedPurposeFilter !== 'all' ? ' under the current account-purpose filter' : '';
    return `No spending in expense categories for the ${periodText[selectedPeriod]}${filterClause}. Add a transaction, widen the time period, or change the filter to see charts.`;
  }, [selectedPeriod, selectedPurposeFilter]);
  const topSpendingCategory = useMemo(
    () => categoryData.find((slice) => slice.value > 0) ?? null,
    [categoryData],
  );
  // Minimalist mode (#2122): hide a quick-access card when the user has hidden
  // the corresponding module. Sourced from layout-level context so the rich
  // module-visibility catalogue stays out of this eager dashboard chunk.
  const hiddenModules = useHiddenModuleIds();

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
      <header className="dashboard-header">
        <div className="dashboard-header__heading">
          <p className="dashboard-header__eyebrow">Dashboard</p>
          <h2 className="dashboard-header__title">{getTimeOfDayGreeting(dashboardAsOf)}</h2>
          <p className="dashboard-header__date">{formatHeaderDate(dashboardAsOf)}</p>
        </div>
        {!rmdLoading && rmdDueCount > 0 && (
          <Link
            to="/planning"
            className={`dashboard-rmd-badge dashboard-rmd-badge--${rmdBadgeTone}`}
            aria-label={`${rmdDueCount} required minimum distribution ${rmdDueCount === 1 ? 'reminder' : 'reminders'} due`}
          >
            RMD due
            <span aria-hidden="true">{rmdDueCount}</span>
          </Link>
        )}
      </header>
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
        <DashboardSkeleton />
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
              action={
                selectedPurposeFilter === 'all' ? (
                  <Link to="/accounts" className="form-button form-button--primary">
                    Add your first account
                  </Link>
                ) : undefined
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
                <div className="card-grid card-grid--4 dashboard-summary-grid">
                  <Suspense
                    fallback={
                      <article className="card" role="status" aria-label="Loading savings rate">
                        <LoadingSpinner size={24} label="Loading savings rate" />
                      </article>
                    }
                  >
                    <SavingsRateCard
                      currentMonthKey={currentMonthRange.startDate.slice(0, 7)}
                      previousMonthKey={previousMonthRange.startDate.slice(0, 7)}
                      currentMonthTransactions={filteredCurrentMonthTransactions}
                      previousMonthTransactions={filteredPreviousMonthTransactions}
                      currency={safeToSpendCurrency}
                    />
                  </Suspense>
                  {visibleWidgetIds.has('net-worth') && !hiddenModules.has('net-worth') ? (
                    <article className="card" aria-label="Net worth">
                      <div className="card__header">
                        <h3 className="card__title">Net Worth</h3>
                        <ExplainThis glossaryKey="netWorth" buttonLabel="Explain net worth" />
                      </div>
                      <div className="card__value" aria-live="polite">
                        <CurrencyDisplay
                          amount={displayNetWorth}
                          currency={netWorthRollup.displayCurrency}
                          colorize
                          context="net worth"
                        />
                        <ReadAloudButton
                          amount={displayNetWorth}
                          currency={netWorthRollup.displayCurrency}
                          context="net worth"
                        />
                      </div>
                      {displayNetWorth < 0 ? (
                        <p
                          className="dashboard-card-reassurance"
                          style={{
                            marginTop: 'var(--spacing-1)',
                            color: 'var(--semantic-text-secondary)',
                          }}
                        >
                          A negative number is normal when you have student loans — it improves as
                          you pay them down and build savings.
                        </p>
                      ) : null}
                      {netWorthDisclosure.length > 0 ? (
                        <p
                          className="dashboard-card-disclosure"
                          role="note"
                          style={{
                            marginTop: 'var(--spacing-1)',
                            color: 'var(--semantic-text-secondary)',
                          }}
                        >
                          {netWorthDisclosure.join(' ')}
                        </p>
                      ) : null}
                    </article>
                  ) : null}
                  {visibleWidgetIds.has('monthly-spending') ? (
                    <article className="card" aria-label="Monthly spending">
                      <div className="card__header">
                        <h3 className="card__title">Spent This Month</h3>
                        <ExplainThis
                          buttonLabel="Explain Spent This Month"
                          content={{
                            term: 'Spent This Month',
                            definition:
                              'The total you have spent so far this calendar month, across the accounts shown here.',
                            example:
                              'If you spent $400 on groceries and $150 on gas since the 1st, this shows $550.',
                            whyItMatters:
                              'Watching it grow through the month helps you catch overspending early, while you can still adjust.',
                          }}
                        />
                      </div>
                      <div className="card__value" aria-live="polite">
                        <CurrencyDisplay amount={spentThisMonth} context="spent this month" />
                      </div>
                    </article>
                  ) : null}
                  {visibleWidgetIds.has('budget-health') && !hiddenModules.has('budgets') ? (
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
                  {!hiddenModules.has('debt') ? (
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
                      <Link to="/debt" className="auth-footer__link">
                        Open Debt workspace
                      </Link>
                    </article>
                  ) : null}
                </div>
              </section>
              {hasMultipleCurrencies ? (
                <section className="page-section" aria-label="Money by currency">
                  <MultiCurrencyTotals items={multiCurrencyItems} />
                </section>
              ) : null}
              {visibleWidgetIds.has('income-vs-expense') ||
              visibleWidgetIds.has('account-summary') ||
              visibleWidgetIds.has('goals-progress') ? (
                <section className="page-section" aria-label="Financial overview">
                  <div className="card-grid card-grid--3 dashboard-overview-grid">
                    {visibleWidgetIds.has('income-vs-expense') ? (
                      <Suspense
                        fallback={<SectionFallback label="Loading income versus expense" />}
                      >
                        <IncomeVsExpenseCard
                          incomeCents={incomeThisMonth}
                          expenseCents={spentThisMonth}
                          currency={safeToSpendCurrency}
                        />
                      </Suspense>
                    ) : null}
                    {visibleWidgetIds.has('account-summary') ? (
                      <Suspense fallback={<SectionFallback label="Loading account summary" />}>
                        <AccountSummaryCard
                          accounts={filteredAccounts}
                          currency={safeToSpendCurrency}
                        />
                      </Suspense>
                    ) : null}
                    {visibleWidgetIds.has('goals-progress') && !hiddenModules.has('goals') ? (
                      <Suspense fallback={<SectionFallback label="Loading goals progress" />}>
                        <GoalsProgressCard goals={filteredGoals} currency={safeToSpendCurrency} />
                      </Suspense>
                    ) : null}
                  </div>
                </section>
              ) : null}
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
              {anyChartWidgetVisible ? (
                <section className="page-section dashboard-charts" aria-label="Financial charts">
                  {hasChartData ? (
                    <>
                      <SpendingInsightCard
                        topCategory={topSpendingCategory}
                        totalSpending={totalSpending}
                        comparison={comparison}
                        currency={chartCurrency}
                      />
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
                    </>
                  ) : (
                    <div className="chart-container" aria-label="Financial charts empty state">
                      <ChartEmptyState title="Financial charts" message={chartsEmptyMessage} />
                    </div>
                  )}
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
            <RecentTransactionsCard
              categories={categories}
              accounts={accounts}
              accountPurposeFilter={selectedPurposeFilter}
            />
          ) : null}
        </>
      )}
      <Suspense fallback={null}>
        <CustomizePanel
          isOpen={widgetLayout.isCustomizing}
          widgets={widgetLayout.widgets}
          onToggle={widgetLayout.toggleWidget}
          onMove={widgetLayout.moveWidget}
          onReorder={widgetLayout.reorderWidget}
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
