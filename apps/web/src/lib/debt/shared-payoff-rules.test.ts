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
});
