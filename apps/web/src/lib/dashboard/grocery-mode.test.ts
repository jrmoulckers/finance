// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  bankersRound,
  computeSafeToSpend,
  estimateNextPayday,
  evaluateAffordability,
  parseAmountToCents,
  pinnedCategoryRemaining,
  type SafeToSpendInput,
  type UpcomingBillInput,
} from './grocery-mode';

function bill(overrides: Partial<UpcomingBillInput> = {}): UpcomingBillInput {
  return {
    id: 'bill-1',
    name: 'Rent',
    amountCents: 120_000,
    dueDate: '2025-07-04',
    critical: true,
    paid: false,
    ...overrides,
  };
}

function input(overrides: Partial<SafeToSpendInput> = {}): SafeToSpendInput {
  return {
    availableFundsCents: 500_00,
    reservedCents: 0,
    bills: [],
    today: '2025-07-01',
    nextPayday: '2025-07-05',
    pinnedCategory: null,
    ...overrides,
  };
}

describe('bankersRound', () => {
  it('rounds halves to the nearest even integer', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(-2.5)).toBe(-2);
    expect(bankersRound(-3.5)).toBe(-4);
  });

  it('rounds non-halves normally', () => {
    expect(bankersRound(2.4)).toBe(2);
    expect(bankersRound(2.6)).toBe(3);
    expect(bankersRound(-2.6)).toBe(-3);
  });

  it('returns 0 for non-finite input', () => {
    expect(bankersRound(Number.NaN)).toBe(0);
    expect(bankersRound(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('pinnedCategoryRemaining', () => {
  it('returns null when no category is pinned', () => {
    expect(pinnedCategoryRemaining(null)).toBeNull();
    expect(pinnedCategoryRemaining(undefined)).toBeNull();
  });

  it('computes remaining as budget minus spent', () => {
    const result = pinnedCategoryRemaining({
      categoryId: 'cat-1',
      name: 'Groceries',
      budgetCents: 60_000,
      spentCents: 42_350,
    });
    expect(result?.remainingCents).toBe(17_650);
  });

  it('clamps a fully-spent category to zero (never negative)', () => {
    const result = pinnedCategoryRemaining({
      categoryId: 'cat-1',
      name: 'Groceries',
      budgetCents: 60_000,
      spentCents: 75_000,
    });
    expect(result?.remainingCents).toBe(0);
  });

  it('normalises invalid amounts to non-negative integers', () => {
    const result = pinnedCategoryRemaining({
      categoryId: 'cat-1',
      name: 'Groceries',
      budgetCents: Number.NaN,
      spentCents: -500,
    });
    expect(result?.budgetCents).toBe(0);
    expect(result?.spentCents).toBe(0);
    expect(result?.remainingCents).toBe(0);
  });
});

describe('computeSafeToSpend', () => {
  it('computes a known value: funds minus critical bills minus reserved', () => {
    const result = computeSafeToSpend(
      input({
        availableFundsCents: 1_000_00,
        reservedCents: 50_00,
        bills: [
          bill({ id: 'b1', amountCents: 200_00, dueDate: '2025-07-03' }),
          bill({ id: 'b2', name: 'Power', amountCents: 75_00, dueDate: '2025-07-04' }),
        ],
        today: '2025-07-01',
        nextPayday: '2025-07-05',
      }),
    );
    // 100000 - (20000 + 7500) - 5000 = 67500
    expect(result.upcomingCriticalBillsCents).toBe(275_00);
    expect(result.reservedCents).toBe(50_00);
    expect(result.safeToSpendCents).toBe(675_00);
  });

  it('excludes bills due after the next payday', () => {
    const result = computeSafeToSpend(
      input({
        bills: [
          bill({ id: 'before', amountCents: 100_00, dueDate: '2025-07-04' }),
          bill({ id: 'after', amountCents: 999_00, dueDate: '2025-07-10' }),
        ],
        today: '2025-07-01',
        nextPayday: '2025-07-05',
      }),
    );
    expect(result.upcomingCriticalBillsCents).toBe(100_00);
    expect(result.upcomingBills).toHaveLength(1);
    expect(result.upcomingBills[0].id).toBe('before');
  });

  it('excludes bills due before today (already passed)', () => {
    const result = computeSafeToSpend(
      input({
        bills: [bill({ id: 'past', amountCents: 100_00, dueDate: '2025-06-28' })],
        today: '2025-07-01',
        nextPayday: '2025-07-05',
      }),
    );
    expect(result.upcomingCriticalBillsCents).toBe(0);
    expect(result.upcomingBills).toHaveLength(0);
  });

  it('excludes paid and non-critical bills', () => {
    const result = computeSafeToSpend(
      input({
        bills: [
          bill({ id: 'paid', amountCents: 100_00, dueDate: '2025-07-03', paid: true }),
          bill({ id: 'optional', amountCents: 100_00, dueDate: '2025-07-03', critical: false }),
          bill({ id: 'counted', amountCents: 25_00, dueDate: '2025-07-03' }),
        ],
      }),
    );
    expect(result.upcomingCriticalBillsCents).toBe(25_00);
    expect(result.upcomingBills.map((b) => b.id)).toEqual(['counted']);
  });

  it('sorts upcoming bills by soonest due date first', () => {
    const result = computeSafeToSpend(
      input({
        bills: [
          bill({ id: 'late', dueDate: '2025-07-04', amountCents: 10_00 }),
          bill({ id: 'early', dueDate: '2025-07-02', amountCents: 10_00 }),
          bill({ id: 'mid', dueDate: '2025-07-03', amountCents: 10_00 }),
        ],
      }),
    );
    expect(result.upcomingBills.map((b) => b.id)).toEqual(['early', 'mid', 'late']);
  });

  it('handles no upcoming bills (safe to spend equals available funds)', () => {
    const result = computeSafeToSpend(
      input({ availableFundsCents: 320_00, reservedCents: 0, bills: [] }),
    );
    expect(result.upcomingCriticalBillsCents).toBe(0);
    expect(result.safeToSpendCents).toBe(320_00);
  });

  it('allows a negative safe-to-spend when bills exceed available funds', () => {
    const result = computeSafeToSpend(
      input({
        availableFundsCents: 50_00,
        bills: [bill({ amountCents: 200_00, dueDate: '2025-07-03' })],
      }),
    );
    expect(result.safeToSpendCents).toBe(-150_00);
  });

  it('preserves a genuinely negative (overdrawn) available balance', () => {
    const result = computeSafeToSpend(input({ availableFundsCents: -25_00, bills: [] }));
    expect(result.availableFundsCents).toBe(-25_00);
    expect(result.safeToSpendCents).toBe(-25_00);
  });

  it('includes all upcoming critical bills when no payday is known', () => {
    const result = computeSafeToSpend(
      input({
        bills: [
          bill({ id: 'b1', amountCents: 100_00, dueDate: '2025-07-03' }),
          bill({ id: 'b2', amountCents: 200_00, dueDate: '2025-09-01' }),
        ],
        nextPayday: null,
      }),
    );
    expect(result.hasPayday).toBe(false);
    expect(result.daysUntilPayday).toBeNull();
    expect(result.dailyAllowanceCents).toBeNull();
    expect(result.upcomingCriticalBillsCents).toBe(300_00);
  });

  it('reports whole days until payday', () => {
    const result = computeSafeToSpend(input({ today: '2025-07-01', nextPayday: '2025-07-05' }));
    expect(result.daysUntilPayday).toBe(4);
  });

  it("computes a per-day allowance with banker's rounding", () => {
    // 10 cents over 4 days = 2.5 -> rounds to even (2)
    const result = computeSafeToSpend(
      input({ availableFundsCents: 10, bills: [], today: '2025-07-01', nextPayday: '2025-07-05' }),
    );
    expect(result.safeToSpendCents).toBe(10);
    expect(result.daysUntilPayday).toBe(4);
    expect(result.dailyAllowanceCents).toBe(2);
  });

  it('omits the per-day allowance when safe-to-spend is not positive', () => {
    const result = computeSafeToSpend(
      input({
        availableFundsCents: 0,
        bills: [bill({ amountCents: 100, dueDate: '2025-07-03' })],
      }),
    );
    expect(result.safeToSpendCents).toBeLessThan(0);
    expect(result.dailyAllowanceCents).toBeNull();
  });

  it('surfaces the pinned category remaining alongside the answer', () => {
    const result = computeSafeToSpend(
      input({
        availableFundsCents: 400_00,
        pinnedCategory: {
          categoryId: 'cat-groceries',
          name: 'Groceries',
          budgetCents: 60_000,
          spentCents: 38_000,
        },
      }),
    );
    expect(result.pinnedCategory?.name).toBe('Groceries');
    expect(result.pinnedCategory?.remainingCents).toBe(22_000);
    // Pinned category does not reduce the headline safe-to-spend figure.
    expect(result.safeToSpendCents).toBe(400_00);
  });

  it('returns a null pinned category when none is selected', () => {
    const result = computeSafeToSpend(input({ pinnedCategory: null }));
    expect(result.pinnedCategory).toBeNull();
  });

  it('normalises non-finite and fractional inputs to integer cents', () => {
    const result = computeSafeToSpend(
      input({
        availableFundsCents: 100.9,
        reservedCents: Number.NaN,
        bills: [bill({ amountCents: -50, dueDate: '2025-07-03' })],
      }),
    );
    expect(result.availableFundsCents).toBe(100);
    expect(result.reservedCents).toBe(0);
    expect(result.upcomingCriticalBillsCents).toBe(0);
  });
});

describe('evaluateAffordability', () => {
  it('says yes when the purchase fits and reports what is left', () => {
    const result = evaluateAffordability(100_00, 30_00);
    expect(result.affordable).toBe(true);
    expect(result.remainingAfterCents).toBe(70_00);
    expect(result.shortfallCents).toBe(0);
  });

  it('treats spending down to exactly zero as affordable', () => {
    const result = evaluateAffordability(50_00, 50_00);
    expect(result.affordable).toBe(true);
    expect(result.remainingAfterCents).toBe(0);
  });

  it('says no when the purchase exceeds the safe-to-spend amount', () => {
    const result = evaluateAffordability(40_00, 65_00);
    expect(result.affordable).toBe(false);
    expect(result.remainingAfterCents).toBe(-25_00);
    expect(result.shortfallCents).toBe(25_00);
  });

  it('is never affordable against a negative safe-to-spend amount', () => {
    const result = evaluateAffordability(-10_00, 0);
    expect(result.amountCents).toBe(0);
    expect(result.affordable).toBe(false);
    expect(result.shortfallCents).toBe(10_00);
  });

  it('normalises a negative or fractional requested amount', () => {
    expect(evaluateAffordability(100_00, -20).amountCents).toBe(0);
    expect(evaluateAffordability(100_00, 12.99).amountCents).toBe(12);
  });
});

describe('parseAmountToCents', () => {
  it('returns null for empty or malformed input', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
    expect(parseAmountToCents('.')).toBeNull();
  });

  it('parses whole and decimal dollar amounts to integer cents', () => {
    expect(parseAmountToCents('45')).toBe(45_00);
    expect(parseAmountToCents('45.5')).toBe(45_50);
    expect(parseAmountToCents('45.50')).toBe(45_50);
    expect(parseAmountToCents('.99')).toBe(99);
    expect(parseAmountToCents('0')).toBe(0);
  });

  it('tolerates currency symbols, commas and whitespace', () => {
    expect(parseAmountToCents(' $1,234.56 ')).toBe(1_234_56);
  });

  it("applies banker's rounding on the sub-cent digit", () => {
    // 1.225 -> 122 (ties to even), 1.235 -> 124 (ties to even)
    expect(parseAmountToCents('1.225')).toBe(122);
    expect(parseAmountToCents('1.235')).toBe(124);
    // a non-tie above five always rounds up
    expect(parseAmountToCents('1.226')).toBe(123);
  });
});

describe('estimateNextPayday', () => {
  it('returns null when there are no income dates', () => {
    expect(estimateNextPayday([], '2025-07-01')).toBeNull();
  });

  it('returns null when today is invalid', () => {
    expect(estimateNextPayday(['2025-06-15'], 'not-a-date')).toBeNull();
  });

  it('projects a biweekly cadence forward past today', () => {
    const next = estimateNextPayday(['2025-06-06', '2025-06-20', '2025-07-04'], '2025-07-10');
    // 14-day cadence from 2025-07-04 -> next after today is 2025-07-18
    expect(next).toBe('2025-07-18');
  });

  it('assumes a monthly cadence from a single paycheck', () => {
    const next = estimateNextPayday(['2025-06-15'], '2025-07-01');
    expect(next).toBe('2025-07-15');
  });

  it('snaps a near-weekly cadence to seven days', () => {
    const next = estimateNextPayday(['2025-07-01', '2025-07-09'], '2025-07-10');
    // gap is 8 days, snapped to 7 -> from 2025-07-09 next is 2025-07-16
    expect(next).toBe('2025-07-16');
  });

  it('ignores unparseable income dates', () => {
    const next = estimateNextPayday(['bad', '2025-06-15', ''], '2025-07-01');
    expect(next).toBe('2025-07-15');
  });
});
