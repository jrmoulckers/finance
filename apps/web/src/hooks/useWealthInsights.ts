// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useMemo, useState } from 'react';
import type { BudgetWithSpending } from '../db/repositories/budgets';
import type { Account, Goal } from '../kmp/bridge';
import {
  analyzeSavingsRate,
  analyzeSpendingByCategory,
  calculateHealthScore,
  calculateNetWorthTrend,
  generatePersonalizedInsights,
  isLiquidAccountType,
  type DigestPeriod,
  type GoalProgressUpdate,
  type WealthDigest,
} from '../lib/insights';
import { buildAlignmentSpendingSnapshot } from '../lib/alignment';
import { toLocalDate } from '../lib/insights/helpers';
import {
  analyzeMoodSpendingCorrelation,
  calculateAnxietyScore,
  identifyStressIndicators,
  type FinancialWellnessSnapshot,
} from '../lib/wellness';
import { useAccounts } from './useAccounts';
import { useBills } from './useBills';
import { useBudgets } from './useBudgets';
import { useCategories } from './useCategories';
import { useGoals } from './useGoals';
import { useTransactions } from './useTransactions';

export interface UseWealthInsightsResult {
  digest: WealthDigest | null;
  digests: Partial<Record<DigestPeriod, WealthDigest>>;
  wellness: FinancialWellnessSnapshot | null;
  activePeriod: DigestPeriod;
  setActivePeriod: (period: DigestPeriod) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

type GoalPace = GoalProgressUpdate['pace'];

const GOAL_PACE_PRIORITY: Record<GoalPace, number> = {
  ahead: 0,
  'on-track': 1,
  'needs-attention': 2,
  completed: 3,
};

function isBudgetActiveToday(budget: BudgetWithSpending, today: string): boolean {
  if (budget.startDate > today) {
    return false;
  }

  if (budget.endDate !== null && budget.endDate < today) {
    return false;
  }

  return true;
}

function getProjectedMonthlyExpenses(currentMonthSpending: number, now: Date): number {
  const dayOfMonth = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round((currentMonthSpending / dayOfMonth) * daysInMonth);
}

function getAnnualizedIncome(currentMonthIncome: number, now: Date): number {
  const dayOfMonth = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthlyIncome = Math.round((currentMonthIncome / dayOfMonth) * daysInMonth);
  return projectedMonthlyIncome * 12;
}

function buildGoalProgressUpdates(
  goals: readonly Goal[],
  monthlySavingsCapacity: number,
  now: Date,
): GoalProgressUpdate[] {
  return goals
    .filter((goal) => goal.status !== 'CANCELLED')
    .map((goal): GoalProgressUpdate => {
      const targetAmount = Math.max(goal.targetAmount.amount, 0);
      const currentAmount = Math.max(goal.currentAmount.amount, 0);
      const remainingAmount = Math.max(targetAmount - currentAmount, 0);
      const progressPercent =
        targetAmount > 0 ? Math.min(Math.round((currentAmount / targetAmount) * 100), 100) : 0;

      if (goal.status === 'COMPLETED' || remainingAmount === 0) {
        return {
          id: goal.id,
          name: goal.name,
          status: goal.status,
          progressPercent: 100,
          targetAmount,
          currentAmount,
          remainingAmount: 0,
          targetDate: goal.targetDate,
          pace: 'completed',
          monthlyContributionNeeded: 0,
        };
      }

      let pace: GoalPace = 'on-track';
      let monthlyContributionNeeded: number | null = null;

      if (goal.targetDate) {
        const startDate = new Date(goal.createdAt);
        const targetDate = new Date(`${goal.targetDate}T00:00:00`);
        const totalDuration = Math.max(targetDate.getTime() - startDate.getTime(), 1);
        const elapsedDuration = Math.min(
          Math.max(now.getTime() - startDate.getTime(), 0),
          totalDuration,
        );
        const expectedProgress = (elapsedDuration / totalDuration) * 100;

        if (progressPercent >= expectedProgress + 10) {
          pace = 'ahead';
        } else if (progressPercent < expectedProgress - 10) {
          pace = 'needs-attention';
        }

        const monthsRemaining = Math.max(
          1,
          Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
        );
        if (targetDate.getTime() > now.getTime() && remainingAmount > 0) {
          monthlyContributionNeeded = Math.ceil(remainingAmount / monthsRemaining);
          if (monthlySavingsCapacity > 0 && monthlyContributionNeeded > monthlySavingsCapacity) {
            pace = 'needs-attention';
          }
        }
      } else if (progressPercent < 25) {
        pace = 'needs-attention';
      }

      return {
        id: goal.id,
        name: goal.name,
        status: goal.status,
        progressPercent,
        targetAmount,
        currentAmount,
        remainingAmount,
        targetDate: goal.targetDate,
        pace,
        monthlyContributionNeeded,
      };
    })
    .sort((left, right) => {
      const leftDate = left.targetDate ?? '9999-12-31';
      const rightDate = right.targetDate ?? '9999-12-31';

      if (GOAL_PACE_PRIORITY[left.pace] !== GOAL_PACE_PRIORITY[right.pace]) {
        return GOAL_PACE_PRIORITY[left.pace] - GOAL_PACE_PRIORITY[right.pace];
      }

      return leftDate.localeCompare(rightDate);
    });
}

function getCurrencyCode(accounts: readonly Account[], goals: readonly Goal[]): string {
  return accounts[0]?.currency.code ?? goals[0]?.currency.code ?? 'USD';
}

function buildDigest(
  period: DigestPeriod,
  currencyCode: string,
  netWorth: WealthDigest['netWorth'],
  spending: WealthDigest['spending'],
  savingsRate: WealthDigest['savingsRate'],
  goals: readonly GoalProgressUpdate[],
  healthScore: WealthDigest['healthScore'],
  alignmentSnapshot: WealthDigest['alignmentSnapshot'],
  generatedAt: string,
): WealthDigest {
  const digest: WealthDigest = {
    period,
    currencyCode,
    generatedAt,
    netWorth,
    spending,
    savingsRate,
    goals,
    healthScore,
    alignmentSnapshot,
    highlights: [],
  };

  return {
    ...digest,
    highlights: generatePersonalizedInsights(digest),
  };
}

export function useWealthInsights(initialPeriod: DigestPeriod = 'weekly'): UseWealthInsightsResult {
  const [activePeriod, setActivePeriod] = useState<DigestPeriod>(initialPeriod);

  const accountsState = useAccounts();
  const transactionsState = useTransactions();
  const billsState = useBills();
  const budgetsState = useBudgets();
  const goalsState = useGoals();
  const categoriesState = useCategories();

  const loading =
    accountsState.loading ||
    transactionsState.loading ||
    billsState.loading ||
    budgetsState.loading ||
    goalsState.loading ||
    categoriesState.loading;
  const error =
    accountsState.error ||
    transactionsState.error ||
    billsState.error ||
    budgetsState.error ||
    goalsState.error ||
    categoriesState.error;

  const refresh = useCallback(() => {
    accountsState.refresh();
    transactionsState.refresh();
    billsState.refresh();
    budgetsState.refresh();
    goalsState.refresh();
    categoriesState.refresh();
  }, [accountsState, billsState, budgetsState, categoriesState, goalsState, transactionsState]);

  const wellness = useMemo<FinancialWellnessSnapshot | null>(() => {
    if (loading || error) {
      return null;
    }

    if (
      accountsState.accounts.length === 0 &&
      transactionsState.transactions.length === 0 &&
      billsState.bills.length === 0
    ) {
      return null;
    }

    const now = new Date();
    const currencyCode = getCurrencyCode(accountsState.accounts, goalsState.goals);

    return {
      currencyCode,
      generatedAt: now.toISOString(),
      anxietyScore: calculateAnxietyScore({
        accounts: accountsState.accounts,
        transactions: transactionsState.transactions,
        bills: billsState.bills,
        now,
      }),
      moodCorrelation: analyzeMoodSpendingCorrelation({
        transactions: transactionsState.transactions,
      }),
      stressIndicators: identifyStressIndicators({
        accounts: accountsState.accounts,
        transactions: transactionsState.transactions,
        bills: billsState.bills,
        now,
      }),
    };
  }, [
    accountsState.accounts,
    billsState.bills,
    error,
    goalsState.goals,
    loading,
    transactionsState.transactions,
  ]);

  const digests = useMemo<Partial<Record<DigestPeriod, WealthDigest>>>(() => {
    if (loading || error) {
      return {};
    }

    const now = new Date();
    const currencyCode = getCurrencyCode(accountsState.accounts, goalsState.goals);
    const monthlySpending = analyzeSpendingByCategory(
      transactionsState.transactions,
      categoriesState.categories,
      now,
    );
    const weeklySavingsRate = analyzeSavingsRate(transactionsState.transactions, 'weekly', now);
    const monthlySavingsRate = analyzeSavingsRate(transactionsState.transactions, 'monthly', now);
    const weeklyNetWorth = calculateNetWorthTrend(
      accountsState.accounts,
      transactionsState.transactions,
      'weekly',
      now,
    );
    const monthlyNetWorth = calculateNetWorthTrend(
      accountsState.accounts,
      transactionsState.transactions,
      'monthly',
      now,
    );

    const activeBudgets = budgetsState.budgets.filter((budget) =>
      isBudgetActiveToday(budget, toLocalDate(now)),
    );
    const onTrackBudgetRatio =
      activeBudgets.length > 0
        ? activeBudgets.filter((budget) => budget.spentAmount.amount <= budget.amount.amount)
            .length / activeBudgets.length
        : 0;

    const emergencyFundBalance = accountsState.accounts.reduce((sum, account) => {
      if (
        account.isArchived ||
        account.currentBalance.amount <= 0 ||
        !isLiquidAccountType(account.type)
      ) {
        return sum;
      }

      return sum + account.currentBalance.amount;
    }, 0);
    const debtBalance = accountsState.accounts.reduce((sum, account) => {
      if (account.isArchived || (account.type !== 'CREDIT_CARD' && account.type !== 'LOAN')) {
        return sum;
      }

      return sum + Math.abs(account.currentBalance.amount);
    }, 0);

    const projectedMonthlyExpenses = getProjectedMonthlyExpenses(
      monthlySpending.totalCurrentSpending,
      now,
    );
    const annualizedIncome = getAnnualizedIncome(monthlySavingsRate.currentIncome, now);
    const healthScore = calculateHealthScore({
      savingsRate: monthlySavingsRate.currentRate,
      onTrackBudgetRatio,
      monthlyExpenses: projectedMonthlyExpenses,
      emergencyFundBalance,
      debtBalance,
      annualizedIncome,
    });

    const alignmentSnapshot = buildAlignmentSpendingSnapshot(
      transactionsState.transactions,
      categoriesState.categories,
      Math.max(monthlySavingsRate.currentSavings, 0),
      now,
    );
    const goalUpdates = buildGoalProgressUpdates(
      goalsState.goals,
      Math.max(monthlySavingsRate.currentSavings, 0),
      now,
    );
    const generatedAt = now.toISOString();

    return {
      weekly: buildDigest(
        'weekly',
        currencyCode,
        weeklyNetWorth,
        monthlySpending,
        weeklySavingsRate,
        goalUpdates,
        healthScore,
        alignmentSnapshot,
        generatedAt,
      ),
      monthly: buildDigest(
        'monthly',
        currencyCode,
        monthlyNetWorth,
        monthlySpending,
        monthlySavingsRate,
        goalUpdates,
        healthScore,
        alignmentSnapshot,
        generatedAt,
      ),
    };
  }, [
    accountsState.accounts,
    billsState.bills,
    budgetsState.budgets,
    categoriesState.categories,
    error,
    goalsState.goals,
    loading,
    transactionsState.transactions,
  ]);

  return {
    digest: digests[activePeriod] ?? null,
    digests,
    wellness,
    activePeriod,
    setActivePeriod,
    loading,
    error,
    refresh,
  };
}
