// SPDX-License-Identifier: BUSL-1.1

/**
 * Subscription detection and rationalization utilities.
 *
 * Pure functions for identifying recurring transactions as subscriptions,
 * grouping them, computing costs, and projecting annual spend.
 * All monetary values are in cents (integers).
 *
 * References: issue #1593
 */

import type { Transaction, Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detected cadence of a recurring subscription. */
export type SubscriptionCadence = 'monthly' | 'annual' | 'weekly' | 'other';

/** Status tracking for a subscription. */
export type SubscriptionStatus = 'active' | 'flagged' | 'cancelled';

/** A detected subscription grouping. */
export interface DetectedSubscription {
  /** Stable identifier derived from payee/amount pattern. */
  id: string;
  /** Display name (derived from payee or note). */
  name: string;
  /** Category of the subscription, if categorized. */
  categoryId: string | null;
  /** Category name for display. */
  categoryName: string;
  /** Average amount per occurrence in cents. */
  amountCents: number;
  /** Detected billing cadence. */
  cadence: SubscriptionCadence;
  /** Monthly equivalent cost in cents. */
  monthlyCostCents: number;
  /** Annual projected cost in cents. */
  annualCostCents: number;
  /** Number of matching transactions found. */
  transactionCount: number;
  /** Most recent transaction date. */
  lastDate: string;
  /** User-set status for tracking decisions. */
  status: SubscriptionStatus;
}

/** Summary of all detected subscriptions. */
export interface SubscriptionSummary {
  /** Total monthly cost of all active subscriptions in cents. */
  totalMonthlyCents: number;
  /** Total annual projected cost of all active subscriptions in cents. */
  totalAnnualCents: number;
  /** Count of active subscriptions. */
  activeCount: number;
  /** Count of subscriptions flagged as potentially unused. */
  flaggedCount: number;
  /** Count of cancelled subscriptions. */
  cancelledCount: number;
  /** Breakdown by category. */
  byCategory: SubscriptionCategoryGroup[];
}

/** Subscriptions grouped by category. */
export interface SubscriptionCategoryGroup {
  categoryName: string;
  monthlyCostCents: number;
  subscriptionCount: number;
  percent: number;
}

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

/**
 * Detects the billing cadence from a set of transaction dates.
 *
 * @param dates - Sorted array of ISO date strings for the same payee/amount
 * @returns Detected cadence
 */
export function detectCadence(dates: string[]): SubscriptionCadence {
  if (dates.length < 2) return 'monthly'; // Default assumption

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1]);
    const d2 = new Date(dates[i]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    intervals.push(diffDays);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  if (avgInterval <= 10) return 'weekly';
  if (avgInterval >= 25 && avgInterval <= 35) return 'monthly';
  if (avgInterval >= 340 && avgInterval <= 395) return 'annual';
  return 'other';
}

/**
 * Converts a per-occurrence amount to monthly equivalent based on cadence.
 *
 * @param amountCents - Amount per occurrence in cents
 * @param cadence - Billing cadence
 * @returns Monthly equivalent in cents
 */
export function toMonthlyCost(amountCents: number, cadence: SubscriptionCadence): number {
  switch (cadence) {
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'monthly':
      return amountCents;
    case 'annual':
      return Math.round(amountCents / 12);
    case 'other':
      return amountCents; // Best-effort: treat as monthly
  }
}

/**
 * Detects subscriptions from a list of recurring expense transactions.
 *
 * Groups transactions by payee, detects cadence, and builds subscription objects.
 * Only considers EXPENSE transactions that appear at least 2 times.
 *
 * @param transactions - All transactions to analyze
 * @param categories - Category lookup list
 * @returns Array of detected subscriptions
 */
export function detectSubscriptions(
  transactions: Transaction[],
  categories: Category[],
): DetectedSubscription[] {
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat.name);
  }

  // Group expenses by payee name (normalized)
  const groups = new Map<
    string,
    {
      dates: string[];
      amounts: number[];
      categoryId: string | null;
      name: string;
    }
  >();

  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    const payee = (tx.payee ?? tx.counterpartyName ?? tx.note ?? '').trim();
    if (!payee) continue;

    const key = payee.toLowerCase();
    const existing = groups.get(key) ?? {
      dates: [],
      amounts: [],
      categoryId: tx.categoryId,
      name: payee,
    };
    existing.dates.push(tx.date);
    existing.amounts.push(Math.abs(tx.amount.amount));
    groups.set(key, existing);
  }

  const subscriptions: DetectedSubscription[] = [];

  for (const [key, group] of groups.entries()) {
    // Only consider recurring (2+ occurrences)
    if (group.dates.length < 2) continue;

    // Check amount consistency: std dev should be small relative to mean
    const avgAmount = Math.round(group.amounts.reduce((a, b) => a + b, 0) / group.amounts.length);
    const variance =
      group.amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / group.amounts.length;
    const stdDev = Math.sqrt(variance);

    // Skip if amounts vary too much (>30% of average)
    if (avgAmount > 0 && stdDev / avgAmount > 0.3) continue;

    const sortedDates = [...group.dates].sort();
    const cadence = detectCadence(sortedDates);
    const monthlyCost = toMonthlyCost(avgAmount, cadence);

    subscriptions.push({
      id: `sub-${key.replace(/\s+/g, '-')}`,
      name: group.name,
      categoryId: group.categoryId,
      categoryName: group.categoryId
        ? (categoryMap.get(group.categoryId) ?? 'Unknown')
        : 'Uncategorized',
      amountCents: avgAmount,
      cadence,
      monthlyCostCents: monthlyCost,
      annualCostCents: monthlyCost * 12,
      transactionCount: group.dates.length,
      lastDate: sortedDates[sortedDates.length - 1],
      status: 'active',
    });
  }

  return subscriptions.sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);
}

/**
 * Computes subscription summary statistics.
 *
 * @param subscriptions - All detected subscriptions
 * @returns Summary with totals and category breakdown
 */
export function computeSubscriptionSummary(
  subscriptions: DetectedSubscription[],
): SubscriptionSummary {
  let totalMonthlyCents = 0;
  let activeCount = 0;
  let flaggedCount = 0;
  let cancelledCount = 0;

  const categoryTotals = new Map<string, { monthly: number; count: number }>();

  for (const sub of subscriptions) {
    if (sub.status === 'cancelled') {
      cancelledCount++;
      continue;
    }

    if (sub.status === 'flagged') flaggedCount++;
    activeCount++;
    totalMonthlyCents += sub.monthlyCostCents;

    const catKey = sub.categoryName;
    const existing = categoryTotals.get(catKey) ?? { monthly: 0, count: 0 };
    existing.monthly += sub.monthlyCostCents;
    existing.count += 1;
    categoryTotals.set(catKey, existing);
  }

  const byCategory: SubscriptionCategoryGroup[] = [];
  for (const [name, data] of categoryTotals.entries()) {
    byCategory.push({
      categoryName: name,
      monthlyCostCents: data.monthly,
      subscriptionCount: data.count,
      percent: totalMonthlyCents > 0 ? Math.round((data.monthly / totalMonthlyCents) * 100) : 0,
    });
  }
  byCategory.sort((a, b) => b.monthlyCostCents - a.monthlyCostCents);

  return {
    totalMonthlyCents,
    totalAnnualCents: totalMonthlyCents * 12,
    activeCount,
    flaggedCount,
    cancelledCount,
    byCategory,
  };
}
