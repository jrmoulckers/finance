// SPDX-License-Identifier: BUSL-1.1

/**
 * Priority-based adaptive budget allocation engine.
 *
 * Allocates income to categories in priority order (essentials first,
 * then important, discretionary, and finally savings). Includes
 * weighted-moving-average income prediction and "what if" scenario
 * analysis.
 *
 * All monetary values are integer cents. All operations are pure —
 * inputs are never mutated.
 *
 * References: issue #1755
 */

import {
  AllocationPriority,
  type IncomePrediction,
  type PrioritisedCategory,
  type PriorityAllocationResult,
  type RolloverResult,
  type ScenarioResult,
} from './budgeting-types';
import { bankersRound } from './budgeting-zero-based';

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: readonly AllocationPriority[] = [
  AllocationPriority.ESSENTIAL,
  AllocationPriority.IMPORTANT,
  AllocationPriority.DISCRETIONARY,
  AllocationPriority.SAVINGS,
];

// ---------------------------------------------------------------------------
// Priority-based allocation
// ---------------------------------------------------------------------------

/**
 * Allocate income to categories in priority order.
 *
 * Categories within each tier are funded proportionally when the
 * remaining income cannot cover the full tier.
 *
 * @param incomeCents  - Total income available in cents.
 * @param categories   - Categories with their requested amounts and priorities.
 * @param priorities   - Optional override map of categoryId → priority.
 * @returns Per-category allocation results.
 */
export function allocateByPriority(
  incomeCents: number,
  categories: readonly PrioritisedCategory[],
  priorities?: ReadonlyMap<string, AllocationPriority>,
): PriorityAllocationResult[] {
  if (incomeCents <= 0 || categories.length === 0) {
    return categories.map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      fundedCents: 0,
      requestedCents: c.requestedCents,
      fullyFunded: c.requestedCents <= 0,
      priority: priorities?.get(c.categoryId) ?? c.priority,
    }));
  }

  // Apply priority overrides
  const resolved = categories.map((c) => ({
    ...c,
    priority: priorities?.get(c.categoryId) ?? c.priority,
  }));

  let remaining = incomeCents;
  const funded = new Map<string, number>();

  for (const tier of PRIORITY_ORDER) {
    const tierCats = resolved.filter((c) => c.priority === tier);
    if (tierCats.length === 0) continue;

    const tierTotal = tierCats.reduce((s, c) => s + c.requestedCents, 0);

    if (tierTotal <= remaining) {
      // Fully fund the entire tier
      for (const c of tierCats) {
        funded.set(c.categoryId, c.requestedCents);
      }
      remaining -= tierTotal;
    } else {
      // Proportional funding within the tier
      if (tierTotal > 0) {
        let allocated = 0;
        const results: { id: string; amount: number }[] = [];

        for (const c of tierCats) {
          const share = bankersRound((c.requestedCents / tierTotal) * remaining);
          results.push({ id: c.categoryId, amount: share });
          allocated += share;
        }

        // Distribute any rounding remainder to the first category
        const diff = remaining - allocated;
        if (diff !== 0 && results.length > 0) {
          results[0].amount += diff;
        }

        for (const r of results) {
          funded.set(r.id, r.amount);
        }
      }
      break;
    }
  }

  return resolved.map((c) => {
    const fundedCents = funded.get(c.categoryId) ?? 0;
    return {
      categoryId: c.categoryId,
      name: c.name,
      fundedCents,
      requestedCents: c.requestedCents,
      fullyFunded: fundedCents >= c.requestedCents,
      priority: c.priority,
    };
  });
}

// ---------------------------------------------------------------------------
// Income prediction (weighted moving average)
// ---------------------------------------------------------------------------

/**
 * Predict future income using a weighted moving average.
 *
 * More recent observations receive higher weights. By default the
 * weights increase linearly (1, 2, 3, …, N) but callers may supply
 * custom weights.
 *
 * @param history - Array of past income amounts in cents (oldest first).
 * @param weights - Optional array of weights (must match history length).
 * @returns An {@link IncomePrediction} with the predicted value and confidence.
 */
export function predictIncome(
  history: readonly number[],
  weights?: readonly number[],
): IncomePrediction {
  if (history.length === 0) {
    return { predictedCents: 0, confidence: 0, dataPoints: 0 };
  }

  if (history.length === 1) {
    return { predictedCents: history[0], confidence: 0.3, dataPoints: 1 };
  }

  const w = weights && weights.length === history.length ? weights : history.map((_, i) => i + 1);

  const totalWeight = w.reduce((s, v) => s + v, 0);

  if (totalWeight === 0) {
    return { predictedCents: 0, confidence: 0, dataPoints: history.length };
  }

  const weightedSum = history.reduce((s, v, i) => s + v * w[i], 0);
  const predictedCents = bankersRound(weightedSum / totalWeight);

  // Confidence increases with more data points, capped at 0.95
  const confidence = Math.min(0.95, 0.3 + history.length * 0.1);

  return {
    predictedCents,
    confidence: Math.round(confidence * 100) / 100,
    dataPoints: history.length,
  };
}

// ---------------------------------------------------------------------------
// Scenario analysis
// ---------------------------------------------------------------------------

/**
 * Run a "what if" scenario with a given income level.
 *
 * @param incomeCents - Hypothetical income in cents.
 * @param categories  - Categories with requested amounts and priorities.
 * @param priorities  - Optional override map of categoryId → priority.
 * @returns A full {@link ScenarioResult}.
 */
export function runScenario(
  incomeCents: number,
  categories: readonly PrioritisedCategory[],
  priorities?: ReadonlyMap<string, AllocationPriority>,
): ScenarioResult {
  const allocations = allocateByPriority(incomeCents, categories, priorities);
  const totalFundedCents = allocations.reduce((s, a) => s + a.fundedCents, 0);
  const surplusCents = Math.max(0, incomeCents - totalFundedCents);
  const underfunded = allocations.filter((a) => !a.fullyFunded);

  return {
    incomeCents,
    allocations,
    totalFundedCents,
    surplusCents,
    underfunded,
  };
}

// ---------------------------------------------------------------------------
// Rollover budgets
// ---------------------------------------------------------------------------

/**
 * Calculate rollover budget carrying surplus forward.
 *
 * Only positive surplus (unused budget) rolls over — deficits are NOT
 * carried forward to avoid cascading overspend.
 *
 * @param priorAllocations - Array of [categoryId, allocatedCents, spentCents].
 * @param newAllocations   - Array of [categoryId, newAllocatedCents].
 * @returns Per-category rollover results.
 */
export function calculateRolloverBudget(
  priorAllocations: readonly {
    readonly categoryId: string;
    readonly allocatedCents: number;
    readonly spentCents: number;
  }[],
  newAllocations: ReadonlyMap<string, number>,
): RolloverResult[] {
  return priorAllocations.map((prior) => {
    const unused = Math.max(0, prior.allocatedCents - prior.spentCents);
    const newBase = newAllocations.get(prior.categoryId) ?? 0;

    return {
      categoryId: prior.categoryId,
      priorAllocatedCents: prior.allocatedCents,
      unusedCents: unused,
      rolledOverCents: newBase + unused,
    };
  });
}
