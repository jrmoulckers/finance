// SPDX-License-Identifier: BUSL-1.1

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QueryEngine } from '../components/ai/QueryEngine';
import type { TimePeriod, ViewType } from '../components/charts';
import { CoachCard, CoachPanel } from '../components/coaching';
import { AccountPurposeFilterControl } from '../components/accounts';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner, SyncIndicator } from '../components/common';
import { CustomizePanel } from '../components/dashboard/CustomizePanel';
import { SafeToSpendCard } from '../components/dashboard/SafeToSpendCard';
import {
  EmotionalPatterns,
  MoodCalendar,
  MoodEntry,
  MoodJournal,
  SpendingMoodChart,
} from '../components/mood';
import { WarrantyDashboard } from '../components/warranty';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  useAccounts,
  useBills,
  useBudgets,
  useCategories,
  useCoachAlerts,
  useDashboardData,
  useGoals,
  usePredictiveBalance,
  useRetirementPlanner,
  useRmdTracking,
  useSpendingPace,
  useTransactions,
} from '../hooks';
import { useTaxReserve } from '../hooks/useTaxReserve';
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
  MOOD_JOURNAL_CHANGED_EVENT,
  createMoodJournalEntry,
  deleteMoodJournalEntry,
  detectEmotionalSpendingPatterns,
  listMoodJournalEntries,
  summarizeSpendingForDate,
  updateMoodJournalEntry,
  type MoodJournalEntryInput,
  type MoodSpendingRecord,
} from '../lib/mood';
import { detectScamAlerts } from '../lib/notifications';
import type { SpendingPace } from '../lib/notifications';
import type { PredictionSummary } from '../lib/predictiveBalance';
import { getNextQuarterlyTaxDueDate } from '../lib/tax-reserve';
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

const ChartFallback = () => <LoadingSpinner size={24} label="Loading chart" />;

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

