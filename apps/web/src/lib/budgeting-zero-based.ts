// SPDX-License-Identifier: BUSL-1.1

/**
 * Zero-based budgeting calculation engine.
 *
 * In zero-based budgeting every dollar of income is assigned a job.
 * The "Ready to Assign" value (income − allocations) should reach zero.
 *
 * All monetary values are integer cents. Divisions use banker's rounding
 * (IEEE 754 HALF_EVEN) to avoid systematic rounding bias.
 *
 * References: issue #1558
 */

import type { BudgetAllocation, ZeroBasedStatus, ZeroBasedSummary } from './budgeting-types';

// ---------------------------------------------------------------------------
// Banker's rounding (HALF_EVEN)
// ---------------------------------------------------------------------------

/**
 * Round a value to the nearest integer using banker's rounding.
 *
 * When the fractional part is exactly 0.5 the value is rounded to the
 * nearest **even** integer, eliminating the systematic upward bias of
 * the common "round half up" rule.
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) {
    return value; // NaN, ±Infinity pass through
  }

  const floored = Math.floor(value);
  const fraction = value - floored;

  // Use a small epsilon to detect "exactly half" in floating-point
  const EPSILON = 1e-9;

  if (Math.abs(fraction - 0.5) < EPSILON) {
    // Exactly half — round to even
    return floored % 2 === 0 ? floored : floored + 1;
  }

  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate the "Ready to Assign" amount.
 *
 * @param totalIncomeCents - Total income for the period in cents.
 * @param allocations      - Array of budget allocations.
 * @returns The difference between income and total allocated (cents).
 */
export function calculateReadyToAssign(
  totalIncomeCents: number,
  allocations: readonly BudgetAllocation[],
): number {
  const totalAllocated = allocations.reduce((sum, a) => sum + a.allocatedCents, 0);
  return totalIncomeCents - totalAllocated;
}

/**
 * Derive the allocation status from a Ready-to-Assign value.
 *
 * @param readyToAssignCents - The RTA value in cents.
 * @returns `'fully-allocated'` when zero, `'under-allocated'` when positive,
 *          `'over-allocated'` when negative.
 */
export function getAllocationStatus(readyToAssignCents: number): ZeroBasedStatus {
  if (readyToAssignCents === 0) return 'fully-allocated';
  return readyToAssignCents > 0 ? 'under-allocated' : 'over-allocated';
}

/**
 * Build a full zero-based budget summary.
 *
 * @param totalIncomeCents - Total income for the period in cents.
 * @param allocations      - Array of budget allocations.
 * @returns A complete {@link ZeroBasedSummary}.
 */
export function calculateZeroBasedSummary(
  totalIncomeCents: number,
  allocations: readonly BudgetAllocation[],
): ZeroBasedSummary {
  const totalAllocatedCents = allocations.reduce((sum, a) => sum + a.allocatedCents, 0);
  const readyToAssignCents = totalIncomeCents - totalAllocatedCents;
  const status = getAllocationStatus(readyToAssignCents);

  return {
    totalIncomeCents,
    totalAllocatedCents,
    readyToAssignCents,
    status,
    allocations,
  };
}
