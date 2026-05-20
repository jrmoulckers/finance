// SPDX-License-Identifier: BUSL-1.1

/**
 * Subscription portfolio analyzer.
 *
 * Calculates total monthly/annual subscription costs, category breakdowns,
 * duplicate/overlapping service detection, and annual cost projections.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1619, #1629
 */

import { toAnnualCostCents, toMonthlyCostCents } from './cancellation-tracker';
import type {
  CategoryBreakdown,
  DuplicateDetection,
  Subscription,
  SubscriptionAnalysis,
  SubscriptionCategory,
} from './types';

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

/**
 * Calculates spending breakdown by subscription category.
 *
 * Groups active subscriptions by category and computes monthly/annual
 * costs, count, and percentage of total spend.
 *
 * @param subscriptions - Active subscriptions to analyze.
 * @returns Array of category breakdowns sorted by monthly cost (descending).
 */
export function calculateCategoryBreakdown(
  subscriptions: readonly Subscription[],
): readonly CategoryBreakdown[] {
  const active = subscriptions.filter((s) => s.status === 'active' || s.status === 'trial');

  const categoryMap = new Map<
    SubscriptionCategory,
    { monthlyCents: number; annualCents: number; count: number }
  >();

  for (const sub of active) {
    const monthly = toMonthlyCostCents(sub.priceCents, sub.billingCycle);
    const annual = toAnnualCostCents(sub.priceCents, sub.billingCycle);
    const existing = categoryMap.get(sub.category) ?? {
      monthlyCents: 0,
      annualCents: 0,
      count: 0,
    };
    categoryMap.set(sub.category, {
      monthlyCents: existing.monthlyCents + monthly,
      annualCents: existing.annualCents + annual,
      count: existing.count + 1,
    });
  }

  const totalMonthlyCents = [...categoryMap.values()].reduce((sum, v) => sum + v.monthlyCents, 0);

  return [...categoryMap.entries()]
    .map(([category, data]) => ({
      category,
      monthlyCostCents: data.monthlyCents,
      annualCostCents: data.annualCents,
      count: data.count,
      percentOfTotal:
        totalMonthlyCents > 0
          ? Math.round((data.monthlyCents / totalMonthlyCents) * 10000) / 100
          : 0,
    }))
    .sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
}

// ---------------------------------------------------------------------------
// Duplicate / overlap detection
// ---------------------------------------------------------------------------

/**
 * Detects potential duplicate or overlapping subscriptions.
 *
 * Two active subscriptions are flagged as potential duplicates when they
 * share the same category and both are active. This is a heuristic —
 * users may legitimately have multiple subscriptions in the same category.
 *
 * @param subscriptions - Subscriptions to analyze.
 * @returns Array of duplicate detection results.
 */
export function detectDuplicates(
  subscriptions: readonly Subscription[],
): readonly DuplicateDetection[] {
  const active = subscriptions.filter((s) => s.status === 'active' || s.status === 'trial');

  // Group by category
  const groups = new Map<SubscriptionCategory, Subscription[]>();
  for (const sub of active) {
    const group = groups.get(sub.category) ?? [];
    group.push(sub);
    groups.set(sub.category, group);
  }

  const duplicates: DuplicateDetection[] = [];
  for (const [category, group] of groups) {
    if (group.length < 2) continue;

    const combinedMonthlyCost = group.reduce(
      (sum, s) => sum + toMonthlyCostCents(s.priceCents, s.billingCycle),
      0,
    );

    duplicates.push({
      subscriptionIds: group.map((s) => s.id),
      subscriptionNames: group.map((s) => s.name),
      category,
      combinedMonthlyCostCents: combinedMonthlyCost,
      reason:
        `${group.length} active subscriptions in the "${category}" category. ` +
        `Consider whether all are needed.`,
    });
  }

  return duplicates;
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

/**
 * Performs a comprehensive analysis of a subscription portfolio.
 *
 * Includes total costs, category breakdown, duplicate detection,
 * and key summary statistics.
 *
 * @param subscriptions - All subscriptions to analyze.
 * @returns Complete subscription analysis.
 */
export function analyzeSubscriptions(subscriptions: readonly Subscription[]): SubscriptionAnalysis {
  const active = subscriptions.filter((s) => s.status === 'active' || s.status === 'trial');

  const totalMonthlyCostCents = active.reduce(
    (sum, s) => sum + toMonthlyCostCents(s.priceCents, s.billingCycle),
    0,
  );

  const totalAnnualCostCents = active.reduce(
    (sum, s) => sum + toAnnualCostCents(s.priceCents, s.billingCycle),
    0,
  );

  const categoryBreakdown = calculateCategoryBreakdown(subscriptions);
  const duplicates = detectDuplicates(subscriptions);

  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const trialCount = subscriptions.filter((s) => s.status === 'trial').length;

  const mostExpensive =
    active.length > 0
      ? active.reduce((max, s) => {
          const maxMonthly = toMonthlyCostCents(max.priceCents, max.billingCycle);
          const sMonthly = toMonthlyCostCents(s.priceCents, s.billingCycle);
          return sMonthly > maxMonthly ? s : max;
        })
      : null;

  const averageMonthlyCostCents =
    active.length > 0 ? Math.round(totalMonthlyCostCents / active.length) : 0;

  return {
    totalMonthlyCostCents,
    totalAnnualCostCents,
    categoryBreakdown,
    duplicates,
    activeCount,
    trialCount,
    mostExpensive,
    averageMonthlyCostCents,
  };
}
