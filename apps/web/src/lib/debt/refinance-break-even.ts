// SPDX-License-Identifier: BUSL-1.1

/**
 * Student loan refinance break-even calculator.
 *
 * Models when lower refinance payments recoup fees and highlights federal-loan
 * benefit tradeoffs. All monetary values are integer cents.
 *
 * References: issue #2226
 */

import type { StudentLoan } from '../debt-types';
import { bankersRound, calculateMonthlyInterestCents } from '../debt-payoff-engine';

const MAX_MONTHS = 1200;

export interface RefinanceBreakEvenInput {
  readonly loans: readonly StudentLoan[];
  readonly refinanceAnnualRateBps: number;
  readonly refinanceTermMonths: number;
  readonly originationFeeCents?: number;
  readonly monthlyPaymentOverrideCents?: number;
  readonly currentMonthlyPaymentOverrideCents?: number;
  readonly feesFinanced?: boolean;
}

export type RefinanceWarningType =
  | 'federal_benefits_loss'
  | 'pslf_loss'
  | 'no_break_even'
  | 'non_amortizing_payment'
  | 'higher_lifetime_cost';

export interface RefinanceWarning {
  readonly type: RefinanceWarningType;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
}

export interface LoanProjection {
  readonly principalCents: number;
  readonly annualRateBps: number;
  readonly monthlyPaymentCents: number;
  readonly totalInterestCents: number;
  readonly totalPaidCents: number;
  readonly monthsToPayoff: number | null;
}

export interface RefinanceBreakEvenResult {
  readonly current: LoanProjection;
  readonly refinance: LoanProjection;
  readonly originationFeeCents: number;
  readonly feesFinanced: boolean;
  readonly monthlySavingsCents: number;
  readonly totalInterestSavingsCents: number;
  readonly totalCostSavingsCents: number;
  readonly payoffMonthsDifference: number | null;
  readonly breakEvenMonth: number | null;
  readonly warnings: RefinanceWarning[];
  readonly recommendation: 'consider' | 'caution' | 'avoid' | 'insufficient_data';
  readonly assumptions: string[];
}

function getAggregate(loans: readonly StudentLoan[]): {
  balanceCents: number;
  paymentCents: number;
  weightedRateBps: number;
  hasFederalLoans: boolean;
  hasPslfLoans: boolean;
} {
  let balanceCents = 0;
  let paymentCents = 0;
  let weightedRateSum = 0;
  let hasFederalLoans = false;
  let hasPslfLoans = false;

  for (const loan of loans) {
    const balance = Math.max(0, loan.balanceCents);
    balanceCents += balance;
    paymentCents += Math.max(0, loan.minimumPaymentCents);
    weightedRateSum += balance * Math.max(0, loan.annualRateBps);
    hasFederalLoans ||= loan.isFederal;
    hasPslfLoans ||= loan.isPslfEligible;
  }

  return {
    balanceCents,
    paymentCents,
    weightedRateBps: balanceCents > 0 ? bankersRound(weightedRateSum / balanceCents) : 0,
    hasFederalLoans,
    hasPslfLoans,
  };
}

function calculateFixedPaymentCents(
  principalCents: number,
  annualRateBps: number,
  termMonths: number,
): number {
  if (principalCents <= 0 || termMonths <= 0) return 0;
  if (annualRateBps <= 0) return Math.ceil(principalCents / termMonths);
  const monthlyRate = annualRateBps / (100 * 100 * 12);
  const numerator = principalCents * monthlyRate;
  const denominator = 1 - Math.pow(1 + monthlyRate, -termMonths);
  return Math.max(1, bankersRound(numerator / denominator));
}

function projectLoan(
  principalCents: number,
  annualRateBps: number,
  monthlyPaymentCents: number,
): LoanProjection {
  if (principalCents <= 0) {
    return {
      principalCents,
      annualRateBps,
      monthlyPaymentCents,
      totalInterestCents: 0,
      totalPaidCents: 0,
      monthsToPayoff: 0,
    };
  }

  let balanceCents = principalCents;
  let totalInterestCents = 0;
  let totalPaidCents = 0;

  for (let month = 1; month <= MAX_MONTHS; month++) {
    const interestCents = calculateMonthlyInterestCents(balanceCents, annualRateBps);
    if (monthlyPaymentCents <= interestCents) {
      return {
        principalCents,
        annualRateBps,
        monthlyPaymentCents,
        totalInterestCents,
        totalPaidCents,
        monthsToPayoff: null,
      };
    }
    const paymentCents = Math.min(monthlyPaymentCents, balanceCents + interestCents);
    totalInterestCents += interestCents;
    totalPaidCents += paymentCents;
    balanceCents = Math.max(0, balanceCents - Math.max(0, paymentCents - interestCents));

    if (balanceCents === 0) {
      return {
        principalCents,
        annualRateBps,
        monthlyPaymentCents,
        totalInterestCents,
        totalPaidCents,
        monthsToPayoff: month,
      };
    }
  }

  return {
    principalCents,
    annualRateBps,
    monthlyPaymentCents,
    totalInterestCents,
    totalPaidCents,
    monthsToPayoff: null,
  };
}

