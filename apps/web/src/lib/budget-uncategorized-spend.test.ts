// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  computeUncategorizedSpend,
  type UncategorizedSpendTransaction,
} from './budget-uncategorized-spend';

const reference = new Date(2026, 10, 15);

function tx(overrides: Partial<UncategorizedSpendTransaction> = {}): UncategorizedSpendTransaction {
  return {
    type: 'EXPENSE',
    amountCents: 1_234,
    date: '2026-11-05',
    categoryId: null,
    deleted: false,
    ...overrides,
  };
}

describe('computeUncategorizedSpend', () => {
  it('sums uncategorized expenses in the month using absolute integer cents', () => {
    expect(
      computeUncategorizedSpend([tx(), tx({ amountCents: -766, categoryId: '' })], reference),
    ).toBe(2_000);
  });

  it('ignores categorized, income, deleted, and out-of-month rows', () => {
    expect(
      computeUncategorizedSpend(
        [
          tx({ categoryId: 'cat-1' }),
          tx({ type: 'INCOME' }),
          tx({ deleted: true }),
          tx({ date: '2026-10-31' }),
          tx({ date: '2026-12-01' }),
        ],
        reference,
      ),
    ).toBe(0);
  });

  it('counts only uncategorized portions of split transactions', () => {
    expect(
      computeUncategorizedSpend(
        [
          tx({
            amountCents: 1_000,
            splits: [
              { categoryId: 'cat-1', amountCents: 600 },
              { categoryId: null, amountCents: 400 },
            ],
          }),
        ],
        reference,
      ),
    ).toBe(400);
  });

  it('returns 0 for no transactions', () => {
    expect(computeUncategorizedSpend([], reference)).toBe(0);
  });
});
