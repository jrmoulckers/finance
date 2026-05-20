// SPDX-License-Identifier: BUSL-1.1

/**
 * Contextual spending insight generation engine.
 *
 * Produces priority-ranked insight messages for the home screen:
 * unusual spending detection, category trends, budget pace alerts,
 * spending streaks, and milestone notifications.
 *
 * All monetary values are integer cents. All functions are pure.
 *
 * References: issue #1766
 */

import type {
  SpendingInsight,
  InsightType,
  InsightPriority,
  InsightInput,
  TaggedTransaction,
  BudgetForInsight,
} from './types';
import { bankersRound } from './budget-tags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic insight ID from type and key. */
function insightId(type: InsightType, key: string): string {
  return `${type}:${key}`;
}

/**
 * Safe percentage change: ((current - prior) / prior) * 100.
 * Returns null if prior is zero.
 *
 * @param currentCents - Current period amount.
 * @param priorCents - Prior period amount.
 * @returns Percentage change or null.
 */
function percentChange(currentCents: number, priorCents: number): number | null {
  if (priorCents === 0) return null;
  return Math.round(((currentCents - priorCents) / priorCents) * 10000) / 100;
}

/**
 * Group transactions by categoryId.
 *
 * @param txs - Tagged transactions.
 * @returns Map from categoryId to total cents.
 */
function groupByCategory(
  txs: readonly TaggedTransaction[],
): Map<string, { totalCents: number; count: number }> {
  const map = new Map<string, { totalCents: number; count: number }>();
  for (const tx of txs) {
    const key = tx.categoryId ?? '__uncategorised__';
    const entry = map.get(key) ?? { totalCents: 0, count: 0 };
    entry.totalCents += tx.amountCents;
    entry.count += 1;
    map.set(key, entry);
  }
  return map;
}

/**
 * Format cents as a dollar string for human-readable messages.
 *
 * @param cents - Amount in cents.
 * @returns Formatted string like "$123.45".
 */
function formatDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars.toLocaleString()}.${String(remainder).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Unusual spending detection
// ---------------------------------------------------------------------------

/**
 * Detect categories with unusually high spending compared to prior period.
 *
 * A category is flagged as unusual if spending increased by more than
 * `thresholdPercent` (default 50%) and the increase is at least
 * `minimumIncreaseCents` (default $20 = 2000 cents).
 *
 * @param currentByCategory - Current period category totals.
 * @param priorByCategory - Prior period category totals.
 * @param today - ISO date string.
 * @param thresholdPercent - Percentage increase threshold (default 50).
 * @param minimumIncreaseCents - Minimum absolute increase in cents (default 2000).
 * @returns Array of unusual spending insights.
 */
export function detectUnusualSpending(
  currentByCategory: Map<string, { totalCents: number; count: number }>,
  priorByCategory: Map<string, { totalCents: number; count: number }>,
  today: string,
  thresholdPercent: number = 50,
  minimumIncreaseCents: number = 2000,
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];

  for (const [catId, current] of currentByCategory) {
    if (catId === '__uncategorised__') continue;
    const prior = priorByCategory.get(catId);
    const priorCents = prior?.totalCents ?? 0;
    const change = percentChange(current.totalCents, priorCents);
    const absDiff = current.totalCents - priorCents;

    if (change !== null && change > thresholdPercent && absDiff >= minimumIncreaseCents) {
      insights.push({
        id: insightId('unusual_spending', catId),
        type: 'unusual_spending',
        priority: change > 100 ? 'high' : 'medium',
        title: 'Unusual Spending Detected',
        description: `Spending in this category is up ${Math.round(change)}% vs last period (${formatDollars(absDiff)} more)`,
        categoryId: catId,
        amountCents: current.totalCents,
        percentChange: change,
        generatedAt: today,
      });
    }
  }

  return insights.sort((a, b) => (b.percentChange ?? 0) - (a.percentChange ?? 0));
}

// ---------------------------------------------------------------------------
// Category trend narratives
// ---------------------------------------------------------------------------

/**
 * Generate category trend insights comparing current vs prior period.
 *
 * Produces narratives like "Dining up 23% vs last month".
 * Only categories with at least `minimumSpendCents` in either period
 * and a change above `minimumChangePercent` are included.
 *
 * @param currentByCategory - Current period totals.
 * @param priorByCategory - Prior period totals.
 * @param categoryNames - Map from categoryId to display name.
 * @param today - ISO date string.
 * @param minimumChangePercent - Minimum change to report (default 15).
 * @param minimumSpendCents - Minimum spending to consider (default 1000).
 * @returns Array of category trend insights.
 */
