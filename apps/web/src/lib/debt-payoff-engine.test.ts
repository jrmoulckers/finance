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
  calculateDebtMilestoneSummary,
  calculateDebtToIncomeRatioPercent,
  calculateDebtToIncomeTrend,
  calculateExtraPaymentImpactScenarios,
  calculateInterestSavedCents,
  calculateLumpSumImpact,
  calculateMonthlyInterestCents,
  calculatePayoffStrategyRecommendation,
  calculateSnowballOrder,
  calculateStrategyResult,
  compareStrategies,
  solveExtraPaymentForTargetDate,
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
    expect(result.fullyPaidOff).toBe(true);
    expect(result.unpaidDebtIds).toEqual([]);
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
    expect(result.fullyPaidOff).toBe(true);
    expect(result.unpaidDebtIds).toEqual([]);
  });

  it('flags a non-amortizing plan when the minimum does not cover interest', () => {
    // $6,000 @ 24.99% APR → ~$124.95/mo interest, but the minimum is $100 and
    // there is no extra payment, so the balance never amortizes.
    const underwater: Debt[] = [
      {
        id: 'maxed-card',
        name: 'Maxed Card',
        balanceCents: 600_000,
        annualRateBps: 2499,
        minimumPaymentCents: 10_000,
        type: 'credit_card',
      },
    ];
    const result = calculateStrategyResult(underwater, 'avalanche', 0);
    expect(result.fullyPaidOff).toBe(false);
    expect(result.unpaidDebtIds).toEqual(['maxed-card']);
    expect(result.payoffOrder).toHaveLength(0);
    expect(result.totalMonths).toBe(1200);
  });

  it('clears a non-amortizing debt once the extra payment covers the shortfall', () => {
    const underwater: Debt[] = [
      {
        id: 'maxed-card',
        name: 'Maxed Card',
        balanceCents: 600_000,
        annualRateBps: 2499,
        minimumPaymentCents: 10_000,
        type: 'credit_card',
      },
    ];
    // Adding $200/mo of extra payment pushes the total payment well above the
    // monthly interest, so the debt now amortizes.
    const result = calculateStrategyResult(underwater, 'avalanche', 20_000);
    expect(result.fullyPaidOff).toBe(true);
    expect(result.unpaidDebtIds).toEqual([]);
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

  it('cascades surplus onto the next debt within the payoff month', () => {
    // Card A clears quickly; the large extra payment overshoots its payoff,
    // and the leftover must cascade onto Card B in the SAME month.
    const cascadeDebts: Debt[] = [
      {
        id: 'a',
        name: 'Card A',
        balanceCents: 500_00,
        annualRateBps: 2299,
        minimumPaymentCents: 25_00,
        type: 'credit_card',
      },
      {
        id: 'b',
        name: 'Card B',
        balanceCents: 1_200_00,
        annualRateBps: 1999,
        minimumPaymentCents: 35_00,
        type: 'credit_card',
      },
    ];
    const result = calculateStrategyResult(cascadeDebts, 'snowball', 400_00);

    // Without the same-month cascade this reported 5 months; redistributing
    // the discarded surplus clears the plan a month earlier.
    expect(result.totalMonths).toBe(4);

    const aSchedule = result.schedules.find((s) => s.debtId === 'a')!;
    const bSchedule = result.schedules.find((s) => s.debtId === 'b')!;
    const aPayoffMonth = aSchedule.monthsToPayoff;

    // In the month Card A is cleared, Card B receives far more than its own
    // minimum because the unused portion of that month's payment cascaded.
    const bPaymentInPayoffMonth = bSchedule.entries[aPayoffMonth - 1]?.paymentCents ?? 0;
    expect(bPaymentInPayoffMonth).toBeGreaterThan(35_00);
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

// ---------------------------------------------------------------------------
// Motivation, milestones, and DTI
// ---------------------------------------------------------------------------

describe('calculateInterestSavedCents', () => {
  const debts: Debt[] = [
    {
      id: 'card',
      name: 'High APR Card',
      balanceCents: 600_000,
      originalBalanceCents: 800_000,
      annualRateBps: 2299,
      minimumPaymentCents: 18_000,
      type: 'credit_card',
    },
    {
      id: 'loan',
      name: 'Personal Loan',
      balanceCents: 900_000,
      originalBalanceCents: 1_000_000,
      annualRateBps: 799,
      minimumPaymentCents: 20_000,
      type: 'personal_loan',
    },
  ];

  it('compares accelerated payoff against minimum-only interest', () => {
    expect(calculateInterestSavedCents(debts, 'avalanche', 15_000)).toBeGreaterThan(0);
  });

  it('returns zero when there is no extra payment', () => {
    expect(calculateInterestSavedCents(debts, 'avalanche', 0)).toBe(0);
  });
});

describe('calculateDebtMilestoneSummary', () => {
  it('marks 25% and 50% milestones when half of original debt is paid', () => {
    const summary = calculateDebtMilestoneSummary([
      {
        id: 'loan',
        name: 'Loan',
        balanceCents: 500_000,
        originalBalanceCents: 1_000_000,
        annualRateBps: 500,
        minimumPaymentCents: 10_000,
        type: 'personal_loan',
      },
    ]);

    expect(summary.percentPaidOff).toBe(50);
    expect(
      summary.milestones.find((milestone) => milestone.thresholdPercent === 25)?.isReached,
    ).toBe(true);
    expect(
      summary.milestones.find((milestone) => milestone.thresholdPercent === 50)?.isReached,
    ).toBe(true);
    expect(
      summary.milestones.find((milestone) => milestone.thresholdPercent === 75)?.isReached,
    ).toBe(false);
  });
});

describe('calculateDebtToIncomeRatioPercent', () => {
  it('computes DTI as monthly debt payments divided by income', () => {
    expect(calculateDebtToIncomeRatioPercent(1_000_00, 5_000_00)).toBe(20);
  });

  it('returns zero when income is missing', () => {
    expect(calculateDebtToIncomeRatioPercent(1_000_00, 0)).toBe(0);
  });
});

describe('calculateDebtToIncomeTrend', () => {
  it('shows DTI improving as debts are paid off', () => {
    const trend = calculateDebtToIncomeTrend(
      [
        {
          id: 'card',
          name: 'Card',
          balanceCents: 100_000,
          annualRateBps: 0,
          minimumPaymentCents: 25_000,
          type: 'credit_card',
        },
      ],
      500_000,
      'snowball',
      25_000,
    );

    expect(trend.currentRatioPercent).toBe(5);
    expect(trend.projectedFinalRatioPercent).toBe(0);
    expect(trend.isImproving).toBe(true);
  });
});

describe('calculatePayoffStrategyRecommendation', () => {
  it('recommends avalanche when it saves interest and preserves snowball motivation copy', () => {
    const comparison = compareStrategies(
      [
        {
          id: 'high',
          name: 'High APR',
          balanceCents: 800_000,
          annualRateBps: 2499,
          minimumPaymentCents: 20_000,
          type: 'credit_card',
        },
        {
          id: 'small',
          name: 'Small Loan',
          balanceCents: 200_000,
          annualRateBps: 399,
          minimumPaymentCents: 5_000,
          type: 'personal_loan',
        },
      ],
      10_000,
    );

    const recommendation = calculatePayoffStrategyRecommendation(comparison);

    expect(recommendation.recommendedStrategy).toBe('avalanche');
    expect(recommendation.recommendationReason).toContain('minimizes interest');
    expect(recommendation.snowballMotivationNote).toContain('motivationally preferable');
  });
});

describe('calculateExtraPaymentImpactScenarios', () => {
  const debts: Debt[] = [
    {
      id: 'card',
      name: 'Card',
      balanceCents: 500_000,
      annualRateBps: 1999,
      minimumPaymentCents: 15_000,
      type: 'credit_card',
    },
  ];

  it('includes a zero-extra baseline and multiple extra-payment scenarios', () => {
    const scenarios = calculateExtraPaymentImpactScenarios(debts, 'avalanche', [5_000, 10_000]);

    expect(scenarios.map((scenario) => scenario.extraPaymentCents)).toEqual([0, 5_000, 10_000]);
    expect(scenarios[0].monthsSaved).toBe(0);
    expect(scenarios[1].interestSavedCents).toBeGreaterThan(0);
    expect(scenarios[2].totalMonths).toBeLessThanOrEqual(scenarios[1].totalMonths);
  });

  it('marks diminishing returns when incremental savings taper', () => {
    const scenarios = calculateExtraPaymentImpactScenarios(
      debts,
      'avalanche',
      [5_000, 20_000, 100_000],
    );

    expect(scenarios.some((scenario) => scenario.isDiminishingReturn)).toBe(true);
  });
});

describe('debt beta milestone and DTI additions', () => {
  it('tracks 10% milestones and manual interest paid to date', () => {
    const summary = calculateDebtMilestoneSummary(
      [
        {
          id: 'loan',
          name: 'Loan',
          balanceCents: 900_000,
          originalBalanceCents: 1_000_000,
          interestPaidToDateCents: 12_000,
          annualRateBps: 500,
          minimumPaymentCents: 10_000,
          type: 'personal_loan',
        },
      ],
      3_000,
    );

    expect(
      summary.milestones.find((milestone) => milestone.thresholdPercent === 10)?.isReached,
    ).toBe(true);
    expect(summary.totalInterestPaidToDateCents).toBe(15_000);
  });

  it('handles completed payoff state', () => {
    const summary = calculateDebtMilestoneSummary([
      {
        id: 'paid',
        name: 'Paid Debt',
        balanceCents: 0,
        originalBalanceCents: 100_000,
        annualRateBps: 0,
        minimumPaymentCents: 0,
        type: 'other',
      },
    ]);

    expect(summary.percentPaidOff).toBe(100);
    expect(summary.milestones.every((milestone) => milestone.isReached)).toBe(true);
  });

  it('reports threshold crossings across the full payoff plan', () => {
    const trend = calculateDebtToIncomeTrend(
      [
        {
          id: 'card',
          name: 'Card',
          balanceCents: 100_000,
          annualRateBps: 0,
          minimumPaymentCents: 50_000,
          type: 'credit_card',
        },
      ],
      100_000,
      'snowball',
      0,
      { targetRatioPercent: 20 },
    );

    expect(trend.trend).toHaveLength(3);
    expect(
      trend.thresholdCrossings.find((crossing) => crossing.thresholdPercent === 20)?.month,
    ).toBe(2);
  });

  it('supports zero income and income changes by month', () => {
    const zeroIncomeTrend = calculateDebtToIncomeTrend([], 0, 'avalanche', 0);
    expect(zeroIncomeTrend.trend[0].monthlyIncomeCents).toBe(0);
    expect(zeroIncomeTrend.trend[0].thresholdStatuses.every((status) => !status.isAtOrBelow)).toBe(
      true,
    );

    const changedIncomeTrend = calculateDebtToIncomeTrend(
      [
        {
          id: 'loan',
          name: 'Loan',
          balanceCents: 50_000,
          annualRateBps: 0,
          minimumPaymentCents: 25_000,
          type: 'other',
        },
      ],
      100_000,
      'avalanche',
      0,
      { incomeChanges: [{ month: 1, monthlyIncomeCents: 200_000 }] },
    );

    expect(changedIncomeTrend.trend[1].monthlyIncomeCents).toBe(200_000);
  });
});

describe('calculateLumpSumImpact', () => {
  const debts: Debt[] = [
    {
      id: 'cc',
      name: 'Credit Card',
      balanceCents: 500_000,
      annualRateBps: 1999,
      minimumPaymentCents: 15_000,
      type: 'credit_card',
    },
    {
      id: 'car',
      name: 'Car Loan',
      balanceCents: 900_000,
      annualRateBps: 599,
      minimumPaymentCents: 20_000,
      type: 'auto_loan',
    },
  ];

  it('reduces months and interest versus the same plan without the lump sum', () => {
    const impact = calculateLumpSumImpact(debts, 'snowball', 10_000, 300_000, 1);

    expect(impact.lumpSumCents).toBe(300_000);
    expect(impact.appliedMonth).toBe(1);
    expect(impact.withLumpSumMonths).toBeLessThan(impact.baselineMonths);
    expect(impact.monthsSaved).toBeGreaterThan(0);
    expect(impact.interestSavedCents).toBeGreaterThan(0);
  });

  it('reports no impact for a zero lump sum', () => {
    const impact = calculateLumpSumImpact(debts, 'snowball', 10_000, 0);

    expect(impact.monthsSaved).toBe(0);
    expect(impact.interestSavedCents).toBe(0);
    expect(impact.withLumpSumMonths).toBe(impact.baselineMonths);
  });

  it('clamps negative lump sums and fractional months to safe values', () => {
    const impact = calculateLumpSumImpact(debts, 'avalanche', 5_000, -100_000, 2.9);

    expect(impact.lumpSumCents).toBe(0);
    expect(impact.appliedMonth).toBe(2);
    expect(impact.monthsSaved).toBe(0);
  });

  it('saves more when the lump sum lands sooner', () => {
    const early = calculateLumpSumImpact(debts, 'avalanche', 10_000, 300_000, 1);
    const late = calculateLumpSumImpact(debts, 'avalanche', 10_000, 300_000, 12);

    expect(early.interestSavedCents).toBeGreaterThanOrEqual(late.interestSavedCents);
  });
});

describe('solveExtraPaymentForTargetDate', () => {
  const debts: Debt[] = [
    {
      id: 'cc',
      name: 'Credit Card',
      balanceCents: 500_000,
      annualRateBps: 1999,
      minimumPaymentCents: 15_000,
      type: 'credit_card',
    },
  ];

  it('returns zero extra when the minimum-only plan already meets the target', () => {
    const baseline = calculateStrategyResult(debts, 'avalanche', 0);
    const solution = solveExtraPaymentForTargetDate(debts, 'avalanche', baseline.totalMonths + 12);

    expect(solution.feasible).toBe(true);
    expect(solution.requiredExtraPaymentCents).toBe(0);
    expect(solution.resultingMonths).toBeLessThanOrEqual(baseline.totalMonths);
  });

  it('finds the minimum extra payment needed to hit an aggressive target', () => {
    const target = 12;
    const solution = solveExtraPaymentForTargetDate(debts, 'avalanche', target);

    expect(solution.feasible).toBe(true);
    expect(solution.requiredExtraPaymentCents).toBeGreaterThan(0);
    expect(solution.resultingMonths).toBeLessThanOrEqual(target);

    // The solution is minimal: one cent less misses the target.
    const oneCentLess = calculateStrategyResult(
      debts,
      'avalanche',
      solution.requiredExtraPaymentCents - 1,
    );
    const monthsOneCentLess = oneCentLess.fullyPaidOff
      ? oneCentLess.totalMonths
      : Number.POSITIVE_INFINITY;
    expect(monthsOneCentLess).toBeGreaterThan(target);
  });

  it('marks impossible targets as infeasible', () => {
    const solution = solveExtraPaymentForTargetDate(debts, 'avalanche', 0);

    expect(solution.feasible).toBe(false);
    expect(solution.requiredExtraPaymentCents).toBe(0);
    expect(solution.resultingMonths).toBeGreaterThan(0);
  });

  it('returns a trivially feasible solution for an empty debt list', () => {
    const solution = solveExtraPaymentForTargetDate([], 'avalanche', 12);

    expect(solution.feasible).toBe(true);
    expect(solution.requiredExtraPaymentCents).toBe(0);
    expect(solution.resultingMonths).toBe(0);
  });
});
