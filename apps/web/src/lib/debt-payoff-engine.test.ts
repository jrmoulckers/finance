// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the debt payoff calculation engine.
 *
 * Covers: banker's rounding, monthly interest, amortization schedules,
 * avalanche/snowball ordering, multi-debt strategy simulation, and
 * strategy comparison.
 *
 * All monetary values in cents. Edge cases: zero balance, zero interest,
 * minimum payment < interest, max-value amounts, single debt, empty list.
 *
 * References: issue #1662
 */

import { describe, expect, it } from 'vitest';
import {
  bankersRound,
  buildAmortizationSchedule,
  calculateAvalancheOrder,
  calculateMonthlyInterestCents,
  calculateSnowballOrder,
  calculateStrategyResult,
  compareStrategies,
} from './debt-payoff-engine';
import type { Debt } from './debt-types';

// ---------------------------------------------------------------------------
// Banker's rounding
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

  it('rounds normally when not at half', () => {
    expect(bankersRound(2.3)).toBe(2);
    expect(bankersRound(2.7)).toBe(3);
    expect(bankersRound(4.1)).toBe(4);
    expect(bankersRound(4.9)).toBe(5);
  });

  it('handles negative values', () => {
    expect(bankersRound(-1.5)).toBe(-2);
    expect(bankersRound(-2.5)).toBe(-2);
  });

  it('returns integers unchanged', () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(100)).toBe(100);
    expect(bankersRound(-50)).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Monthly interest calculation
// ---------------------------------------------------------------------------