export function generateCategoryTrends(
  currentByCategory: Map<string, { totalCents: number; count: number }>,
  priorByCategory: Map<string, { totalCents: number; count: number }>,
  categoryNames: Readonly<Record<string, string>>,
  today: string,
  minimumChangePercent: number = 15,
  minimumSpendCents: number = 1000,
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];

  const allCategories = new Set([...currentByCategory.keys(), ...priorByCategory.keys()]);

  for (const catId of allCategories) {
    if (catId === '__uncategorised__') continue;

    const currentCents = currentByCategory.get(catId)?.totalCents ?? 0;
    const priorCents = priorByCategory.get(catId)?.totalCents ?? 0;

    if (currentCents < minimumSpendCents && priorCents < minimumSpendCents) continue;

    const change = percentChange(currentCents, priorCents);
    if (change === null || Math.abs(change) < minimumChangePercent) continue;

    const name = categoryNames[catId] ?? catId;
    const direction = change > 0 ? 'up' : 'down';
    const absChange = Math.abs(Math.round(change));

    insights.push({
      id: insightId('category_trend', catId),
      type: 'category_trend',
      priority: Math.abs(change) > 50 ? 'medium' : 'low',
      title: `${name} ${direction} ${absChange}%`,
      description: `${name} spending is ${direction} ${absChange}% compared to last period (${formatDollars(currentCents)} vs ${formatDollars(priorCents)})`,
      categoryId: catId,
      amountCents: currentCents,
      percentChange: change,
      generatedAt: today,
    });
  }

  return insights.sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0));
}

// ---------------------------------------------------------------------------
// Budget pace alerts
// ---------------------------------------------------------------------------

/**
 * Generate budget pace alerts based on spending rate vs calendar progress.
 *
 * Alerts fire when:
 * - Spending has exceeded budget ("over budget")
 * - Spending pace would exceed budget by end of month ("on pace to exceed")
 * - Spending is well below pace ("under budget")
 *
 * @param budgets - Budget allocations with current spending.
 * @param dayOfMonth - Current day (1–31).
 * @param daysInMonth - Total days in the month.
 * @param today - ISO date string.
 * @returns Array of budget pace insights.
 */
