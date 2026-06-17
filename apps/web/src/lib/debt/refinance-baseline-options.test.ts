// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildRefinanceBaselineOptions,
  resolveRefinanceBaselinePaymentCents,
} from './refinance-baseline-options';
import type { StudentLoan, StudentLoanDashboardSummary } from '../debt-types';

const loans: StudentLoan[] = [
  {
    id: 'loan',
    name: 'Loan',
    servicer: 'Servicer',
    balanceCents: 10_000_00,
    annualRateBps: 500,
    minimumPaymentCents: 125_00,
    status: 'in_repayment',
    originalBalanceCents: 12_000_00,
    isFederal: true,
    isPslfEligible: true,
    pslfPaymentsMade: 24,
  },
];

const summary: StudentLoanDashboardSummary = {
  monthlyPaymentCents: 125_00,
  monthsToPayoff: 100,
  estimatedPayoffDate: '2033-01-01',
  totalInterestCents: 1_000_00,
  totalBalanceCents: 10_000_00,
  totalOriginalBalanceCents: 12_000_00,
  weightedAverageRateBps: 500,
  percentPaidOff: 16.7,
};

describe('refinance baseline options', () => {
  it('lets refinance compare against current, strategy, or student-loan baselines', () => {
    const options = buildRefinanceBaselineOptions({
      loans,
      studentLoanSummary: summary,
      selectedPayoffStrategyPaymentCents: 200_00,
    });

    expect(options.map((option) => option.id)).toEqual([
      'current_required',
      'selected_payoff_strategy',
      'student_loan_baseline',
    ]);
    expect(resolveRefinanceBaselinePaymentCents(options, 'selected_payoff_strategy')).toBe(200_00);
  });
});
