// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for zero-based budgeting calculation engine.
 *
 * References: issue #1558
 */

import { describe, expect, it } from 'vitest';
import type { BudgetAllocation } from './budgeting-types';
import {
  bankersRound,
  calculateReadyToAssign,
  calculateZeroBasedSummary,
  getAllocationStatus,
} from './budgeting-zero-based';

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 0.5 to 0 (nearest even)', () => {
    expect(bankersRound(0.5)).toBe(0);
  });

  it('rounds 1.5 to 2 (nearest even)', () => {
    expect(bankersRound(1.5)).toBe(2);
  });

  it('rounds 2.5 to 2 (nearest even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (nearest even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds 4.5 to 4 (nearest even)', () => {
    expect(bankersRound(4.5)).toBe(4);
  });

  it('rounds normally below half', () => {
    expect(bankersRound(2.3)).toBe(2);
    expect(bankersRound(7.1)).toBe(7);
  });

  it('rounds normally above half', () => {
    expect(bankersRound(2.7)).toBe(3);
    expect(bankersRound(7.9)).toBe(8);
  });

  it('handles negative values with half', () => {
    expect(bankersRound(-0.5)).toBe(0);
    expect(bankersRound(-1.5)).toBe(-2);
    expect(bankersRound(-2.5)).toBe(-2);
  });

  it('passes through integers unchanged', () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(42)).toBe(42);
    expect(bankersRound(-7)).toBe(-7);
  });

  it('passes through NaN and Infinity', () => {
    expect(bankersRound(NaN)).toBeNaN();
    expect(bankersRound(Infinity)).toBe(Infinity);
    expect(bankersRound(-Infinity)).toBe(-Infinity);
  });
});

// ---------------------------------------------------------------------------
// calculateReadyToAssign
// ---------------------------------------------------------------------------

describe('calculateReadyToAssign', () => {
  it('returns income when there are no allocations', () => {
    expect(calculateReadyToAssign(500_000, [])).toBe(500_000);
  });

  it('returns zero when fully allocated', () => {
    const allocs: BudgetAllocation[] = [
      { categoryId: '1', name: 'Rent', allocatedCents: 300_000, spentCents: 0 },
      { categoryId: '2', name: 'Food', allocatedCents: 200_000, spentCents: 0 },
    ];
    expect(calculateReadyToAssign(500_000, allocs)).toBe(0);
  });

  it('returns positive when under-allocated', () => {
    const allocs: BudgetAllocation[] = [
      { categoryId: '1', name: 'Rent', allocatedCents: 300_000, spentCents: 0 },
    ];
    expect(calculateReadyToAssign(500_000, allocs)).toBe(200_000);
  });

  it('returns negative when over-allocated', () => {
    const allocs: BudgetAllocation[] = [
      { categoryId: '1', name: 'Rent', allocatedCents: 600_000, spentCents: 0 },
    ];
    expect(calculateReadyToAssign(500_000, allocs)).toBe(-100_000);
  });
});

// ---------------------------------------------------------------------------
// getAllocationStatus
// ---------------------------------------------------------------------------

describe('getAllocationStatus', () => {
  it('returns fully-allocated for zero', () => {
    expect(getAllocationStatus(0)).toBe('fully-allocated');
  });

  it('returns under-allocated for positive values', () => {
    expect(getAllocationStatus(1)).toBe('under-allocated');
    expect(getAllocationStatus(100_000)).toBe('under-allocated');
  });

  it('returns over-allocated for negative values', () => {
    expect(getAllocationStatus(-1)).toBe('over-allocated');
    expect(getAllocationStatus(-100_000)).toBe('over-allocated');
  });
});

// ---------------------------------------------------------------------------
// calculateZeroBasedSummary
// ---------------------------------------------------------------------------

describe('calculateZeroBasedSummary', () => {
  it('produces a fully-allocated summary', () => {
    const allocs: BudgetAllocation[] = [
      { categoryId: '1', name: 'Rent', allocatedCents: 150_000, spentCents: 140_000 },
      { categoryId: '2', name: 'Food', allocatedCents: 50_000, spentCents: 30_000 },
    ];
    const summary = calculateZeroBasedSummary(200_000, allocs);

    expect(summary.totalIncomeCents).toBe(200_000);
    expect(summary.totalAllocatedCents).toBe(200_000);
    expect(summary.readyToAssignCents).toBe(0);
    expect(summary.status).toBe('fully-allocated');
    expect(summary.allocations).toEqual(allocs);
  });

  it('marks under-allocated when income exceeds allocations', () => {
    const summary = calculateZeroBasedSummary(500_000, [
      { categoryId: '1', name: 'Rent', allocatedCents: 300_000, spentCents: 0 },
    ]);

    expect(summary.status).toBe('under-allocated');
    expect(summary.readyToAssignCents).toBe(200_000);
  });

  it('marks over-allocated when allocations exceed income', () => {
    const summary = calculateZeroBasedSummary(100_000, [
      { categoryId: '1', name: 'Rent', allocatedCents: 150_000, spentCents: 0 },
    ]);

    expect(summary.status).toBe('over-allocated');
    expect(summary.readyToAssignCents).toBe(-50_000);
  });

  it('handles empty allocations', () => {
    const summary = calculateZeroBasedSummary(300_000, []);

    expect(summary.totalAllocatedCents).toBe(0);
    expect(summary.readyToAssignCents).toBe(300_000);
    expect(summary.status).toBe('under-allocated');
  });

  it('handles zero income', () => {
    const summary = calculateZeroBasedSummary(0, []);

    expect(summary.readyToAssignCents).toBe(0);
    expect(summary.status).toBe('fully-allocated');
  });
});
