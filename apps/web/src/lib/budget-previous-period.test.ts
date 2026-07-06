// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computePreviousPeriodSpending,
  type PreviousPeriodTransaction,
} from './budget-previous-period';

const categoryNameById = new Map<string, string>([
  ['cat-a', 'Groceries'],
  ['cat-b', 'Gas'],
]);

function tx(overrides: Partial<PreviousPeriodTransaction>): PreviousPeriodTransaction {
  return {
    type: 'EXPENSE',
    amountCents: 0,
    date: '2026-02-15',
    categoryId: 'cat-a',
    deleted: false,
    ...overrides,
  };
}

describe('computePreviousPeriodSpending', () => {
  it('sums previous-month expenses by category using absolute amounts (#3363)', () => {
    const reference = new Date(2026, 2, 15); // March 2026 → previous month February
    const result = computePreviousPeriodSpending(
      [
        tx({ amountCents: 10_000, categoryId: 'cat-a' }),
        tx({ amountCents: -5_000, categoryId: 'cat-b' }), // negative outflow → abs
        tx({ amountCents: 1_000, categoryId: null }), // uncategorized
        tx({ type: 'INCOME', amountCents: 20_000 }), // ignored: not an expense
        tx({ amountCents: 3_000, deleted: true }), // ignored: soft-deleted
        tx({ amountCents: 99_900, date: '2026-03-02' }), // ignored: current month
        tx({ amountCents: 4_000, date: '2026-01-20' }), // ignored: older period
      ],
      categoryNameById,
      reference,
    );

    expect(result.previousPeriodSpent).toBe(16_000);
    expect(result.previousCategorySpending.get('Groceries')).toBe(10_000);
    expect(result.previousCategorySpending.get('Gas')).toBe(5_000);
    expect(result.previousCategorySpending.get('Uncategorized')).toBe(1_000);
  });

  it('returns null and an empty map when there is no prior-period data', () => {
    const reference = new Date(2026, 2, 15);
    const result = computePreviousPeriodSpending(
      [tx({ amountCents: 5_000, date: '2026-03-10' })],
      categoryNameById,
      reference,
    );

    expect(result.previousPeriodSpent).toBeNull();
    expect(result.previousCategorySpending.size).toBe(0);
  });

  it('handles the January year boundary (previous month is December of prior year)', () => {
    const reference = new Date(2026, 0, 10); // January 2026 → previous month December 2025
    const result = computePreviousPeriodSpending(
      [
        tx({ amountCents: 7_000, date: '2025-12-31', categoryId: 'cat-a' }),
        tx({ amountCents: 8_000, date: '2025-11-30', categoryId: 'cat-a' }), // ignored: too old
        tx({ amountCents: 9_000, date: '2026-01-01', categoryId: 'cat-a' }), // ignored: current
      ],
      categoryNameById,
      reference,
    );

    expect(result.previousPeriodSpent).toBe(7_000);
    expect(result.previousCategorySpending.get('Groceries')).toBe(7_000);
  });
});
