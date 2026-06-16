// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { compareConsolidationOffer } from './consolidation-comparison';
import type { Debt } from '../debt-types';

const DEBTS: Debt[] = [
  {
    id: 'card-a',
    name: 'Rewards Card',
    balanceCents: 600_000,
    annualRateBps: 2499,
    minimumPaymentCents: 18_000,
    type: 'credit_card',
  },
  {
    id: 'loan-b',
    name: 'Personal Loan',
    balanceCents: 400_000,
    annualRateBps: 1200,
    minimumPaymentCents: 14_000,
    type: 'personal_loan',
  },
];

describe('compareConsolidationOffer', () => {
  it('includes upfront fees in total paid and total cost', () => {
    const result = compareConsolidationOffer({
      debts: DEBTS,
      consolidationAnnualRateBps: 900,
      consolidationTermMonths: 36,
      originationFeeCents: 30_000,
      feeTreatment: 'paid_upfront',
    });

    expect(result.consolidation.upfrontFeeCents).toBe(30_000);
    expect(result.consolidation.financedFeeCents).toBe(0);
    expect(result.consolidation.totalCostCents).toBe(
      result.consolidation.totalInterestCents + 30_000,
    );
    expect(result.consolidation.totalPaidCents).toBeGreaterThan(
      result.consolidation.principalCents,
    );
  });

  it('flags offers that lower payments by extending the term and raising total cost', () => {
    const result = compareConsolidationOffer({
      debts: DEBTS,
      consolidationAnnualRateBps: 1800,
      consolidationTermMonths: 120,
      originationFeeCents: 20_000,
    });

    expect(result.monthlyPaymentDifferenceCents).toBeLessThan(0);
    expect(result.totalPaidDifferenceCents).toBeGreaterThan(0);
    expect(result.flags.map((flag) => flag.type)).toContain('lower_payment_higher_cost');
    expect(result.flags.map((flag) => flag.type)).toContain('longer_payoff');
    expect(result.recommendation).toBe('caution');
  });

  it('reports non-amortizing no-savings cases as avoid', () => {
    const result = compareConsolidationOffer({
      debts: DEBTS,
      consolidationAnnualRateBps: 3000,
      consolidationTermMonths: 60,
      monthlyPaymentTargetCents: 1_000,
    });

    expect(result.consolidation.monthsToPayoff).toBeNull();
    expect(result.flags.map((flag) => flag.type)).toContain('non_amortizing_payment');
    expect(result.recommendation).toBe('avoid');
  });
});