function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }

  return transaction.amount.amount;
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDueCountdown(days: number): string {
  if (days === 0) {
    return 'today';
  }

  return `in ${days} day${days === 1 ? '' : 's'}`;
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

function buildMoodSpendingRecords(
  transactions: readonly Transaction[],
  categoryNames: ReadonlyMap<string, string>,
): MoodSpendingRecord[] {
  return transactions.map((transaction) => ({
    date: transaction.date,
    amountCents: Math.abs(transaction.amount.amount),
    category:
      transaction.categoryId !== null
        ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
        : 'Uncategorized',
  }));
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
  const {
    analysis: coachAnalysis,
    topAlerts,
    loading: coachLoading,
    dismissAlert,
  } = useCoachAlerts();

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('30d');
  const [viewType, setViewType] = useState<ViewType>('line');
  const [moodJournalVersion, setMoodJournalVersion] = useState(0);
  const [editingMoodEntryId, setEditingMoodEntryId] = useState<string | null>(null);

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
  const {
    transactions: moodTransactions,
    loading: moodTransactionsLoading,
    error: moodTransactionsError,
    refresh: refreshMoodTransactions,
  } = useTransactions({ type: 'EXPENSE' });

  useEffect(() => {
    const handleMoodJournalChange = () => {
      setMoodJournalVersion((current) => current + 1);
    };

    window.addEventListener('storage', handleMoodJournalChange);
    window.addEventListener(MOOD_JOURNAL_CHANGED_EVENT, handleMoodJournalChange);

    return () => {
      window.removeEventListener('storage', handleMoodJournalChange);
      window.removeEventListener(MOOD_JOURNAL_CHANGED_EVENT, handleMoodJournalChange);
    };
  }, []);

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

  const taxReserveAsOf = useMemo(() => new Date(), []);
  const nextTaxDueDate = useMemo(
    () => getNextQuarterlyTaxDueDate(taxReserveAsOf),
    [taxReserveAsOf],
  );
  const taxQuarterFilters = useMemo(
    () => ({
      startDate: nextTaxDueDate.periodStart,
      endDate: nextTaxDueDate.periodEnd,
    }),
    [nextTaxDueDate],
  );
  const {
    transactions: taxQuarterTransactions,
    loading: taxQuarterTransactionsLoading,
    error: taxQuarterTransactionsError,
    refresh: refreshTaxQuarterTransactions,
  } = useTransactions(taxQuarterFilters);

  const scamAlertFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
    }),
    [],
  );
  const {
    transactions: scamAlertTransactions,
    loading: scamAlertTransactionsLoading,
    error: scamAlertTransactionsError,
    refresh: refreshScamAlertTransactions,
  } = useTransactions(scamAlertFilters);

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
  const filteredScamAlertTransactions = useMemo(
    () =>
      filterTransactionsByAccountPurpose(scamAlertTransactions, accounts, selectedPurposeFilter),
    [scamAlertTransactions, accounts, selectedPurposeFilter],
  );
  const scamAlerts = useMemo(
    () => detectScamAlerts(filteredScamAlertTransactions),
    [filteredScamAlertTransactions],
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
      plannedSavingsCents: getPlannedGoalContributionsCents(filteredGoals, taxReserveAsOf),
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
    taxReserveAsOf,
  ]);
  const taxReserveCurrency =
    taxQuarterTransactions[0]?.currency.code ??
    currentMonthTransactions[0]?.currency.code ??
    chartCurrency;
  const taxReserve = useTaxReserve({
    currentMonthTransactions,
    quarterTransactions: taxQuarterTransactions,
    accounts,
    asOf: taxReserveAsOf,
  });
  const taxReserveRatePercent = Math.round(taxReserve.summary.rate * 100);
  const taxReserveProgress =
    taxReserve.summary.quarterRecommendedCents > 0
      ? Math.min(
          100,
          Math.round(
            (taxReserve.summary.bucketBalanceCents / taxReserve.summary.quarterRecommendedCents) *
              100,
          ),
        )
      : taxReserve.summary.bucketBalanceCents > 0
        ? 100
        : 0;

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

  const moodSpendingRecords = useMemo(
    () => buildMoodSpendingRecords(moodTransactions, categoryNames),
    [moodTransactions, categoryNames],
  );
  const moodEntries = useMemo(
    () => listMoodJournalEntries(moodSpendingRecords),
    [moodJournalVersion, moodSpendingRecords],
  );
  const moodPatterns = useMemo(() => detectEmotionalSpendingPatterns(moodEntries), [moodEntries]);
  const todayDate = useMemo(() => formatLocalDate(new Date()), []);
  const todayEntry = useMemo(
    () => moodEntries.find((entry) => entry.date === todayDate) ?? null,
    [moodEntries, todayDate],
  );
  const editingMoodEntry = useMemo(
    () =>
      editingMoodEntryId !== null
        ? (moodEntries.find((entry) => entry.id === editingMoodEntryId) ?? null)
        : null,
    [editingMoodEntryId, moodEntries],
  );
  const activeMoodEntry = editingMoodEntry ?? (editingMoodEntryId === null ? todayEntry : null);
  const todaySpending = useMemo(
    () => summarizeSpendingForDate(moodSpendingRecords, todayDate),
    [moodSpendingRecords, todayDate],
  );

  const handlePeriodChange = useCallback((period: TimePeriod) => {
    setSelectedPeriod(period);
  }, []);

  const handleViewTypeChange = useCallback((type: ViewType) => {
    setViewType(type);
  }, []);

  const handleMoodEntrySave = useCallback(
    (input: MoodJournalEntryInput) => {
      const targetEntryId = editingMoodEntryId ?? todayEntry?.id ?? null;
      if (targetEntryId !== null) {
        updateMoodJournalEntry(targetEntryId, input, moodSpendingRecords);
      } else {
        createMoodJournalEntry(input, moodSpendingRecords);
      }
      setEditingMoodEntryId(null);
    },
    [editingMoodEntryId, moodSpendingRecords, todayEntry],
  );

  const handleMoodEntryDelete = useCallback(
    (entryId: string) => {
      if (!window.confirm('Delete this mood journal entry?')) {
        return;
      }

      deleteMoodJournalEntry(entryId);
      if (editingMoodEntryId === entryId) {
        setEditingMoodEntryId(null);
      }
    },
    [editingMoodEntryId],
  );

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
    scamAlertTransactionsLoading ||
    taxQuarterTransactionsLoading;
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
    scamAlertTransactionsError ??
    taxQuarterTransactionsError;
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
    refreshScamAlertTransactions();
    refreshTaxQuarterTransactions();
    refreshMoodTransactions();
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
            <SafeToSpendCard breakdown={safeToSpendBreakdown} currency={safeToSpendCurrency} />
          </section>
          <section className="page-section" aria-label="Financial summary">
            <div className="card-grid card-grid--4">
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
                    <CurrencyDisplay amount={debtSummary.balance} context="tracked debt balance" />
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
          <section className="page-section" aria-label="Things to check">
            <h3 className="page-section__title">Things to check</h3>
            <article className="card">
              {scamAlerts.length === 0 ? (
                <p className="list-item__secondary">Everything looks normal.</p>
              ) : (
                <ul
                  className="list-group"
                  role="list"
                  aria-label="Scam-focused unusual spending alerts"
                >
                  {scamAlerts.slice(0, 5).map((alert) => (
                    <li key={alert.id} className="list-item" role="listitem">
                      <div className="list-item__content">
                        <p className="list-item__primary">{alert.title}</p>
                        <p className="list-item__secondary">{alert.message}</p>
                        <p className="list-item__secondary">
                          <strong>NEXT STEP:</strong> {alert.nextStep}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
          <section className="page-section" aria-label="Tax reserve guidance">
            <article className="card">
              <div className="card__header">
                <h3 className="card__title">Tax Reserve</h3>
                <Link
                  to="/goals"
                  className="auth-footer__link"
                  aria-label="Manage tax reserve bucket"
                >
                  Manage bucket
                </Link>
              </div>
              <div className="card-grid card-grid--3">
                <div>
                  <p className="list-item__secondary">Bucket balance</p>
                  <p className="card__value">
                    <CurrencyDisplay
                      amount={taxReserve.summary.bucketBalanceCents}
                      currency={taxReserveCurrency}
                      context="tax reserve bucket balance"
                    />
                  </p>
                </div>
                <div>
                  <p className="list-item__secondary">Recommended for this quarter</p>
                  <p className="card__value">
                    <CurrencyDisplay
                      amount={taxReserve.summary.quarterRecommendedCents}
                      currency={taxReserveCurrency}
                      context="recommended quarterly tax reserve"
                    />
                  </p>
                </div>
                <div>
                  <p className="list-item__secondary">Recommended payment</p>
                  <p className="card__value">
                    <CurrencyDisplay
                      amount={taxReserve.summary.recommendedPaymentCents}
                      currency={taxReserveCurrency}
                      context="recommended estimated tax payment"
                    />
                  </p>
                </div>
              </div>
              <div
                className="progress-bar"
                role="progressbar"
                aria-valuenow={taxReserveProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Tax reserve bucket is ${taxReserveProgress} percent funded`}
                style={{ marginTop: 'var(--spacing-4)' }}
              >
                <div
                  className={`progress-bar__fill progress-bar__fill--${
                    taxReserveProgress >= 100
                      ? 'positive'
                      : taxReserveProgress >= 50
                        ? 'warning'
                        : 'negative'
                  }`}
                  style={{ width: `${taxReserveProgress}%` }}
                />
              </div>
              <p style={{ marginTop: 'var(--spacing-3)' }}>
                You earned{' '}
                <CurrencyDisplay
                  amount={taxReserve.summary.currentMonthNetIncomeCents}
                  currency={taxReserveCurrency}
                  context="current month taxable income"
                />{' '}
                this month — set aside{' '}
                <CurrencyDisplay
                  amount={taxReserve.summary.currentMonthRecommendedCents}
                  currency={taxReserveCurrency}
                  context="current month recommended tax reserve"
                />{' '}
                ({taxReserveRatePercent}%).
              </p>
              <p className="list-item__secondary">
                Quarterly estimate due {formatDueCountdown(taxReserve.summary.daysUntilDue)} on{' '}
                {formatDueDate(taxReserve.summary.nextDueDate.dueDate)}. Based on income so far, set
                aside ~
                <CurrencyDisplay
                  amount={taxReserve.summary.quarterRecommendedCents}
                  currency={taxReserveCurrency}
                  context="quarterly tax reserve"
                />
                .
              </p>
            </article>
          </section>
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
              <section className="page-section" aria-label="Financial coach">
                <CoachCard alerts={topAlerts} loading={coachLoading} onDismiss={dismissAlert} />
              </section>
              <section className="page-section" aria-label="Coach insights">
                <CoachPanel analysis={coachAnalysis} loading={coachLoading} />
              </section>
            </>
          )}

          <WarrantyDashboard />

          <section className="page-section mood-section" aria-label="Mood and spending journal">
            <div className="page-section__header">
              <div>
                <h3 className="page-section__title">Emotional Spending Journal</h3>
                <p className="mood-section__intro">
                  Local-first mood check-ins that connect your emotional state to same-day spending.
                </p>
              </div>
            </div>
            {moodTransactionsLoading ? (
              <LoadingSpinner label="Loading mood journal" />
            ) : moodTransactionsError ? (
              <ErrorBanner message={moodTransactionsError} onRetry={refreshMoodTransactions} />
            ) : (
              <div className="mood-section__grid">
                <div className="card">
                  <MoodEntry
                    initialEntry={activeMoodEntry}
                    todaySpendingCents={todaySpending.totalCents}
                    onSave={handleMoodEntrySave}
                    onCancel={
                      editingMoodEntryId !== null ? () => setEditingMoodEntryId(null) : undefined
                    }
                    isEditing={editingMoodEntryId !== null}
                  />
                </div>
                <div className="card">
                  <MoodCalendar entries={moodEntries} />
                </div>
                <div className="card mood-section__wide">
                  <SpendingMoodChart entries={moodEntries} currency={chartCurrency} />
                </div>
                <div className="card">
                  <EmotionalPatterns patterns={moodPatterns} />
                </div>
                <div className="card">
                  <MoodJournal
                    entries={moodEntries}
                    activeEntryId={editingMoodEntryId}
                    onEdit={setEditingMoodEntryId}
                    onDelete={handleMoodEntryDelete}
                  />
                </div>
              </div>
            )}
          </section>

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
      <CustomizePanel
        isOpen={widgetLayout.isCustomizing}
        widgets={widgetLayout.widgets}
        onToggle={widgetLayout.toggleWidget}
        onMove={widgetLayout.moveWidget}
        onReset={widgetLayout.resetLayout}
        onClose={widgetLayout.stopCustomizing}
      />
      <QueryEngine />
    </>
  );
};

export default DashboardPage;