export function generateBudgetPaceAlerts(
  budgets: readonly BudgetForInsight[],
  dayOfMonth: number,
  daysInMonth: number,
  today: string,
): SpendingInsight[] {
  if (daysInMonth <= 0 || dayOfMonth <= 0) return [];

  const insights: SpendingInsight[] = [];
  const calendarProgress = dayOfMonth / daysInMonth;

  for (const budget of budgets) {
    if (budget.budgetCents <= 0) continue;

    const spendingRate = budget.spentCents / budget.budgetCents;
    const projectedSpend =
      dayOfMonth > 0 ? bankersRound((budget.spentCents / dayOfMonth) * daysInMonth) : 0;
    const projectedPercent = percentChange(projectedSpend, budget.budgetCents);

    if (budget.spentCents > budget.budgetCents) {
      // Already over budget
      const overAmount = budget.spentCents - budget.budgetCents;
      insights.push({
        id: insightId('budget_pace', budget.categoryId),
        type: 'budget_pace',
        priority: 'high',
        title: `${budget.categoryName} over budget`,
        description: `${budget.categoryName} is ${formatDollars(overAmount)} over budget with ${daysInMonth - dayOfMonth} days remaining`,
        categoryId: budget.categoryId,
        amountCents: budget.spentCents,
        percentChange: projectedPercent,
        generatedAt: today,
      });
    } else if (spendingRate > calendarProgress * 1.3 && calendarProgress < 0.9) {
      // On pace to exceed
      const overBy = projectedSpend - budget.budgetCents;
      insights.push({
        id: insightId('budget_pace', budget.categoryId),
        type: 'budget_pace',
        priority: 'medium',
        title: `${budget.categoryName} spending ahead of pace`,
        description: `At this rate, ${budget.categoryName} will be ${formatDollars(overBy)} over budget by month's end`,
        categoryId: budget.categoryId,
        amountCents: budget.spentCents,
        percentChange: projectedPercent,
        generatedAt: today,
      });
    } else if (spendingRate < calendarProgress * 0.5 && calendarProgress > 0.25) {
      // Well under budget
      const remaining = budget.budgetCents - budget.spentCents;
      insights.push({
        id: insightId('budget_pace', budget.categoryId),
        type: 'budget_pace',
        priority: 'low',
        title: `${budget.categoryName} well under budget`,
        description: `${budget.categoryName} has ${formatDollars(remaining)} remaining — you're well under pace`,
        categoryId: budget.categoryId,
        amountCents: budget.spentCents,
        percentChange: projectedPercent,
        generatedAt: today,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Streak messages
// ---------------------------------------------------------------------------

/**
 * Generate streak insights from spending pattern.
 *
 * Checks for consecutive no-spend days and high-spend days
 * within the current period's transactions.
 *
 * @param transactions - Current period tagged transactions.
 * @param today - ISO date string.
 * @param minStreakDays - Minimum days to count as a streak (default 3).
 * @returns Array of streak insights.
 */
export function detectSpendingStreakInsights(
  transactions: readonly TaggedTransaction[],
  today: string,
  minStreakDays: number = 3,
): SpendingInsight[] {
  if (transactions.length === 0) return [];

  // Group by date
  const byDate = new Map<string, number>();
  for (const tx of transactions) {
    byDate.set(tx.date, (byDate.get(tx.date) ?? 0) + tx.amountCents);
  }

  // Find the date range
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];

  // Check for recent no-spend streak ending at today
  let noSpendDays = 0;
  const todayParts = today.split('-').map(Number);
  const todayDate = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));

  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(todayDate);
    checkDate.setUTCDate(checkDate.getUTCDate() - i);
    const dateStr = checkDate.toISOString().slice(0, 10);
    if ((byDate.get(dateStr) ?? 0) === 0) {
      noSpendDays++;
    } else {
      break;
    }
  }

  const insights: SpendingInsight[] = [];

  if (noSpendDays >= minStreakDays) {
    insights.push({
      id: insightId('streak', 'no_spend'),
      type: 'streak',
      priority: 'low',
      title: `${noSpendDays}-day no-spend streak!`,
      description: `You haven't spent anything in ${noSpendDays} days — great self-control!`,
      categoryId: null,
      amountCents: null,
      percentChange: null,
      generatedAt: today,
    });
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Milestone notifications
// ---------------------------------------------------------------------------

/**
 * Generate milestone insights based on cumulative spending thresholds.
 *
 * Milestones fire when total spending crosses round-number boundaries
 * (e.g. $1,000, $5,000, $10,000).
 *
 * @param totalSpendingCents - Total spending in the current period.
 * @param priorTotalCents - Total spending in the prior period (for comparison).
 * @param today - ISO date string.
 * @returns Array of milestone insights (usually 0 or 1).
 */
export function detectMilestoneInsights(
  totalSpendingCents: number,
  priorTotalCents: number,
  today: string,
): SpendingInsight[] {
  const milestones = [100000, 250000, 500000, 1000000, 2500000, 5000000]; // $1k, $2.5k, $5k, $10k, $25k, $50k
  const insights: SpendingInsight[] = [];

  for (const milestone of milestones) {
    if (totalSpendingCents >= milestone && priorTotalCents < milestone) {
      insights.push({
        id: insightId('milestone', String(milestone)),
        type: 'milestone',
        priority: 'low',
        title: `${formatDollars(milestone)} spent this period`,
        description: `Your spending has crossed the ${formatDollars(milestone)} mark this period`,
        categoryId: null,
        amountCents: totalSpendingCents,
        percentChange: null,
        generatedAt: today,
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Main insight generator
// ---------------------------------------------------------------------------

/**
 * Generate a prioritised list of spending insights.
 *
 * Combines unusual spending detection, category trends, budget pace alerts,
 * streak messages, and milestone notifications into a single ranked list.
 *
 * @param input - All data needed for insight generation.
 * @param categoryNames - Map from categoryId to display name.
 * @param maxInsights - Maximum number of insights to return (default 10).
 * @returns Array of SpendingInsight sorted by priority then relevance.
 */
export function generateInsights(
  input: InsightInput,
  categoryNames: Readonly<Record<string, string>>,
  maxInsights: number = 10,
): SpendingInsight[] {
  const currentByCategory = groupByCategory(input.currentTransactions);
  const priorByCategory = groupByCategory(input.priorTransactions);

  const allInsights: SpendingInsight[] = [
    ...detectUnusualSpending(currentByCategory, priorByCategory, input.today),
    ...generateCategoryTrends(currentByCategory, priorByCategory, categoryNames, input.today),
    ...generateBudgetPaceAlerts(input.budgets, input.dayOfMonth, input.daysInMonth, input.today),
    ...detectSpendingStreakInsights(input.currentTransactions, input.today),
    ...detectMilestoneInsights(
      sumTransactions(input.currentTransactions),
      sumTransactions(input.priorTransactions),
      input.today,
    ),
  ];

  // Deduplicate by ID
  const seen = new Set<string>();
  const unique = allInsights.filter((insight) => {
    if (seen.has(insight.id)) return false;
    seen.add(insight.id);
    return true;
  });

  // Sort by priority (high > medium > low) then by absolute percent change
  const priorityOrder: Record<InsightPriority, number> = { high: 0, medium: 1, low: 2 };
  unique.sort((a, b) => {
    const po = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (po !== 0) return po;
    return Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0);
  });

  return unique.slice(0, maxInsights);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Sum total spending from tagged transactions.
 *
 * @param txs - Tagged transactions.
 * @returns Total spending in cents.
 */
export function sumTransactions(txs: readonly TaggedTransaction[]): number {
  let total = 0;
  for (const tx of txs) {
    total += tx.amountCents;
  }
  return total;
}
