// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateRefinanceBreakEven } from './refinance-break-even';
import { buildRefinanceBreakEvenPanelModel } from './refinance-break-even-panel';
import type { StudentLoan } from '../debt-types';

const loans: StudentLoan[] = [
  {
    id: 'loan',
    name: 'Loan',
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

describe('buildRefinanceBreakEvenPanelModel', () => {
  it('exposes break-even savings, warnings, assumptions, and recommendation for the UI', () => {
    const result = calculateRefinanceBreakEven({
      loans,
      refinanceAnnualRateBps: 500,
      refinanceTermMonths: 60,
      originationFeeCents: 300_00,
    });
    const model = buildRefinanceBreakEvenPanelModel(result);

    expect(model.monthlySavingsCents).toBe(result.monthlySavingsCents);
    expect(model.totalCostSavingsCents).toBe(result.totalCostSavingsCents);
    expect(model.breakEvenMonth).toBe(result.breakEvenMonth);
    expect(model.assumptions).toContain('Fees are paid upfront at month 0.');
    expect(model.recommendation).toBe('consider');
  });
});
