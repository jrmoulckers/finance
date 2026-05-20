// SPDX-License-Identifier: BUSL-1.1

/**
 * Budget history and copy-forward engine.
 *
 * Enables cloning budget allocations from a previous period to
 * a new period, computing diffs between periods, and navigating
 * budget history.
 *
 * All amounts are integer cents. Inputs are never mutated.
 *
 * References: #1570
 */

import type {
  BudgetAllocationDiff,
  BudgetHistoryAllocation,
  BudgetPeriodDiff,
  BudgetPeriodSnapshot,
} from './advanced-types';

// ---------------------------------------------------------------------------
// Copy forward
// ---------------------------------------------------------------------------

/**
 * Copy budget allocations from a source period to a new target period.
 *
 * Spending is reset to zero; only the budgeted amounts are carried forward.
 *
 * @param source - The source period snapshot to copy from.
 * @param targetPeriodKey - The new period identifier.
 * @returns A new {@link BudgetPeriodSnapshot} for the target period.
 */
export function copyForward(
  source: BudgetPeriodSnapshot,
  targetPeriodKey: string,
): BudgetPeriodSnapshot {
  const allocations: BudgetHistoryAllocation[] = source.allocations.map((a) => ({
    categoryId: a.categoryId,
    name: a.name,
    budgetedCents: a.budgetedCents,
    spentCents: 0, // Reset spending for new period
  }));

  return {
    periodKey: targetPeriodKey,
    allocations,
    totalBudgetedCents: source.totalBudgetedCents,
  };
}

// ---------------------------------------------------------------------------
// Period diff
// ---------------------------------------------------------------------------

/**
 * Calculate the diff between two budget period snapshots.
 *
 * Identifies new categories, removed categories, and changes
 * in budgeted amounts for categories present in both periods.
 *
 * @param from - The earlier period snapshot.
 * @param to - The later period snapshot.
 * @returns A {@link BudgetPeriodDiff} with per-category diffs.
 */
export function calculatePeriodDiff(
  from: BudgetPeriodSnapshot,
  to: BudgetPeriodSnapshot,
): BudgetPeriodDiff {
  const fromMap = new Map(from.allocations.map((a) => [a.categoryId, a]));
  const toMap = new Map(to.allocations.map((a) => [a.categoryId, a]));

  const allCategoryIds = new Set([...fromMap.keys(), ...toMap.keys()]);

  const diffs: BudgetAllocationDiff[] = [];

  for (const catId of allCategoryIds) {
    const fromAlloc = fromMap.get(catId);
    const toAlloc = toMap.get(catId);

    const fromBudgeted = fromAlloc?.budgetedCents ?? 0;
    const toBudgeted = toAlloc?.budgetedCents ?? 0;
    const name = toAlloc?.name ?? fromAlloc?.name ?? '';

    diffs.push({
      categoryId: catId,
      name,
      fromBudgetedCents: fromBudgeted,
      toBudgetedCents: toBudgeted,
      changeCents: toBudgeted - fromBudgeted,
      isNew: fromAlloc === undefined,
      isRemoved: toAlloc === undefined,
    });
  }

  // Sort: new first, then removed, then by absolute change descending
  diffs.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
    if (a.isRemoved !== b.isRemoved) return a.isRemoved ? -1 : 1;
    return Math.abs(b.changeCents) - Math.abs(a.changeCents);
  });

  return {
    fromPeriodKey: from.periodKey,
    toPeriodKey: to.periodKey,
    diffs,
    totalBudgetedChangeCents: to.totalBudgetedCents - from.totalBudgetedCents,
  };
}

// ---------------------------------------------------------------------------
// History navigation
// ---------------------------------------------------------------------------

/**
 * Find a period snapshot by its key from an array of snapshots.
 *
 * @param history - Array of period snapshots.
 * @param periodKey - The period key to search for.
 * @returns The matching snapshot, or undefined if not found.
 */
export function findPeriod(
  history: readonly BudgetPeriodSnapshot[],
  periodKey: string,
): BudgetPeriodSnapshot | undefined {
  return history.find((s) => s.periodKey === periodKey);
}

/**
 * Get the previous and next period keys relative to a given key.
 *
 * Assumes the history array is sorted in chronological order.
 *
 * @param history - Array of period snapshots.
 * @param currentKey - The current period key.
 * @returns An object with `previousKey` and `nextKey` (null if at boundary).
 */
export function getAdjacentPeriods(
  history: readonly BudgetPeriodSnapshot[],
  currentKey: string,
): { previousKey: string | null; nextKey: string | null } {
  const index = history.findIndex((s) => s.periodKey === currentKey);

  if (index === -1) {
    return { previousKey: null, nextKey: null };
  }

  return {
    previousKey: index > 0 ? history[index - 1].periodKey : null,
    nextKey: index < history.length - 1 ? history[index + 1].periodKey : null,
  };
}

/**
 * Create an empty budget period snapshot.
 *
 * @param periodKey - The period identifier.
 * @returns An empty {@link BudgetPeriodSnapshot}.
 */
export function createEmptySnapshot(periodKey: string): BudgetPeriodSnapshot {
  return {
    periodKey,
    allocations: [],
    totalBudgetedCents: 0,
  };
}
