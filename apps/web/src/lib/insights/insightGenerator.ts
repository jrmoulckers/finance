// SPDX-License-Identifier: BUSL-1.1

import type { GeneratedInsight, WealthDigest } from './types';

function pushInsight(insights: GeneratedInsight[], insight: GeneratedInsight) {
  if (!insights.some((existing) => existing.id === insight.id)) {
    insights.push(insight);
  }
}

export function generatePersonalizedInsights(digest: WealthDigest): readonly GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];

  if (digest.netWorth.change.direction === 'up' && digest.netWorth.change.amount > 0) {
    pushInsight(insights, {
      id: 'net-worth-growth',
      title: 'Your net worth moved in the right direction',
      description: `${Math.abs(digest.netWorth.change.percent)}% ${digest.period === 'weekly' ? 'week-over-week' : 'month-over-month'} growth suggests your current habits are compounding well.`,
      tone: 'success',
      icon: 'trending-up',
      actionLabel: 'View net worth',
      actionHref: '/net-worth',
    });
  }

  if (digest.spending.topCategories[0] && digest.spending.topCategories[0].change.percent >= 15) {
    const topCategory = digest.spending.topCategories[0];
    pushInsight(insights, {
      id: 'top-category-spike',
      title: `Did you know ${topCategory.categoryName} is driving this month’s spend?`,
      description: `${topCategory.categoryName} is up ${Math.abs(topCategory.change.percent)}% versus last month and now represents ${topCategory.shareOfSpending}% of current spending.`,
      tone: 'warning',
      icon: 'chart-bar',
      actionLabel: 'Review transactions',
      actionHref: '/transactions',
    });
  }

  if (digest.savingsRate.currentRate >= 20) {
    pushInsight(insights, {
      id: 'strong-savings-rate',
      title: 'Did you know your savings rate is beating the 20% benchmark?',
      description: `You kept ${digest.savingsRate.currentRate}% of income this ${digest.period === 'weekly' ? 'week' : 'month'}, which puts you in a strong position to fund goals faster.`,
      tone: 'success',
      icon: 'wallet',
      actionLabel: 'Open goals',
      actionHref: '/goals',
    });
  } else if (digest.savingsRate.currentRate <= 10) {
    pushInsight(insights, {
      id: 'low-savings-rate',
      title: 'Did you know a small budget trim could lift your savings rate quickly?',
      description: `Your current savings rate is ${digest.savingsRate.currentRate}%. Reclaiming even a little from your top spending category would move the dial fast.`,
      tone: 'warning',
      icon: 'alert-triangle',
      actionLabel: 'Tighten budgets',
      actionHref: '/budgets',
    });
  }

  const goalNearlyComplete = digest.goals.find(
    (goal) => goal.progressPercent >= 80 && goal.pace !== 'completed',
  );
  if (goalNearlyComplete) {
    pushInsight(insights, {
      id: `goal-nearly-complete-${goalNearlyComplete.id}`,
      title: `${goalNearlyComplete.name} is within reach`,
      description: `You’re ${goalNearlyComplete.progressPercent}% of the way there. One more focused contribution could close the gap soon.`,
      tone: 'success',
      icon: 'target',
      actionLabel: 'Update goal',
      actionHref: '/goals',
    });
  }

  if (digest.healthScore.metrics.monthsOfExpensesSaved < 3) {
    pushInsight(insights, {
      id: 'emergency-fund-gap',
      title: 'Did you know your emergency runway is below three months?',
      description: `Right now you have about ${digest.healthScore.metrics.monthsOfExpensesSaved} months of expenses covered. Building that runway will improve resilience and your health score.`,
      tone: 'info',
      icon: 'bank',
      actionLabel: 'Prioritize a goal',
      actionHref: '/goals',
    });
  }

  if (digest.healthScore.metrics.debtToIncomeRatio >= 40) {
    pushInsight(insights, {
      id: 'debt-ratio-warning',
      title: 'Debt is putting pressure on your financial health score',
      description: `Your debt-to-income ratio is ${digest.healthScore.metrics.debtToIncomeRatio}%. Paying down high-interest balances will free up future cash flow.`,
      tone: 'warning',
      icon: 'trending-down',
      actionLabel: 'Review accounts',
      actionHref: '/accounts',
    });
  }

  if (insights.length === 0) {
    pushInsight(insights, {
      id: 'steady-progress',
      title: 'Did you know consistency is your edge?',
      description:
        'Your finances look steady. Keep tracking accounts, transactions, and goals so the digest can surface sharper opportunities over time.',
      tone: 'info',
      icon: 'sparkles',
      actionLabel: 'Explore insights',
      actionHref: '/insights',
    });
  }

  return insights.slice(0, 4);
}
