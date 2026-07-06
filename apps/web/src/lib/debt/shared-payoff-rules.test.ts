// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateSharedPayoff, orderDebts } from './shared-payoff-rules';

const debts = [
  { id: 'card', balanceCents: 3000_00, annualRateBps: 1999, minimumPaymentCents: 120_00 },
  { id: 'loan', balanceCents: 1000_00, annualRateBps: 500, minimumPaymentCents: 75_00 },
];

describe('shared debt payoff rules', () => {
  it('orders avalanche, snowball, and custom strategies', () => {
    expect(orderDebts(debts, 'avalanche')).toEqual(['card', 'loan']);
    expect(orderDebts(debts, 'snowball')).toEqual(['loan', 'card']);
    expect(orderDebts(debts, 'custom', ['loan', 'card'])).toEqual(['loan', 'card']);
  });

  it('applies extra payments and reports freed cash flow', () => {
    const base = calculateSharedPayoff(debts, 'avalanche', 0);
    const extra = calculateSharedPayoff(debts, 'avalanche', 200_00);
    expect(extra.monthsToPayoff).toBeLessThan(base.monthsToPayoff);
    expect(extra.goalCashFlowFreedCents).toBe(395_00);
  });

  it('rolls freed minimum payments into the next debt (snowball)', () => {
    // Three debts, +$100/mo. As each debt clears, its minimum must roll into
    // the next target. Verified against a hand-run snowball: without rolling
    // this is 27 months / $937.85 interest; rolling clears in 19 / $738.41.
    const threeDebts = [
      { id: 'card1', balanceCents: 2000_00, annualRateBps: 2299, minimumPaymentCents: 60_00 },
      { id: 'card2', balanceCents: 1200_00, annualRateBps: 1899, minimumPaymentCents: 40_00 },
      { id: 'loan', balanceCents: 800_00, annualRateBps: 999, minimumPaymentCents: 50_00 },
    ];
    const rolled = calculateSharedPayoff(threeDebts, 'snowball', 100_00);
    expect(rolled.monthsToPayoff).toBe(19);
    expect(rolled.totalInterestCents).toBe(73841);
  });
});
