// SPDX-License-Identifier: BUSL-1.1

import type { SavingsNudge, SavingsNudgeContext } from './types';

function formatCurrency(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function generateSavingsNudges(context: SavingsNudgeContext): SavingsNudge[] {
  const nudges: SavingsNudge[] = [];
  const weeklySavingsDropCents =
    context.previousWeeklySavingsCents - context.currentWeeklySavingsCents;
  const discretionarySuggestion = context.suggestions.find(
    (suggestion) => suggestion.type === 'discretionary-savings',
  );
  const retirementSuggestion = context.suggestions.find(
    (suggestion) => suggestion.type === 'retirement',
  );
  const debtSuggestion = context.suggestions.find(
    (suggestion) => suggestion.type === 'debt-payoff',
  );
  const momentumSuggestion = context.suggestions.find(
    (suggestion) => suggestion.type === 'big-purchase' || suggestion.type === 'emergency-fund',
  );

  if (weeklySavingsDropCents >= 5_000 && context.topDiscretionaryCategory !== null) {
    nudges.push({
      id: 'savings-drop',
      type: 'spending-drift',
      tone: 'warning',
      title: 'Savings slowed this week',
      message: `You saved ${formatCurrency(weeklySavingsDropCents, context.currencyCode)} less this week — redirect from ${context.topDiscretionaryCategory.categoryName.toLowerCase()}?`,
      actionLabel: 'Review category',
      linkedSuggestionId: discretionarySuggestion?.id ?? null,
    });
  }

  if (discretionarySuggestion !== undefined && context.topDiscretionaryCategory !== null) {
    nudges.push({
      id: 'redirect-opportunity',
      type: 'redirect-opportunity',
      tone: 'info',
      title: 'Easy redirect opportunity',
      message: `${context.topDiscretionaryCategory.categoryName} looks reducible right now. Moving even a small slice can fund an extra savings transfer.`,
      actionLabel: 'Try the redirect',
      linkedSuggestionId: discretionarySuggestion.id,
    });
  }

  if (retirementSuggestion !== undefined) {
    nudges.push({
      id: 'retirement-gap',
      type: 'retirement-gap',
      tone: 'info',
      title: 'Retirement can auto-pilot here',
      message: `Your recent cash flow supports about ${formatCurrency(retirementSuggestion.contributionPlan.recommendedMonthlyContributionCents, context.currencyCode)} per month toward retirement.`,
      actionLabel: 'Review plan',
      linkedSuggestionId: retirementSuggestion.id,
    });
  }

  if (debtSuggestion !== undefined && context.monthlySurplusCents > 0) {
    nudges.push({
      id: 'debt-push',
      type: 'debt-push',
      tone: 'success',
      title: 'Use your surplus strategically',
      message: `Half of your recent monthly surplus could become a steady extra debt payment and shorten payoff time.`,
      actionLabel: 'Apply extra payment',
      linkedSuggestionId: debtSuggestion.id,
    });
  }

  if (momentumSuggestion !== undefined && momentumSuggestion.contributionPlan.estimatedMonths > 0) {
    nudges.push({
      id: 'goal-momentum',
      type: 'goal-momentum',
      tone: 'success',
      title: 'Momentum is your advantage',
      message: `Sticking with ${formatCurrency(momentumSuggestion.contributionPlan.recommendedMonthlyContributionCents, context.currencyCode)} per month keeps ${momentumSuggestion.title.toLowerCase()} moving on schedule.`,
      actionLabel: 'Keep the pace',
      linkedSuggestionId: momentumSuggestion.id,
    });
  }

  return nudges.slice(0, 3);
}
