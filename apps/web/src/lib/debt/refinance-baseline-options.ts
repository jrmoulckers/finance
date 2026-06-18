// SPDX-License-Identifier: BUSL-1.1

import type { StudentLoan, StudentLoanDashboardSummary } from '../debt-types';

export type RefinanceBaselineId =
  | 'current_required'
  | 'selected_payoff_strategy'
  | 'student_loan_baseline';

export interface RefinanceBaselineOption {
  readonly id: RefinanceBaselineId;
  readonly label: string;
  readonly monthlyPaymentCents: number;
  readonly description: string;
}

function sumRequiredPayments(loans: readonly StudentLoan[]): number {
  return loans.reduce((sum, loan) => sum + Math.max(0, loan.minimumPaymentCents), 0);
}

export function buildRefinanceBaselineOptions(input: {
  readonly loans: readonly StudentLoan[];
  readonly studentLoanSummary: StudentLoanDashboardSummary;
  readonly selectedPayoffStrategyPaymentCents?: number;
}): readonly RefinanceBaselineOption[] {
  const currentRequired = sumRequiredPayments(input.loans);
  const selectedStrategyPayment = Math.max(
    0,
    input.selectedPayoffStrategyPaymentCents ?? currentRequired,
  );
  return [
    {
      id: 'current_required',
      label: 'Current required payments',
      monthlyPaymentCents: currentRequired,
      description: 'Uses the required monthly payments entered for each loan.',
    },
    {
      id: 'selected_payoff_strategy',
      label: 'Selected payoff strategy',
      monthlyPaymentCents: selectedStrategyPayment,
      description: 'Uses the active payoff strategy baseline when one is supplied.',
    },
    {
      id: 'student_loan_baseline',
      label: 'Student-loan dashboard baseline',
      monthlyPaymentCents: input.studentLoanSummary.monthlyPaymentCents,
      description: 'Uses the dashboard payoff estimate as the comparison input.',
    },
  ];
}

export function resolveRefinanceBaselinePaymentCents(
  options: readonly RefinanceBaselineOption[],
  selectedId: RefinanceBaselineId,
): number {
  return (
    options.find((option) => option.id === selectedId) ??
    options.find((option) => option.id === 'current_required') ??
    options[0]
  ).monthlyPaymentCents;
}
