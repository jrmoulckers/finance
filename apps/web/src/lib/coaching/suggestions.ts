// SPDX-License-Identifier: BUSL-1.1

import type { CoachSeverity, CoachSuggestion, SuggestionInput } from './types';

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function severityRank(severity: CoachSeverity): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

export function generateCoachSuggestions({
  velocities,
  cashFlow,
  anomalies,
}: SuggestionInput): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = [];
  const highestRiskBudget = velocities.find((velocity) => velocity.isOverspendRisk);
  const highestSpike = anomalies[0];
  const largestRecurringExpense = cashFlow.recurringItems.find((item) => item.type === 'EXPENSE');

  if (cashFlow.willOverdraft) {
    suggestions.push({
      id: 'suggestion:cash-buffer',
      severity: 'critical',
      title: 'Protect your cash buffer before month-end',
      description: `You are projected to finish the month at ${formatCents(cashFlow.projectedEndBalanceCents)}. Trim at least ${formatCents(Math.abs(cashFlow.projectedEndBalanceCents))} from discretionary spending or move cash before the next major bill.`,
      actionLabel: 'Open cash flow',
      actionRoute: '/cash-flow',
    });
  }

  if (highestRiskBudget) {
    suggestions.push({
      id: `suggestion:budget:${highestRiskBudget.budgetId}`,
      severity: 'warning',
      title: `Slow ${highestRiskBudget.categoryName} spending pace`,
      description:
        highestRiskBudget.daysRemaining > 0
          ? `${highestRiskBudget.budgetName} is tracking toward ${formatCents(highestRiskBudget.projectedSpendCents)} for the month. Aim to keep the next ${highestRiskBudget.daysRemaining} day${highestRiskBudget.daysRemaining === 1 ? '' : 's'} near ${formatCents(highestRiskBudget.recommendedDailySpendCents)} per day.`
          : `${highestRiskBudget.budgetName} is already above its monthly pace. Review recent transactions and decide whether to pause or rebalance spending.`,
      actionLabel: 'Review budgets',
      actionRoute: '/budgets',
    });
  }

  if (highestSpike) {
    suggestions.push({
      id: `suggestion:anomaly:${highestSpike.categoryId}`,
      severity: 'info',
      title: `Review today's ${highestSpike.categoryName} spike`,
      description: `Today's ${highestSpike.categoryName} spending reached ${formatCents(highestSpike.todaySpendCents)}, about ${highestSpike.ratio.toFixed(1)}× your typical day for that category. If it is expected, adjust the budget. If not, double-check the transaction details.`,
      actionLabel: 'View transactions',
      actionRoute: '/transactions',
    });
  }

  if (!cashFlow.willOverdraft && largestRecurringExpense) {
    suggestions.push({
      id: `suggestion:recurring:${largestRecurringExpense.id}`,
      severity: 'info',
      title: `Plan around upcoming ${largestRecurringExpense.label}`,
      description: `${largestRecurringExpense.label} is expected ${largestRecurringExpense.occurrencesRemaining} more time${largestRecurringExpense.occurrencesRemaining === 1 ? '' : 's'} this month for about ${formatCents(largestRecurringExpense.projectedAmountCents)} in total. Keeping that amount reserved will make the rest of your forecast steadier.`,
      actionLabel: 'Review transactions',
      actionRoute: '/transactions',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'suggestion:on-track',
      severity: 'info',
      title: 'You are on track this month',
      description:
        'Budgets, cash flow, and daily spending look steady right now. Keep checking back as new transactions arrive.',
      actionLabel: 'Review dashboard',
      actionRoute: '/dashboard',
    });
  }

  return suggestions.sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  );
}
