// SPDX-License-Identifier: BUSL-1.1

/**
 * Flex budgeting engine.
 *
 * Categorizes spending into fixed, non-monthly, and flexible buckets.
 * Fixed and non-monthly expenses are deducted from income first;
 * the remainder is available for flexible spending. Flex categories
 * support rollover of unused balances.
 *
 * All amounts are integer cents. Inputs are never mutated.
 *
 * References: #1563
 */

import type { FlexBucket, FlexBucketDetail, FlexBudgetSummary } from './advanced-types';
import { FlexBucketType } from './advanced-types';

// ---------------------------------------------------------------------------
// Summary calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a flex budget summary.
 *
 * Fixed and non-monthly targets are summed and subtracted from income
 * to determine the amount available for flexible spending.
 *
 * @param incomeCents - Total income for the period in cents.
 * @param buckets - Array of flex buckets.
 * @returns A {@link FlexBudgetSummary} with per-bucket details.
 */
export function calculateFlexSummary(
  incomeCents: number,
  buckets: readonly FlexBucket[],
): FlexBudgetSummary {
  const details: FlexBucketDetail[] = buckets.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    targetCents: b.targetCents,
    spentCents: b.spentCents,
    rolloverCents: b.rolloverCents,
    availableCents: b.targetCents + b.rolloverCents - b.spentCents,
  }));

  const totalFixedCents = buckets
    .filter((b) => b.type === FlexBucketType.FIXED)
    .reduce((sum, b) => sum + b.targetCents, 0);

  const totalNonMonthlyCents = buckets
    .filter((b) => b.type === FlexBucketType.NON_MONTHLY)
    .reduce((sum, b) => sum + b.targetCents, 0);

  const flexibleAvailableCents = incomeCents - totalFixedCents - totalNonMonthlyCents;

  return {
    incomeCents,
    totalFixedCents,
    totalNonMonthlyCents,
    flexibleAvailableCents,
    buckets: details,
  };
}

// ---------------------------------------------------------------------------
// Rollover calculation
// ---------------------------------------------------------------------------

/**
 * Calculate rollover amounts for the next period.
 *
 * Only {@link FlexBucketType.FLEXIBLE} buckets roll over unused balances.
 * Fixed and non-monthly buckets reset each period (rollover = 0).
 *
 * @param buckets - Current period's buckets.
 * @returns New buckets with rollover applied and spending reset to zero.
 */
export function calculateRollovers(buckets: readonly FlexBucket[]): readonly FlexBucket[] {
  return buckets.map((b) => {
    if (b.type === FlexBucketType.FLEXIBLE) {
      const unused = b.targetCents + b.rolloverCents - b.spentCents;
      return {
        ...b,
        rolloverCents: unused,
        spentCents: 0,
      };
    }
    // Fixed and non-monthly buckets reset
    return {
      ...b,
      rolloverCents: 0,
      spentCents: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Bucket available balance
// ---------------------------------------------------------------------------

/**
 * Calculate the available balance for a single flex bucket.
 *
 * @param bucket - The bucket to inspect.
 * @returns Available balance in cents (target + rollover − spent).
 */
export function bucketAvailable(bucket: FlexBucket): number {
  return bucket.targetCents + bucket.rolloverCents - bucket.spentCents;
}
