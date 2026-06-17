// SPDX-License-Identifier: BUSL-1.1

import type { SubscriptionCadence } from '../analytics/subscriptions';
import type {
  PreparedRecommendationContext,
  RecommendationCandidate,
  RecommendationPriority,
  RecommendationRule,
} from './types';

const LOW_SAVINGS_TARGET_RATE = 15;
const BUDGET_WARNING_THRESHOLD = 85;
const CATEGORY_SPIKE_THRESHOLD = 25;
const CATEGORY_SHARE_THRESHOLD = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatMoney(amountCents: number, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function daysSince(date: string, now: Date): number {
  const parsed = new Date(`${date}T00:00:00`);
  return Math.floor((now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24));
}

function inactivityThreshold(cadence: SubscriptionCadence): number {
  switch (cadence) {
    case 'weekly':
      return 14;
    case 'monthly':
      return 30;
    case 'annual':
      return 395;
    case 'other':
    default:
      return 45;
  }
}

function buildCandidate(candidate: RecommendationCandidate): readonly RecommendationCandidate[] {
  return [candidate];
}

function buildCashFlowRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  if (
    context.currentMonthIncome <= 0 ||
    context.currentMonthExpenses <= context.currentMonthIncome
  ) {
    return [];
  }

  const overspendCents = context.currentMonthExpenses - context.currentMonthIncome;
  const topCategory = context.spending.topCategories[0];

  return buildCandidate({
    recommendation: {
      id: 'cash-flow-reset',
      title: "This month's cash flow is negative",
      summary: `Expenses are running ${formatMoney(overspendCents, context.currencyCode)} ahead of income month-to-date.`,
      explanation: topCategory
        ? `${topCategory.categoryName} is currently your largest expense category. Pulling a few discretionary purchases forward into next month can restore breathing room quickly.`
        : 'A short pause on non-essential spending can help you finish the month with positive cash flow.',
      category: 'cash-flow',
      priority: overspendCents >= context.currentMonthIncome * 0.1 ? 'critical' : 'high',
      currencyCode: context.currencyCode,
      icon: 'trending-down',
      tags: ['month-to-date', 'cash flow'],
      actionLabel: 'Review transactions',
      actionHref: '/transactions',
      actionSteps: [
        {
          title: 'Pause discretionary purchases',
          description:
            'Hold non-essential spending until income catches up with your current pace.',
          href: '/transactions',
        },
        {
          title: 'Review the biggest charges',
          description:
            'Sort this month by amount and look for purchases you can defer or replace with lower-cost options.',
          href: '/transactions',
        },
      ],
      evidence: [
        `Income so far: ${formatMoney(context.currentMonthIncome, context.currencyCode)}`,
        `Expenses so far: ${formatMoney(context.currentMonthExpenses, context.currencyCode)}`,
      ],
      impact: {
        monthlySavingsCents: overspendCents,
        annualSavingsCents: overspendCents * 12,
      },
    },
    signal: {
      urgency: clamp(overspendCents / Math.max(context.currentMonthIncome, 1), 0, 1),
      confidence: 0.94,
      specificity: 0.88,
      monthlySavingsCents: overspendCents,
    },
  });
}

function buildBudgetRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  const pressure = context.budgetPressures[0];
  if (!pressure || pressure.usagePercent < BUDGET_WARNING_THRESHOLD) {
    return [];
  }

  const totalDays = new Date(context.now.getFullYear(), context.now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(totalDays - context.now.getDate(), 0);
  const remainingSpendCents = Math.max(pressure.budget.remainingAmount.amount, 0);
  const priority: RecommendationPriority = pressure.overspentCents > 0 ? 'high' : 'medium';

  return buildCandidate({
    recommendation: {
      id: `budget-${pressure.budget.id}`,
      title:
        pressure.overspentCents > 0
          ? `${pressure.budget.name} is already over budget`
          : `${pressure.budget.name} is close to the limit`,
      summary:
        pressure.overspentCents > 0
          ? `You are ${formatMoney(pressure.overspentCents, context.currencyCode)} over with ${daysRemaining} ${pluralize(daysRemaining, 'day')} left this month.`
          : `You have used ${formatPercent(pressure.usagePercent)} of this budget with ${daysRemaining} ${pluralize(daysRemaining, 'day')} left.`,
      explanation:
        pressure.overspentCents > 0
          ? `Only ${formatMoney(remainingSpendCents, context.currencyCode)} remains in the plan for ${pressure.budget.name}, so every new charge in this category widens the gap.`
          : `A few smaller purchases can still push ${pressure.budget.name} over plan before month-end, so it is a good category to watch closely right now.`,
      category: 'budget',
      priority,
      currencyCode: context.currencyCode,
      icon: 'calendar',
      tags: ['budget pace', pressure.budget.name],
      actionLabel: 'Open budgets',
      actionHref: '/budgets',
      actionSteps: [
        {
          title: 'Check upcoming purchases',
          description:
            'Look at planned spending in this category and decide what can wait until next month.',
          href: '/budgets',
        },
        {
          title: 'Move spending to a cheaper alternative',
          description:
            'Choose a lower-cost option for the next few purchases to stay closer to plan.',
          href: '/transactions',
        },
      ],
      evidence: [
        `Budgeted: ${formatMoney(pressure.budget.amount.amount, context.currencyCode)}`,
        `Spent: ${formatMoney(pressure.budget.spentAmount.amount, context.currencyCode)}`,
      ],
      impact: {
        monthlySavingsCents: Math.max(pressure.overspentCents, 0),
      },
    },
    signal: {
      urgency: clamp(pressure.usagePercent / 120, 0, 1),
      confidence: 0.92,
      specificity: 0.84,
      monthlySavingsCents: Math.max(pressure.overspentCents, 0),
    },
  });
}

function buildCategorySpikeRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  const category = context.spending.topCategories.find(
    (item) =>
      item.previousAmount > 0 &&
      item.currentAmount >= 15_000 &&
      item.change.direction === 'up' &&
      item.change.percent >= CATEGORY_SPIKE_THRESHOLD,
  );

  if (!category) {
    return [];
  }

  const potentialSavingsCents = Math.max(category.currentAmount - category.previousAmount, 0);
  if (potentialSavingsCents <= 0) {
    return [];
  }

  return buildCandidate({
    recommendation: {
      id: `spending-spike-${category.categoryId ?? category.categoryName}`,
      title: `You spent ${formatPercent(category.change.percent)} more on ${category.categoryName} this month`,
      summary: `Returning to last month's pace could save about ${formatMoney(potentialSavingsCents, context.currencyCode)} this month.`,
      explanation: `${category.categoryName} now makes up ${category.shareOfSpending}% of your current spending. This is a strong signal for a targeted trim instead of a broad spending freeze.`,
      category: 'spending',
      priority:
        category.change.percent >= 40 || potentialSavingsCents >= 20_000 ? 'high' : 'medium',
      currencyCode: context.currencyCode,
      icon: 'chart-bar',
      tags: [category.categoryName, 'category spike'],
      actionLabel: 'Inspect category spend',
      actionHref: '/transactions',
      actionSteps: [
        {
          title: 'Review this category first',
          description: `Filter this month's ${category.categoryName} transactions and look for easy swaps or one-off outliers.`,
          href: '/transactions',
        },
        {
          title: 'Set a tighter cap for the rest of the month',
          description: `Try spending no more than ${formatMoney(category.previousAmount, context.currencyCode)} next month to get back to your earlier baseline.`,
          href: '/budgets',
        },
      ],
      evidence: [
        `This month: ${formatMoney(category.currentAmount, context.currencyCode)}`,
        `Last month: ${formatMoney(category.previousAmount, context.currencyCode)}`,
      ],
      impact: {
        monthlySavingsCents: potentialSavingsCents,
        annualSavingsCents: potentialSavingsCents * 12,
      },
    },
    signal: {
      urgency: clamp(category.change.percent / 50, 0, 1),
      confidence: 0.93,
      specificity: 0.95,
      monthlySavingsCents: potentialSavingsCents,
    },
  });
}

function buildCategoryConcentrationRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  const category = context.spending.topCategories.find(
    (item) =>
      item.currentAmount >= 30_000 &&
      item.shareOfSpending >= CATEGORY_SHARE_THRESHOLD &&
      (item.previousAmount === 0 || item.change.percent < CATEGORY_SPIKE_THRESHOLD),
  );

  if (!category) {
    return [];
  }

  const suggestedTrimCents = Math.round(category.currentAmount * 0.1);

  return buildCandidate({
    recommendation: {
      id: `spending-share-${category.categoryId ?? category.categoryName}`,
      title: `${category.categoryName} makes up ${category.shareOfSpending}% of your monthly spend`,
      summary: `Trimming just 10% here would free up about ${formatMoney(suggestedTrimCents, context.currencyCode)} next month.`,
      explanation: `This category is large enough that even a small change can noticeably improve cash flow without touching every part of your budget.`,
      category: 'spending',
      priority: 'medium',
      currencyCode: context.currencyCode,
      icon: 'target',
      tags: [category.categoryName, 'savings opportunity'],
      actionLabel: 'Review transactions',
      actionHref: '/transactions',
      actionSteps: [
        {
          title: 'Pick one habit to optimize',
          description: `Choose a single repeat purchase inside ${category.categoryName} to make cheaper for the next few weeks.`,
          href: '/transactions',
        },
        {
          title: 'Create a category guardrail',
          description: `Use a budget or personal cap so the category stays below ${formatMoney(category.currentAmount - suggestedTrimCents, context.currencyCode)} next month.`,
          href: '/budgets',
        },
      ],
      evidence: [
        `${category.categoryName}: ${formatMoney(category.currentAmount, context.currencyCode)}`,
        `Share of current spending: ${category.shareOfSpending}%`,
      ],
      impact: {
        monthlySavingsCents: suggestedTrimCents,
        annualSavingsCents: suggestedTrimCents * 12,
      },
    },
    signal: {
      urgency: clamp(category.shareOfSpending / 40, 0, 1),
      confidence: 0.88,
      specificity: 0.83,
      monthlySavingsCents: suggestedTrimCents,
    },
  });
}

function buildEmergencyFundRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  const runwayMonths = context.emergencyRunway.totalExpenseMonths;
  if (runwayMonths >= 6 || context.projectedMonthlyExpenses <= 0) {
    return [];
  }

  const targetRunwayMonths = runwayMonths < 3 ? 3 : 6;
  const targetAmountCents = Math.round(targetRunwayMonths * context.projectedMonthlyExpenses);
  const gapCents = Math.max(targetAmountCents - context.liquidFundsCents, 0);

  return buildCandidate({
    recommendation: {
      id: 'emergency-fund-gap',
      title: `Your emergency fund covers ${runwayMonths.toFixed(1)} months of expenses`,
      summary:
        targetRunwayMonths === 3
          ? 'Aim for 3 to 6 months of core expenses so a surprise bill does not force new debt.'
          : 'You already have a starter buffer. Extending it toward 6 months would make cash flow more resilient.',
      explanation:
        context.emergencyRunway.monthsToTarget !== null
          ? `At your current savings pace, you could reach ${targetRunwayMonths} months in about ${context.emergencyRunway.monthsToTarget} ${pluralize(context.emergencyRunway.monthsToTarget, 'month')}.`
          : `Building about ${formatMoney(gapCents, context.currencyCode)} more in liquid reserves would put you at ${targetRunwayMonths} months of coverage.`,
      category: 'emergency-fund',
      priority: runwayMonths < 3 ? 'high' : 'medium',
      currencyCode: context.currencyCode,
      icon: 'bank',
      tags: ['runway', 'resilience'],
      actionLabel: 'Review goals',
      actionHref: '/goals',
      actionSteps: [
        {
          title: 'Treat your buffer like a goal',
          description:
            'Create or update an emergency fund goal so you can track progress separately from everyday cash.',
          href: '/goals',
        },
        {
          title: 'Route windfalls to savings first',
          description:
            'Use tax refunds, bonuses, or category trims to close the runway gap faster.',
          href: '/accounts',
        },
      ],
      evidence: [
        `Liquid cash: ${formatMoney(context.liquidFundsCents, context.currencyCode)}`,
        `Projected monthly expenses: ${formatMoney(context.projectedMonthlyExpenses, context.currencyCode)}`,
      ],
      impact: {
        currentRunwayMonths: runwayMonths,
        targetRunwayMonths,
        monthsToTarget: context.emergencyRunway.monthsToTarget,
      },
    },
    signal: {
      urgency: clamp((6 - runwayMonths) / 6, 0, 1),
      confidence: 0.91,
      specificity: 0.87,
    },
  });
}

function buildSavingsRateRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  if (
    context.currentMonthIncome <= 0 ||
    context.savingsRate.currentRate >= LOW_SAVINGS_TARGET_RATE
  ) {
    return [];
  }

  const targetSavingsCents = Math.round(
    context.currentMonthIncome * (LOW_SAVINGS_TARGET_RATE / 100),
  );
  const additionalMonthlySavingsCents = Math.max(
    targetSavingsCents - context.currentMonthSavings,
    0,
  );

  if (additionalMonthlySavingsCents <= 0) {
    return [];
  }

  return buildCandidate({
    recommendation: {
      id: 'savings-rate-lift',
      title: `Your savings rate is ${formatPercent(context.savingsRate.currentRate)}`,
      summary: `Moving to ${LOW_SAVINGS_TARGET_RATE}% would add about ${formatMoney(additionalMonthlySavingsCents * 12, context.currencyCode)} over the next 12 months.`,
      explanation: `You have saved ${formatMoney(context.currentMonthSavings, context.currencyCode)} from ${formatMoney(context.currentMonthIncome, context.currencyCode)} in income so far this month. A small trim in one or two categories is enough to close the gap.`,
      category: 'savings',
      priority: context.savingsRate.currentRate < 5 ? 'high' : 'medium',
      currencyCode: context.currencyCode,
      icon: 'wallet',
      tags: ['savings rate', 'long-term'],
      actionLabel: 'Review budgets',
      actionHref: '/budgets',
      actionSteps: [
        {
          title: 'Automate the difference',
          description: `Set aside ${formatMoney(additionalMonthlySavingsCents, context.currencyCode)} after each paycheck so spending has to fit around the transfer.`,
          href: '/accounts',
        },
        {
          title: 'Fund savings from one category trim',
          description:
            'Use the biggest spending spike or over-budget category as the source for the extra savings.',
          href: '/budgets',
        },
      ],
      evidence: [
        `Income this month: ${formatMoney(context.currentMonthIncome, context.currencyCode)}`,
        `Saved this month: ${formatMoney(context.currentMonthSavings, context.currencyCode)}`,
      ],
      impact: {
        monthlySavingsCents: additionalMonthlySavingsCents,
        annualSavingsCents: additionalMonthlySavingsCents * 12,
      },
    },
    signal: {
      urgency: clamp(
        (LOW_SAVINGS_TARGET_RATE - context.savingsRate.currentRate) / LOW_SAVINGS_TARGET_RATE,
        0,
        1,
      ),
      confidence: 0.9,
      specificity: 0.86,
      monthlySavingsCents: additionalMonthlySavingsCents,
    },
  });
}

function buildSubscriptionRecommendation(
  context: PreparedRecommendationContext,
): readonly RecommendationCandidate[] {
  const dormantSubscriptions = context.subscriptions.filter(
    (subscription) =>
      subscription.status === 'active' &&
      daysSince(subscription.lastDate, context.now) >= inactivityThreshold(subscription.cadence),
  );

  if (dormantSubscriptions.length === 0) {
    return [];
  }

  const monthlySavingsCents = dormantSubscriptions.reduce(
    (sum, subscription) => sum + subscription.monthlyCostCents,
    0,
  );
  const examples = dormantSubscriptions.slice(0, 3).map((subscription) => subscription.name);
  const exampleText = examples.length > 0 ? ` Examples: ${examples.join(', ')}.` : '';

  return buildCandidate({
    recommendation: {
      id: 'subscription-review',
      title: `You have ${dormantSubscriptions.length} ${pluralize(dormantSubscriptions.length, 'subscription')} with no recent charge activity`,
      summary: `Reviewing them could free up about ${formatMoney(monthlySavingsCents, context.currencyCode)} per month.${exampleText}`,
      explanation:
        'Recurring charges are easier to cut than one-off spending because the savings repeat automatically every month after you cancel or downgrade.',
      category: 'subscriptions',
      priority: dormantSubscriptions.length >= 3 ? 'high' : 'medium',
      currencyCode: context.currencyCode,
      icon: 'sparkles',
      tags: ['subscriptions', 'recurring spend'],
      actionLabel: 'Open subscriptions',
      actionHref: '/subscriptions',
      actionSteps: [
        {
          title: 'Start with the least active services',
          description:
            'Cancel or downgrade subscriptions that have gone the longest without a matching charge.',
          href: '/subscriptions',
        },
        {
          title: 'Pause before you cancel outright',
          description:
            'If you still need a service occasionally, look for a cheaper tier or monthly pause option.',
          href: '/subscriptions',
        },
      ],
      evidence: dormantSubscriptions.slice(0, 3).map((subscription) => {
        const inactiveDays = daysSince(subscription.lastDate, context.now);
        return `${subscription.name}: last charge ${inactiveDays} ${pluralize(inactiveDays, 'day')} ago`;
      }),
      impact: {
        monthlySavingsCents,
        annualSavingsCents: monthlySavingsCents * 12,
      },
    },
    signal: {
      urgency: clamp(dormantSubscriptions.length / 4, 0, 1),
      confidence: 0.79,
      specificity: 0.82,
      monthlySavingsCents,
    },
  });
}

export const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  buildCashFlowRecommendation,
  buildBudgetRecommendation,
  buildCategorySpikeRecommendation,
  buildEmergencyFundRecommendation,
  buildSavingsRateRecommendation,
  buildSubscriptionRecommendation,
  buildCategoryConcentrationRecommendation,
];
