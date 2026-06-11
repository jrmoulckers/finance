// SPDX-License-Identifier: BUSL-1.1

import type { BudgetWithSpending } from '../../db/repositories/budgets';
import type { Transaction } from '../../kmp/bridge';
import { detectSubscriptions } from '../analytics/subscriptions';
import { calculateHealthScore, isLiquidAccountType } from '../insights/healthScore';
import { toLocalDate } from '../insights/helpers';
import { analyzeSavingsRate } from '../insights/savingsRate';
import { analyzeSpendingByCategory } from '../insights/spendingAnalysis';
import { calculateEmergencyRunway } from '../savings/emergency-runway';
import { RECOMMENDATION_RULES } from './rules';
import { scoreRecommendation } from './scorer';
import type {
  BudgetPressure,
  PreparedRecommendationContext,
  RecommendationCandidate,
  RecommendationEngineInput,
  RecommendationEngineOptions,
  RecommendationEngineResult,
} from './types';

const DEFAULT_MAX_RECOMMENDATIONS = 6;

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function daysInCurrentMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

function getProjectedMonthlyExpenses(currentMonthExpenses: number, now: Date): number {
  if (currentMonthExpenses <= 0) {
    return 0;
  }

  return Math.round((currentMonthExpenses / Math.max(now.getDate(), 1)) * daysInCurrentMonth(now));
}

function getAverageTrailingMonthlyExpenses(
  transactions: readonly Transaction[],
  now: Date,
): number {
  const currentMonth = monthKey(toLocalDate(now));
  const monthlyExpenses = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'EXPENSE') {
      continue;
    }

    const key = monthKey(transaction.date);
    if (key === currentMonth) {
      continue;
    }

    monthlyExpenses.set(key, (monthlyExpenses.get(key) ?? 0) + Math.abs(transaction.amount.amount));
  }

  const trailingMonths = Array.from(monthlyExpenses.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 3)
    .map(([, amount]) => amount);

  if (trailingMonths.length === 0) {
    return 0;
  }

  return Math.round(
    trailingMonths.reduce((sum, amount) => sum + amount, 0) / trailingMonths.length,
  );
}

function getAnnualizedIncome(currentMonthIncome: number, now: Date): number {
  if (currentMonthIncome <= 0) {
    return 0;
  }

  const projectedMonthlyIncome = Math.round(
    (currentMonthIncome / Math.max(now.getDate(), 1)) * daysInCurrentMonth(now),
  );
  return projectedMonthlyIncome * 12;
}

function isBudgetActiveToday(budget: BudgetWithSpending, today: string): boolean {
  if (budget.startDate > today) {
    return false;
  }

  if (budget.endDate !== null && budget.endDate < today) {
    return false;
  }

  return true;
}

function buildBudgetPressures(
  activeBudgets: readonly BudgetWithSpending[],
): readonly BudgetPressure[] {
  return activeBudgets
    .map((budget) => ({
      budget,
      usagePercent:
        budget.amount.amount > 0
          ? Math.round((budget.spentAmount.amount / budget.amount.amount) * 100)
          : 0,
      overspentCents: Math.max(budget.spentAmount.amount - budget.amount.amount, 0),
    }))
    .sort((left, right) => {
      if (right.usagePercent !== left.usagePercent) {
        return right.usagePercent - left.usagePercent;
      }

      return right.overspentCents - left.overspentCents;
    });
}

