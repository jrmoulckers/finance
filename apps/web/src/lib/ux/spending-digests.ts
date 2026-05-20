// SPDX-License-Identifier: BUSL-1.1

/**
 * Spending digest engine.
 *
 * Generates daily, weekly, and monthly spending summaries with top categories,
 * biggest transactions, budget status, narrative text, and comparison to the
 * prior period.
 *
 * All operations are pure and immutable — inputs are never mutated.
 * All monetary values are integer cents.
 *
 * References: issues #1607, #1669, #1674, #1747
 */

import type {
  CategoryComparison,
  DigestCategorySpending,
  DigestPeriod,
  DigestTopTransaction,
  PeriodComparison,
  SpendingDigest,
} from './types';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Raw transaction data fed into the digest engine. */
export interface DigestTransaction {
  /** Transaction identifier. */
  readonly id: string;
  /** Description / merchant name. */
  readonly description: string;
  /** Amount in cents (positive = expense). */
  readonly amountCents: number;
  /** Category identifier. */
  readonly categoryId: string;
  /** Category display name. */
  readonly categoryName: string;
  /** ISO 8601 date string (YYYY-MM-DD). */
  readonly date: string;
}

/** Budget data for a single category. */
export interface DigestBudget {
  /** Category identifier. */
  readonly categoryId: string;
  /** Category display name. */
  readonly categoryName: string;
  /** Allocated budget in cents. */
  readonly allocatedCents: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the percentage change between two values.
 *
 * Returns 0 when the prior value is 0 to avoid division by zero.
 *
 * @param priorCents   - Prior period value in cents.
 * @param currentCents - Current period value in cents.
 * @returns Signed percentage change rounded to one decimal.
 */
export function percentChange(priorCents: number, currentCents: number): number {
  if (priorCents === 0) return currentCents === 0 ? 0 : 100;
  return Math.round(((currentCents - priorCents) / Math.abs(priorCents)) * 1000) / 10;
}

/**
 * Build per-category spending aggregates from transactions.
 *
 * @param transactions - Transaction list to aggregate.
 * @param budgets      - Budget allocations to match against.
 * @returns Array of category spending summaries sorted by amount descending.
 */
export function aggregateCategorySpending(
  transactions: readonly DigestTransaction[],
  budgets: readonly DigestBudget[],
): DigestCategorySpending[] {
  const budgetMap = new Map<string, DigestBudget>();
  for (const b of budgets) {
    budgetMap.set(b.categoryId, b);
  }

  const spendingMap = new Map<string, { name: string; cents: number }>();
  for (const tx of transactions) {
    const existing = spendingMap.get(tx.categoryId);
    if (existing) {
      existing.cents += tx.amountCents;
    } else {
      spendingMap.set(tx.categoryId, { name: tx.categoryName, cents: tx.amountCents });
    }
  }

  const results: DigestCategorySpending[] = [];
  for (const [categoryId, { name, cents }] of spendingMap) {
    const budget = budgetMap.get(categoryId);
    const budgetCents = budget?.allocatedCents ?? 0;
    const budgetUsedPercent = budgetCents > 0 ? Math.round((cents / budgetCents) * 1000) / 10 : 0;
    results.push({
      categoryId,
      categoryName: name,
      spentCents: cents,
      budgetCents,
      budgetUsedPercent,
    });
  }

  return results.sort((a, b) => b.spentCents - a.spentCents);
}

/**
 * Pick the N largest transactions from a list.
 *
 * @param transactions - Source transactions.
 * @param count        - Maximum number of top transactions to return.
 * @returns Array of top transactions sorted by amount descending.
 */
export function pickTopTransactions(
  transactions: readonly DigestTransaction[],
  count: number,
): DigestTopTransaction[] {
  return [...transactions]
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, Math.max(0, count))
    .map((tx) => ({
      transactionId: tx.id,
      description: tx.description,
      amountCents: tx.amountCents,
      categoryName: tx.categoryName,
      date: tx.date,
    }));
}

/**
 * Compute per-category comparisons between two periods.
 *
 * @param currentTransactions - Transactions in the current period.
 * @param priorTransactions   - Transactions in the prior period.
 * @returns Array of category comparisons sorted by absolute change descending.
 */
export function buildCategoryComparisons(
  currentTransactions: readonly DigestTransaction[],
  priorTransactions: readonly DigestTransaction[],
): CategoryComparison[] {
  const aggregate = (txs: readonly DigestTransaction[]) => {
    const map = new Map<string, { name: string; cents: number }>();
    for (const tx of txs) {
      const existing = map.get(tx.categoryId);
      if (existing) {
        existing.cents += tx.amountCents;
      } else {
        map.set(tx.categoryId, { name: tx.categoryName, cents: tx.amountCents });
      }
    }
    return map;
  };

  const currentMap = aggregate(currentTransactions);
  const priorMap = aggregate(priorTransactions);

  const allIds = new Set([...currentMap.keys(), ...priorMap.keys()]);
  const comparisons: CategoryComparison[] = [];

  for (const id of allIds) {
    const current = currentMap.get(id);
    const prior = priorMap.get(id);
    const currentCents = current?.cents ?? 0;
    const priorCents = prior?.cents ?? 0;
    const name = current?.name ?? prior?.name ?? id;

    comparisons.push({
      categoryId: id,
      categoryName: name,
      priorCents,
      currentCents,
      changeCents: currentCents - priorCents,
      changePercent: percentChange(priorCents, currentCents),
    });
  }

  return comparisons.sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents));
}

