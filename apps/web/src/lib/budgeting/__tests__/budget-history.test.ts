// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { BudgetPeriodSnapshot } from '../advanced-types';
import {
  calculatePeriodDiff,
  copyForward,
  createEmptySnapshot,
  findPeriod,
  getAdjacentPeriods,
} from '../budget-history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAY_SNAPSHOT: BudgetPeriodSnapshot = {
  periodKey: '2025-05',
  allocations: [
    { categoryId: 'food', name: 'Food', budgetedCents: 60_000, spentCents: 55_000 },
    { categoryId: 'rent', name: 'Rent', budgetedCents: 150_000, spentCents: 150_000 },
    { categoryId: 'fun', name: 'Fun', budgetedCents: 30_000, spentCents: 25_000 },
  ],
  totalBudgetedCents: 240_000,
};

const JUNE_SNAPSHOT: BudgetPeriodSnapshot = {
  periodKey: '2025-06',
  allocations: [
    { categoryId: 'food', name: 'Food', budgetedCents: 65_000, spentCents: 0 },
    { categoryId: 'rent', name: 'Rent', budgetedCents: 150_000, spentCents: 0 },
    { categoryId: 'gym', name: 'Gym', budgetedCents: 5_000, spentCents: 0 },
  ],
  totalBudgetedCents: 220_000,
};

// ---------------------------------------------------------------------------
// copyForward
// ---------------------------------------------------------------------------

describe('copyForward', () => {
  it('copies allocations with spending reset to zero', () => {
    const result = copyForward(MAY_SNAPSHOT, '2025-06');

    expect(result.periodKey).toBe('2025-06');
    expect(result.allocations).toHaveLength(3);
    expect(result.totalBudgetedCents).toBe(240_000);

    for (const alloc of result.allocations) {
      expect(alloc.spentCents).toBe(0);
    }
  });

  it('preserves budgeted amounts', () => {
    const result = copyForward(MAY_SNAPSHOT, '2025-06');

    const food = result.allocations.find((a) => a.categoryId === 'food')!;
    expect(food.budgetedCents).toBe(60_000);
  });

  it('does not mutate the source', () => {
    const originalSpent = MAY_SNAPSHOT.allocations[0].spentCents;
    copyForward(MAY_SNAPSHOT, '2025-06');
    expect(MAY_SNAPSHOT.allocations[0].spentCents).toBe(originalSpent);
  });

  it('handles empty allocations', () => {
    const empty = createEmptySnapshot('2025-01');
    const result = copyForward(empty, '2025-02');

    expect(result.periodKey).toBe('2025-02');
    expect(result.allocations).toEqual([]);
    expect(result.totalBudgetedCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculatePeriodDiff
// ---------------------------------------------------------------------------

describe('calculatePeriodDiff', () => {
  it('identifies added, removed, and changed categories', () => {
    const diff = calculatePeriodDiff(MAY_SNAPSHOT, JUNE_SNAPSHOT);

    expect(diff.fromPeriodKey).toBe('2025-05');
    expect(diff.toPeriodKey).toBe('2025-06');

    // 'gym' is new in June
    const gym = diff.diffs.find((d) => d.categoryId === 'gym')!;
    expect(gym.isNew).toBe(true);
    expect(gym.toBudgetedCents).toBe(5_000);

    // 'fun' is removed in June
    const fun = diff.diffs.find((d) => d.categoryId === 'fun')!;
    expect(fun.isRemoved).toBe(true);
    expect(fun.fromBudgetedCents).toBe(30_000);
    expect(fun.toBudgetedCents).toBe(0);

    // 'food' changed
    const food = diff.diffs.find((d) => d.categoryId === 'food')!;
    expect(food.changeCents).toBe(5_000);
    expect(food.isNew).toBe(false);
    expect(food.isRemoved).toBe(false);

    // 'rent' unchanged
    const rent = diff.diffs.find((d) => d.categoryId === 'rent')!;
    expect(rent.changeCents).toBe(0);
  });

  it('calculates total budget change', () => {
    const diff = calculatePeriodDiff(MAY_SNAPSHOT, JUNE_SNAPSHOT);
    expect(diff.totalBudgetedChangeCents).toBe(-20_000); // 220k - 240k
  });

  it('handles identical periods', () => {
    const diff = calculatePeriodDiff(MAY_SNAPSHOT, MAY_SNAPSHOT);

    for (const d of diff.diffs) {
      expect(d.changeCents).toBe(0);
      expect(d.isNew).toBe(false);
      expect(d.isRemoved).toBe(false);
    }

    expect(diff.totalBudgetedChangeCents).toBe(0);
  });

  it('handles diff from empty to populated', () => {
    const empty = createEmptySnapshot('2025-04');
    const diff = calculatePeriodDiff(empty, MAY_SNAPSHOT);

    expect(diff.diffs.every((d) => d.isNew)).toBe(true);
    expect(diff.totalBudgetedChangeCents).toBe(240_000);
  });

  it('handles diff from populated to empty', () => {
    const empty = createEmptySnapshot('2025-07');
    const diff = calculatePeriodDiff(MAY_SNAPSHOT, empty);

    expect(diff.diffs.every((d) => d.isRemoved)).toBe(true);
    expect(diff.totalBudgetedChangeCents).toBe(-240_000);
  });
});

// ---------------------------------------------------------------------------
// findPeriod
// ---------------------------------------------------------------------------

describe('findPeriod', () => {
  const history = [MAY_SNAPSHOT, JUNE_SNAPSHOT];

  it('finds an existing period', () => {
    expect(findPeriod(history, '2025-05')).toBe(MAY_SNAPSHOT);
  });

  it('returns undefined for missing period', () => {
    expect(findPeriod(history, '2025-01')).toBeUndefined();
  });

  it('returns undefined for empty history', () => {
    expect(findPeriod([], '2025-05')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAdjacentPeriods
// ---------------------------------------------------------------------------

describe('getAdjacentPeriods', () => {
  const history = [createEmptySnapshot('2025-04'), MAY_SNAPSHOT, JUNE_SNAPSHOT];

  it('returns previous and next for middle period', () => {
    const { previousKey, nextKey } = getAdjacentPeriods(history, '2025-05');
    expect(previousKey).toBe('2025-04');
    expect(nextKey).toBe('2025-06');
  });

  it('returns null previousKey for first period', () => {
    const { previousKey, nextKey } = getAdjacentPeriods(history, '2025-04');
    expect(previousKey).toBeNull();
    expect(nextKey).toBe('2025-05');
  });

  it('returns null nextKey for last period', () => {
    const { previousKey, nextKey } = getAdjacentPeriods(history, '2025-06');
    expect(previousKey).toBe('2025-05');
    expect(nextKey).toBeNull();
  });

  it('returns nulls for unknown period', () => {
    const { previousKey, nextKey } = getAdjacentPeriods(history, '2099-01');
    expect(previousKey).toBeNull();
    expect(nextKey).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createEmptySnapshot
// ---------------------------------------------------------------------------

describe('createEmptySnapshot', () => {
  it('creates an empty snapshot', () => {
    const snapshot = createEmptySnapshot('2025-07');
    expect(snapshot.periodKey).toBe('2025-07');
    expect(snapshot.allocations).toEqual([]);
    expect(snapshot.totalBudgetedCents).toBe(0);
  });
});