function paymentDueForMonth(projection: LoanProjection, month: number): number {
  if (projection.monthsToPayoff === null || month > projection.monthsToPayoff) return 0;
  if (month < projection.monthsToPayoff) return projection.monthlyPaymentCents;
  return Math.max(
    0,
    projection.totalPaidCents - projection.monthlyPaymentCents * (projection.monthsToPayoff - 1),
  );
}

function calculateBreakEvenMonth(
  current: LoanProjection,
  refinance: LoanProjection,
  upfrontFeeCents: number,
): number | null {
  if (current.monthsToPayoff === null || refinance.monthsToPayoff === null) return null;
  const horizon = Math.max(current.monthsToPayoff, refinance.monthsToPayoff);
  let cumulativeSavingsCents = -upfrontFeeCents;

  for (let month = 1; month <= horizon; month++) {
    cumulativeSavingsCents +=
      paymentDueForMonth(current, month) - paymentDueForMonth(refinance, month);
    if (cumulativeSavingsCents >= 0) return month;
  }

  return null;
}

function getRecommendation(
  warnings: readonly RefinanceWarning[],
  totalCostSavingsCents: number,
): RefinanceBreakEvenResult['recommendation'] {
  if (warnings.some((warning) => warning.type === 'non_amortizing_payment')) return 'avoid';
  if (warnings.some((warning) => warning.severity === 'critical')) return 'avoid';
  if (warnings.some((warning) => warning.severity === 'warning')) return 'caution';
  return totalCostSavingsCents > 0 ? 'consider' : 'caution';
}

export function calculateRefinanceBreakEven(
  input: RefinanceBreakEvenInput,
): RefinanceBreakEvenResult {
  const aggregate = getAggregate(input.loans);
  const originationFeeCents = Math.max(0, input.originationFeeCents ?? 0);
  const feesFinanced = input.feesFinanced ?? false;
  const currentMonthlyPaymentCents = Math.max(
    0,
    input.currentMonthlyPaymentOverrideCents ?? aggregate.paymentCents,
  );
  const current = projectLoan(
    aggregate.balanceCents,
    aggregate.weightedRateBps,
    currentMonthlyPaymentCents,
  );
  const refinancePrincipalCents = aggregate.balanceCents + (feesFinanced ? originationFeeCents : 0);
  const refinanceMonthlyPaymentCents = Math.max(
    0,
    input.monthlyPaymentOverrideCents ??
      calculateFixedPaymentCents(
        refinancePrincipalCents,
        Math.max(0, input.refinanceAnnualRateBps),
        Math.max(1, input.refinanceTermMonths),
      ),
  );
  const refinance = projectLoan(
    refinancePrincipalCents,
    Math.max(0, input.refinanceAnnualRateBps),
    refinanceMonthlyPaymentCents,
  );
  const upfrontFeeCents = feesFinanced ? 0 : originationFeeCents;
  const newTotalCostCents = refinance.totalPaidCents + upfrontFeeCents;
  const monthlySavingsCents = current.monthlyPaymentCents - refinance.monthlyPaymentCents;
  const totalInterestSavingsCents = current.totalInterestCents - refinance.totalInterestCents;
  const totalCostSavingsCents = current.totalPaidCents - newTotalCostCents;
  const payoffMonthsDifference =
    current.monthsToPayoff === null || refinance.monthsToPayoff === null
      ? null
      : refinance.monthsToPayoff - current.monthsToPayoff;
  const breakEvenMonth = calculateBreakEvenMonth(current, refinance, upfrontFeeCents);

  const warnings: RefinanceWarning[] = [];
  if (aggregate.hasFederalLoans) {
    warnings.push({
      type: 'federal_benefits_loss',
      severity: 'warning',
      message:
        'Refinancing federal loans may remove IDR, deferment, forbearance, and other federal protections.',
    });
  }
  if (aggregate.hasPslfLoans) {
    warnings.push({
      type: 'pslf_loss',
      severity: 'critical',
      message: 'Refinancing PSLF-eligible loans can eliminate PSLF eligibility.',
    });
  }
  if (refinance.monthsToPayoff === null) {
    warnings.push({
      type: 'non_amortizing_payment',
      severity: 'critical',
      message: 'The refinance payment does not reliably amortize the balance.',
    });
  }
  if (breakEvenMonth === null) {
    warnings.push({
      type: 'no_break_even',
      severity: 'warning',
      message: 'The refinance does not recoup fees within the modeled payoff horizon.',
    });
  }
  if (totalCostSavingsCents < 0) {
    warnings.push({
      type: 'higher_lifetime_cost',
      severity: 'warning',
      message: 'The refinance has a higher modeled lifetime cost than the current loans.',
    });
  }

  return {
    current,
    refinance,
    originationFeeCents,
    feesFinanced,
    monthlySavingsCents,
    totalInterestSavingsCents,
    totalCostSavingsCents,
    payoffMonthsDifference,
    breakEvenMonth,
    warnings,
    recommendation: getRecommendation(warnings, totalCostSavingsCents),
    assumptions: [
      'Current loans are aggregated using weighted-average APR and current required payments.',
      'Break-even is based on cumulative cash-flow savings after fees, not exact score or tax effects.',
      feesFinanced
        ? 'Fees are financed into the refinance principal.'
        : 'Fees are paid upfront at month 0.',
    ],
  };
}