// ---------------------------------------------------------------------------
// Narrative generation
// ---------------------------------------------------------------------------

/**
 * Format cents as a human-readable dollar string.
 *
 * @param cents - Amount in cents.
 * @returns Formatted string like "$12.34".
 */
export function formatCentsToDollars(cents: number): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${dollars}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Generate narrative text lines summarising the digest.
 *
 * @param comparison          - Overall period comparison.
 * @param categoryComparisons - Per-category comparisons.
 * @param topCategories       - Top spending categories.
 * @param period              - Digest period type.
 * @returns Array of human-readable narrative strings.
 */
export function generateNarratives(
  comparison: PeriodComparison,
  categoryComparisons: readonly CategoryComparison[],
  topCategories: readonly DigestCategorySpending[],
  period: DigestPeriod,
): string[] {
  const narratives: string[] = [];
  const periodLabel = period === 'daily' ? 'today' : `this ${period.replace('ly', '')}`;
  const priorLabel = period === 'daily' ? 'yesterday' : `last ${period.replace('ly', '')}`;

  // Overall change narrative
  if (comparison.priorTotalCents > 0) {
    if (comparison.changeCents < 0) {
      narratives.push(
        `You spent ${Math.abs(comparison.changePercent)}% less ${periodLabel} compared to ${priorLabel}.`,
      );
    } else if (comparison.changeCents > 0) {
      narratives.push(
        `You spent ${comparison.changePercent}% more ${periodLabel} compared to ${priorLabel}.`,
      );
    } else {
      narratives.push(`Your spending ${periodLabel} was the same as ${priorLabel}.`);
    }
  }

  // Top category narrative
  if (topCategories.length > 0) {
    const top = topCategories[0];
    narratives.push(
      `Your biggest spending category was ${top.categoryName} at ${formatCentsToDollars(top.spentCents)}.`,
    );
  }

  // Budget warning
  const overBudget = topCategories.filter((c) => c.budgetCents > 0 && c.budgetUsedPercent > 100);
  if (overBudget.length > 0) {
    const names = overBudget.map((c) => c.categoryName).join(', ');
    narratives.push(`You went over budget in: ${names}.`);
  }

  // Biggest category change
  if (categoryComparisons.length > 0) {
    const biggest = categoryComparisons[0];
    if (biggest.changeCents < 0) {
      narratives.push(
        `You spent ${Math.abs(biggest.changePercent)}% less on ${biggest.categoryName} ${periodLabel}.`,
      );
    } else if (biggest.changeCents > 0) {
      narratives.push(
        `You spent ${biggest.changePercent}% more on ${biggest.categoryName} ${periodLabel}.`,
      );
    }
  }

  return narratives;
}

// ---------------------------------------------------------------------------
// Main digest builder
// ---------------------------------------------------------------------------

/**
 * Generate a complete spending digest for a given period.
 *
 * @param period              - The digest period type.
 * @param startDate           - ISO 8601 start date of the period.
 * @param endDate             - ISO 8601 end date of the period.
 * @param currentTransactions - Transactions in the current period.
 * @param priorTransactions   - Transactions in the immediately prior period.
 * @param budgets             - Budget allocations for matching.
 * @param topTransactionCount - Number of top transactions to include (default 5).
 * @returns A complete {@link SpendingDigest}.
 */
export function generateSpendingDigest(
  period: DigestPeriod,
  startDate: string,
  endDate: string,
  currentTransactions: readonly DigestTransaction[],
  priorTransactions: readonly DigestTransaction[],
  budgets: readonly DigestBudget[],
  topTransactionCount: number = 5,
): SpendingDigest {
  const totalSpentCents = currentTransactions.reduce((sum, tx) => sum + tx.amountCents, 0);
  const priorTotalCents = priorTransactions.reduce((sum, tx) => sum + tx.amountCents, 0);

  const topCategories = aggregateCategorySpending(currentTransactions, budgets);
  const topTransactions = pickTopTransactions(currentTransactions, topTransactionCount);
  const categoryComparisons = buildCategoryComparisons(currentTransactions, priorTransactions);

  const comparison: PeriodComparison = {
    priorTotalCents,
    currentTotalCents: totalSpentCents,
    changeCents: totalSpentCents - priorTotalCents,
    changePercent: percentChange(priorTotalCents, totalSpentCents),
  };

  const narratives = generateNarratives(comparison, categoryComparisons, topCategories, period);

  return {
    period,
    startDate,
    endDate,
    totalSpentCents,
    topCategories,
    topTransactions,
    comparison,
    categoryComparisons,
    narratives,
  };
}