function buildPreparedContext(input: RecommendationEngineInput): PreparedRecommendationContext {
  const now = input.now ?? new Date();
  const today = toLocalDate(now);
  const currencyCode =
    input.accounts[0]?.currency.code ??
    input.transactions[0]?.currency.code ??
    input.goals[0]?.currency.code ??
    'USD';

  const savingsRate = analyzeSavingsRate(input.transactions, 'monthly', now);
  const currentMonthIncome = savingsRate.currentIncome;
  const currentMonthExpenses = savingsRate.currentSpending;
  const currentMonthSavings = currentMonthIncome - currentMonthExpenses;
  const projectedMonthlyExpenses =
    getProjectedMonthlyExpenses(currentMonthExpenses, now) ||
    getAverageTrailingMonthlyExpenses(input.transactions, now);
  const spending = analyzeSpendingByCategory(input.transactions, input.categories, now);

  const activeBudgets = input.budgets.filter((budget) => isBudgetActiveToday(budget, today));
  const budgetPressures = buildBudgetPressures(activeBudgets);
  const onTrackBudgetRatio =
    activeBudgets.length > 0
      ? activeBudgets.filter((budget) => budget.spentAmount.amount <= budget.amount.amount).length /
        activeBudgets.length
      : 0;

  const liquidFundsCents = input.accounts.reduce((sum, account) => {
    if (
      account.isArchived ||
      account.currentBalance.amount <= 0 ||
      !isLiquidAccountType(account.type)
    ) {
      return sum;
    }

    return sum + account.currentBalance.amount;
  }, 0);

  const debtBalance = input.accounts.reduce((sum, account) => {
    if (account.isArchived || (account.type !== 'CREDIT_CARD' && account.type !== 'LOAN')) {
      return sum;
    }

    return sum + Math.abs(account.currentBalance.amount);
  }, 0);

  const annualizedIncome = getAnnualizedIncome(currentMonthIncome, now);
  const healthScore = calculateHealthScore({
    savingsRate: savingsRate.currentRate,
    onTrackBudgetRatio,
    monthlyExpenses: projectedMonthlyExpenses,
    emergencyFundBalance: liquidFundsCents,
    debtBalance,
    annualizedIncome,
  });

  const emergencyRunway = calculateEmergencyRunway({
    emergencyFundCents: liquidFundsCents,
    monthlyExpensesCents: projectedMonthlyExpenses,
    essentialExpensesCents: Math.round(projectedMonthlyExpenses * 0.7),
    monthlySavingsRateCents: Math.max(currentMonthSavings, 0),
  });

  const subscriptions =
    input.subscriptions ?? detectSubscriptions([...input.transactions], [...input.categories]);

  return {
    ...input,
    now,
    currencyCode,
    activeBudgets,
    budgetPressures,
    currentMonthIncome,
    currentMonthExpenses,
    currentMonthSavings,
    projectedMonthlyExpenses,
    liquidFundsCents,
    spending,
    savingsRate,
    healthScore,
    emergencyRunway,
    subscriptions,
  };
}

function buildFallbackRecommendation(
  context: PreparedRecommendationContext,
): RecommendationCandidate {
  return {
    recommendation: {
      id: 'steady-progress',
      title: 'Your finances look steady right now',
      summary:
        'Keep logging transactions and budgets to surface sharper recommendations as patterns evolve.',
      explanation:
        'The engine did not find a high-urgency action today, which usually means your current month is tracking within a healthy range.',
      category: 'savings',
      priority: 'low',
      currencyCode: context.currencyCode,
      icon: 'sparkles',
      tags: ['stable', 'keep tracking'],
      actionLabel: 'Explore insights',
      actionHref: '/insights',
      actionSteps: [
        {
          title: 'Keep categories clean',
          description:
            'The more accurately transactions are categorized, the more specific future recommendations become.',
          href: '/transactions',
        },
      ],
      evidence: [`Health score: ${context.healthScore.score}`],
      impact: undefined,
    },
    signal: {
      urgency: 0.1,
      confidence: 0.7,
      specificity: 0.4,
    },
  };
}

function buildSummary(
  recommendations: readonly ReturnType<typeof scoreAndShapeRecommendation>[],
  now: Date,
): RecommendationEngineResult['summary'] {
  return {
    totalCount: recommendations.length,
    criticalCount: recommendations.filter(
      (recommendation) => recommendation.priority === 'critical',
    ).length,
    highCount: recommendations.filter((recommendation) => recommendation.priority === 'high')
      .length,
    estimatedMonthlySavingsCents: recommendations.reduce(
      (sum, recommendation) => sum + (recommendation.impact?.monthlySavingsCents ?? 0),
      0,
    ),
    lastAnalyzedAt: now.toISOString(),
  };
}

function scoreAndShapeRecommendation(candidate: RecommendationCandidate) {
  return {
    ...candidate.recommendation,
    score: scoreRecommendation(candidate),
  };
}

export function generateRecommendations(
  input: RecommendationEngineInput,
  options: RecommendationEngineOptions = {},
): RecommendationEngineResult {
  const context = buildPreparedContext(input);
  const maxRecommendations = options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS;

  const candidates = RECOMMENDATION_RULES.flatMap((rule) => rule(context));
  const scoredRecommendations = (
    candidates.length > 0 ? candidates : [buildFallbackRecommendation(context)]
  )
    .map(scoreAndShapeRecommendation)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, maxRecommendations);

  return {
    recommendations: scoredRecommendations,
    summary: buildSummary(scoredRecommendations, context.now),
  };
}
