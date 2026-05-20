// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { FlexBucket } from '../advanced-types';
import { FlexBucketType } from '../advanced-types';
import { bucketAvailable, calculateFlexSummary, calculateRollovers } from '../flex-budgeting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBucket(overrides: Partial<FlexBucket> & { id: string }): FlexBucket {
  return {
    name: 'Test',
    type: FlexBucketType.FLEXIBLE,
    targetCents: 0,
    spentCents: 0,
    rolloverCents: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateFlexSummary
// ---------------------------------------------------------------------------

describe('calculateFlexSummary', () => {
  it('calculates flexible available from income minus fixed and non-monthly', () => {
    const buckets: FlexBucket[] = [
      makeBucket({ id: 'rent', name: 'Rent', type: FlexBucketType.FIXED, targetCents: 150_000 }),
      makeBucket({
        id: 'insurance',
        name: 'Insurance',
        type: FlexBucketType.NON_MONTHLY,
        targetCents: 10_000,
      }),
      makeBucket({
        id: 'food',
        name: 'Food',
        type: FlexBucketType.FLEXIBLE,
        targetCents: 50_000,
        spentCents: 20_000,
      }),
    ];

    const result = calculateFlexSummary(500_000, buckets);

    expect(result.totalFixedCents).toBe(150_000);
    expect(result.totalNonMonthlyCents).toBe(10_000);
    expect(result.flexibleAvailableCents).toBe(340_000);
    expect(result.buckets).toHaveLength(3);
  });

  it('calculates per-bucket available balance with rollover', () => {
    const buckets: FlexBucket[] = [
      makeBucket({
        id: 'food',
        type: FlexBucketType.FLEXIBLE,
        targetCents: 50_000,
        spentCents: 30_000,
        rolloverCents: 10_000,
      }),
    ];

    const result = calculateFlexSummary(100_000, buckets);
    const food = result.buckets[0];

    expect(food.availableCents).toBe(30_000); // 50000 + 10000 - 30000
  });

  it('handles empty buckets', () => {
    const result = calculateFlexSummary(100_000, []);

    expect(result.totalFixedCents).toBe(0);
    expect(result.totalNonMonthlyCents).toBe(0);
    expect(result.flexibleAvailableCents).toBe(100_000);
    expect(result.buckets).toEqual([]);
  });

  it('handles negative flexible available (over-committed)', () => {
    const buckets: FlexBucket[] = [
      makeBucket({ id: 'a', type: FlexBucketType.FIXED, targetCents: 80_000 }),
      makeBucket({ id: 'b', type: FlexBucketType.FIXED, targetCents: 80_000 }),
    ];

    const result = calculateFlexSummary(100_000, buckets);
    expect(result.flexibleAvailableCents).toBe(-60_000);
  });
});

// ---------------------------------------------------------------------------
// calculateRollovers
// ---------------------------------------------------------------------------

describe('calculateRollovers', () => {
  it('rolls over unused flexible spending', () => {
    const buckets: FlexBucket[] = [
      makeBucket({
        id: 'food',
        type: FlexBucketType.FLEXIBLE,
        targetCents: 50_000,
        spentCents: 30_000,
        rolloverCents: 5_000,
      }),
    ];

    const result = calculateRollovers(buckets);

    expect(result[0].rolloverCents).toBe(25_000); // 50000 + 5000 - 30000
    expect(result[0].spentCents).toBe(0);
  });

  it('rolls over negative (overspent) balance', () => {
    const buckets: FlexBucket[] = [
      makeBucket({
        id: 'food',
        type: FlexBucketType.FLEXIBLE,
        targetCents: 30_000,
        spentCents: 50_000,
        rolloverCents: 0,
      }),
    ];

    const result = calculateRollovers(buckets);

    expect(result[0].rolloverCents).toBe(-20_000);
  });

  it('resets fixed buckets (no rollover)', () => {
    const buckets: FlexBucket[] = [
      makeBucket({
        id: 'rent',
        type: FlexBucketType.FIXED,
        targetCents: 150_000,
        spentCents: 150_000,
        rolloverCents: 5_000,
      }),
    ];

    const result = calculateRollovers(buckets);

    expect(result[0].rolloverCents).toBe(0);
    expect(result[0].spentCents).toBe(0);
  });

  it('resets non-monthly buckets', () => {
    const buckets: FlexBucket[] = [
      makeBucket({
        id: 'ins',
        type: FlexBucketType.NON_MONTHLY,
        targetCents: 10_000,
        spentCents: 0,
        rolloverCents: 10_000,
      }),
    ];

    const result = calculateRollovers(buckets);

    expect(result[0].rolloverCents).toBe(0);
  });

  it('does not mutate input', () => {
    const buckets: FlexBucket[] = [
      makeBucket({ id: 'a', type: FlexBucketType.FLEXIBLE, targetCents: 100, spentCents: 50 }),
    ];
    const originalSpent = buckets[0].spentCents;

    calculateRollovers(buckets);

    expect(buckets[0].spentCents).toBe(originalSpent);
  });
});

// ---------------------------------------------------------------------------
// bucketAvailable
// ---------------------------------------------------------------------------

describe('bucketAvailable', () => {
  it('calculates available balance', () => {
    expect(
      bucketAvailable(
        makeBucket({ id: 'a', targetCents: 100_00, spentCents: 40_00, rolloverCents: 10_00 }),
      ),
    ).toBe(70_00);
  });

  it('returns negative when overspent', () => {
    expect(bucketAvailable(makeBucket({ id: 'a', targetCents: 50_00, spentCents: 80_00 }))).toBe(
      -30_00,
    );
  });

  it('returns zero when fully spent', () => {
    expect(bucketAvailable(makeBucket({ id: 'a', targetCents: 100_00, spentCents: 100_00 }))).toBe(
      0,
    );
  });
});