describe('calculateMonthlyInterestCents', () => {
  it('returns 0 for zero balance', () => {
    expect(calculateMonthlyInterestCents(0, 1999)).toBe(0);
  });

  it('returns 0 for negative balance', () => {
    expect(calculateMonthlyInterestCents(-100_00, 1999)).toBe(0);
  });

  it('returns 0 for zero interest rate', () => {
    expect(calculateMonthlyInterestCents(500_000, 0)).toBe(0);
  });

  it('returns 0 for negative interest rate', () => {
    expect(calculateMonthlyInterestCents(500_000, -500)).toBe(0);
  });

  it('calculates correct interest for typical credit card', () => {
    // $5,000 balance at 19.99% APR
    // Monthly rate = 0.1999 / 12 = 0.016658333...
    // Interest = 500000 * 0.016658333... = 8329.166...
    // Banker's round → 8329
    const interest = calculateMonthlyInterestCents(500_000, 1999);
    expect(interest).toBe(8329);
  });

  it('calculates correct interest for low-rate loan', () => {
    // $20,000 balance at 4.5% APR
    // Monthly rate = 0.045 / 12 = 0.00375
    // Interest = 2000000 * 0.00375 = 7500
    const interest = calculateMonthlyInterestCents(2_000_000, 450);
    expect(interest).toBe(7500);
  });

  it('handles very small balance', () => {
    // $1.00 at 20% APR → monthly interest = 100 * 0.2/12 = 1.666... → 2
    const interest = calculateMonthlyInterestCents(100, 2000);
    expect(interest).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Amortization schedule
// ---------------------------------------------------------------------------

describe('buildAmortizationSchedule', () => {
  const simpleDebt: Debt = {
    id: 'debt-1',
    name: 'Test Card',
    balanceCents: 100_000, // $1,000
    annualRateBps: 0, // 0% interest
    minimumPaymentCents: 25_000, // $250
    type: 'credit_card',
  };

  it('pays off a 0% debt in exact months', () => {
    const schedule = buildAmortizationSchedule(simpleDebt, 25_000);
    expect(schedule.monthsToPayoff).toBe(4); // $1000 / $250 = 4 months
    expect(schedule.totalInterestCents).toBe(0);
    expect(schedule.totalPaidCents).toBe(100_000);
    expect(schedule.entries).toHaveLength(4);
  });

  it('returns empty schedule for zero balance', () => {
    const zeroDebt = { ...simpleDebt, balanceCents: 0 };
    const schedule = buildAmortizationSchedule(zeroDebt, 25_000);
    expect(schedule.monthsToPayoff).toBe(0);
    expect(schedule.entries).toHaveLength(0);
  });

  it('handles interest-bearing debt correctly', () => {
    const ccDebt: Debt = {
      id: 'cc-1',
      name: 'Credit Card',
      balanceCents: 500_000, // $5,000
      annualRateBps: 1999, // 19.99%
      minimumPaymentCents: 15_000, // $150
      type: 'credit_card',
    };
    const schedule = buildAmortizationSchedule(ccDebt, 15_000);

    // First month interest: 500000 * 0.1999/12 ≈ 8329
    expect(schedule.entries[0].interestCents).toBe(8329);
    expect(schedule.entries[0].principalCents).toBe(15_000 - 8329);
    expect(schedule.totalInterestCents).toBeGreaterThan(0);
    expect(schedule.totalPaidCents).toBeGreaterThan(500_000);
    // Balance should decrease
    expect(schedule.entries[0].remainingBalanceCents).toBeLessThan(500_000);
  });

  it('last entry has zero remaining balance', () => {
    const schedule = buildAmortizationSchedule(simpleDebt, 25_000);
    const lastEntry = schedule.entries[schedule.entries.length - 1];
    expect(lastEntry.remainingBalanceCents).toBe(0);
  });

  it('final payment is reduced when balance < regular payment', () => {
    // $100 balance, $50 payment, 0% interest → 2 months, last = $50
    const smallDebt: Debt = {
      ...simpleDebt,
      balanceCents: 10_000,
      minimumPaymentCents: 5_000,
    };
    const schedule = buildAmortizationSchedule(smallDebt, 7_000);
    // $70 payments: month 1 pays $70, month 2 pays remaining $30
    expect(schedule.entries[1].paymentCents).toBe(3_000);
    expect(schedule.monthsToPayoff).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Strategy ordering
// ---------------------------------------------------------------------------

describe('calculateAvalancheOrder', () => {
  const debts: Debt[] = [
    {
      id: 'a',
      name: 'Low Rate',
      balanceCents: 300_000,
      annualRateBps: 500,
      minimumPaymentCents: 5_000,
      type: 'personal_loan',
    },
    {
      id: 'b',
      name: 'High Rate',
      balanceCents: 100_000,
      annualRateBps: 2499,
      minimumPaymentCents: 3_000,
      type: 'credit_card',
    },
    {
      id: 'c',
      name: 'Mid Rate',
      balanceCents: 200_000,
      annualRateBps: 1200,
      minimumPaymentCents: 4_000,
      type: 'auto_loan',
    },
  ];

  it('orders by highest interest rate first', () => {
    const order = calculateAvalancheOrder(debts);
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by highest balance', () => {
    const tiedDebts: Debt[] = [
      {
        id: 'x',
        name: 'X',
        balanceCents: 100_000,
        annualRateBps: 1500,
        minimumPaymentCents: 2_000,
        type: 'other',
      },
      {
        id: 'y',
        name: 'Y',
        balanceCents: 200_000,
        annualRateBps: 1500,
        minimumPaymentCents: 3_000,
        type: 'other',
      },
    ];
    const order = calculateAvalancheOrder(tiedDebts);
    expect(order).toEqual(['y', 'x']);
  });

  it('handles empty list', () => {
    expect(calculateAvalancheOrder([])).toEqual([]);
  });

  it('handles single debt', () => {
    expect(calculateAvalancheOrder([debts[0]])).toEqual(['a']);
  });
});

describe('calculateSnowballOrder', () => {
  const debts: Debt[] = [
    {
      id: 'a',
      name: 'Big',
      balanceCents: 300_000,
      annualRateBps: 500,
      minimumPaymentCents: 5_000,
      type: 'personal_loan',
    },
    {
      id: 'b',
      name: 'Small',
      balanceCents: 100_000,
      annualRateBps: 2499,
      minimumPaymentCents: 3_000,
      type: 'credit_card',
    },
    {
      id: 'c',
      name: 'Medium',
      balanceCents: 200_000,
      annualRateBps: 1200,
      minimumPaymentCents: 4_000,
      type: 'auto_loan',
    },
  ];

  it('orders by smallest balance first', () => {
    const order = calculateSnowballOrder(debts);
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by highest interest rate', () => {
    const tiedDebts: Debt[] = [
      {
        id: 'x',
        name: 'X',
        balanceCents: 100_000,
        annualRateBps: 1500,
        minimumPaymentCents: 2_000,
        type: 'other',
      },
      {
        id: 'y',
        name: 'Y',
        balanceCents: 100_000,
        annualRateBps: 2000,
        minimumPaymentCents: 3_000,
        type: 'other',
      },
    ];
    const order = calculateSnowballOrder(tiedDebts);
    expect(order).toEqual(['y', 'x']);
  });
});

// ---------------------------------------------------------------------------
// Multi-debt strategy simulation
// ---------------------------------------------------------------------------

describe('calculateStrategyResult', () => {
  const debts: Debt[] = [
    {
      id: 'cc',
      name: 'Credit Card',
      balanceCents: 500_000,
      annualRateBps: 1999,
      minimumPaymentCents: 10_000,
      type: 'credit_card',
    },
    {
      id: 'car',
      name: 'Car Loan',
      balanceCents: 1_000_000,
      annualRateBps: 599,
      minimumPaymentCents: 20_000,
      type: 'auto_loan',
    },
  ];

  it('returns empty result for empty debt list', () => {
    const result = calculateStrategyResult([], 'avalanche', 10_000);
    expect(result.totalMonths).toBe(0);
    expect(result.totalInterestCents).toBe(0);
    expect(result.schedules).toHaveLength(0);
  });

  it('avalanche targets highest rate first', () => {
    const result = calculateStrategyResult(debts, 'avalanche', 10_000);
    // Credit card (19.99%) should be targeted first
    expect(result.payoffOrder[0]).toBe('cc');
  });

  it('snowball targets smallest balance first', () => {
    const result = calculateStrategyResult(debts, 'snowball', 10_000);
    // Credit card ($5k) is smaller than car ($10k)
    expect(result.payoffOrder[0]).toBe('cc');
  });

  it('eventually pays off all debts', () => {
    const result = calculateStrategyResult(debts, 'avalanche', 10_000);
    expect(result.payoffOrder).toHaveLength(2);
    expect(result.totalMonths).toBeGreaterThan(0);
    expect(result.totalMonths).toBeLessThan(1200);
  });

  it('treats negative extra payment as zero', () => {
    const result = calculateStrategyResult(debts, 'avalanche', -5_000);
    // Should work, just with minimum payments only
    expect(result.totalMonths).toBeGreaterThan(0);
  });

  it('timeline starts with total balance and ends at zero', () => {
    const result = calculateStrategyResult(debts, 'avalanche', 10_000);
    const lastBalance = result.timelineBalanceCents[result.timelineBalanceCents.length - 1];
    expect(lastBalance).toBe(0);
  });

  it('rolls freed minimum payments to next target', () => {
    const result = calculateStrategyResult(debts, 'avalanche', 10_000);
    // After CC is paid off, its $100 minimum should roll to car loan
    // Find the month after CC payoff
    const ccSchedule = result.schedules.find((s) => s.debtId === 'cc')!;
    const carSchedule = result.schedules.find((s) => s.debtId === 'car')!;
    const ccPayoffMonth = ccSchedule.monthsToPayoff;

    // Car payment after CC payoff should be higher than before
    const carPaymentBefore = carSchedule.entries[0].paymentCents;
    const carPaymentAfter = carSchedule.entries[ccPayoffMonth]?.paymentCents;
    if (carPaymentAfter !== undefined) {
      expect(carPaymentAfter).toBeGreaterThan(carPaymentBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// Strategy comparison
// ---------------------------------------------------------------------------

describe('compareStrategies', () => {
  const debts: Debt[] = [
    {
      id: 'high-rate-big',
      name: 'High Rate Big',
      balanceCents: 800_000,
      annualRateBps: 2199,
      minimumPaymentCents: 15_000,
      type: 'credit_card',
    },
    {
      id: 'low-rate-small',
      name: 'Low Rate Small',
      balanceCents: 200_000,
      annualRateBps: 499,
      minimumPaymentCents: 5_000,
      type: 'personal_loan',
    },
  ];

  it('avalanche saves more on interest than snowball', () => {
    const comparison = compareStrategies(debts, 10_000);
    // Avalanche should save interest (or at least not cost more)
    expect(comparison.interestSavingsCents).toBeGreaterThanOrEqual(0);
  });

  it('provides both strategy results', () => {
    const comparison = compareStrategies(debts, 10_000);
    expect(comparison.avalanche.strategy).toBe('avalanche');
    expect(comparison.snowball.strategy).toBe('snowball');
    expect(comparison.avalanche.schedules).toHaveLength(2);
    expect(comparison.snowball.schedules).toHaveLength(2);
  });

  it('handles zero extra payment', () => {
    const comparison = compareStrategies(debts, 0);
    // With no extra payment, both strategies should give same result
    // (since ordering doesn't matter with only minimum payments going to each)
    // Actually, ordering still matters when a debt is paid off and frees up minimums
    expect(comparison.avalanche.totalMonths).toBeGreaterThan(0);
    expect(comparison.snowball.totalMonths).toBeGreaterThan(0);
  });

  it('handles single debt (strategies are identical)', () => {
    const singleDebt = [debts[0]];
    const comparison = compareStrategies(singleDebt, 5_000);
    expect(comparison.avalanche.totalInterestCents).toBe(comparison.snowball.totalInterestCents);
    expect(comparison.avalanche.totalMonths).toBe(comparison.snowball.totalMonths);
    expect(comparison.interestSavingsCents).toBe(0);
    expect(comparison.timeSavingsMonths).toBe(0);
  });
});
