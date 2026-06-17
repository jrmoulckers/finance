// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateRefinanceBreakEven } from './refinance-break-even';
import type { StudentLoan } from '../debt-types';

const PRIVATE_LOANS: StudentLoan[] = [
  {
    id: 'private-a',
    name: 'Private Loan',
    servicer: 'Servicer',
    balanceCents: 20_000_00,
    annualRateBps: 900,
    minimumPaymentCents: 415_00,
    status: 'in_repayment',
    originalBalanceCents: 25_000_00,
    isFederal: false,
    isPslfEligible: false,
    pslfPaymentsMade: 0,
  },
];

const FEDERAL_PSLF_LOAN: StudentLoan = {
  ...PRIVATE_LOANS[0],
  id: 'federal-a',
  isFederal: true,
  isPslfEligible: true,
};

describe('calculateRefinanceBreakEven', () => {
  it('finds a positive break-even month when lower APR savings recoup fees', () => {
    const result = calculateRefinanceBreakEven({
      loans: PRIVATE_LOANS,
      refinanceAnnualRateBps: 500,
      refinanceTermMonths: 60,
      originationFeeCents: 300_00,
    });

    expect(result.monthlySavingsCents).toBeGreaterThan(0);
    expect(result.totalCostSavingsCents).toBeGreaterThan(0);
    expect(result.breakEvenMonth).not.toBeNull();
    expect(result.recommendation).toBe('consider');
  });

  it('reports no break-even when the override payment does not amortize', () => {
    const result = calculateRefinanceBreakEven({
      loans: PRIVATE_LOANS,
      refinanceAnnualRateBps: 1200,
      refinanceTermMonths: 60,
      monthlyPaymentOverrideCents: 10_00,
    });

    expect(result.refinance.monthsToPayoff).toBeNull();
    expect(result.breakEvenMonth).toBeNull();
    expect(result.warnings.map((warning) => warning.type)).toContain('non_amortizing_payment');
    expect(result.recommendation).toBe('avoid');
  });

  it('flags fee-heavy refinance scenarios that cost more over the lifetime', () => {
    const result = calculateRefinanceBreakEven({
      loans: PRIVATE_LOANS,
      refinanceAnnualRateBps: 850,
      refinanceTermMonths: 60,
      originationFeeCents: 4_000_00,
    });

    expect(result.totalCostSavingsCents).toBeLessThan(0);
    expect(result.breakEvenMonth).toBeNull();
    expect(result.warnings.map((warning) => warning.type)).toContain('higher_lifetime_cost');
  });

  it('warns about federal and PSLF benefit loss', () => {
    const result = calculateRefinanceBreakEven({
      loans: [FEDERAL_PSLF_LOAN],
      refinanceAnnualRateBps: 500,
      refinanceTermMonths: 60,
    });

    expect(result.warnings.map((warning) => warning.type)).toContain('federal_benefits_loss');
    expect(result.warnings.map((warning) => warning.type)).toContain('pslf_loss');
    expect(result.recommendation).toBe('avoid');
  });
});
