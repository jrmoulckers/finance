// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { computeCurrentPeriodIncome, type CurrentIncomeTransaction } from './budget-current-income';

const reference = new Date(2025, 2, 15); // March 2025

function tx(overrides: Partial<CurrentIncomeTransaction>): CurrentIncomeTransaction {
  return {
    type: 'INCOME',
    amountCents: 100000,
    date: '2025-03-05',
    deleted: false,
    ...overrides,
  };
}

describe('computeCurrentPeriodIncome', () => {
  it('sums INCOME transactions within the current month', () => {
    const total = computeCurrentPeriodIncome(
      [
        tx({ amountCents: 200000, date: '2025-03-01' }),
        tx({ amountCents: 150000, date: '2025-03-31' }),
      ],
      reference,
    );
    expect(total).toBe(350000);
  });

  it('ignores non-income, deleted, and out-of-month transactions', () => {
    const total = computeCurrentPeriodIncome(
      [
        tx({ type: 'EXPENSE', amountCents: 500000 }),
        tx({ deleted: true, amountCents: 500000 }),
        tx({ date: '2025-02-28', amountCents: 500000 }),
        tx({ date: '2025-04-01', amountCents: 500000 }),
        tx({ amountCents: 120000, date: '2025-03-10' }),
      ],
      reference,
    );
    expect(total).toBe(120000);
  });

  it('uses the absolute value of amounts', () => {
    expect(computeCurrentPeriodIncome([tx({ amountCents: -90000 })], reference)).toBe(90000);
  });

  it('returns 0 when there is no matching income', () => {
    expect(computeCurrentPeriodIncome([], reference)).toBe(0);
  });
});
