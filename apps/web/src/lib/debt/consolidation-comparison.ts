// SPDX-License-Identifier: BUSL-1.1

/**
 * Debt consolidation comparison engine.
 *
 * Compares a proposed consolidation loan against the user's current payoff plan.
 * All monetary values are integer cents and rates are basis points.
 *
 * References: issue #2221
 */

import type { Debt, PayoffStrategy, StrategyResult } from '../debt-types';
import {
  bankersRound,
  calculateMonthlyInterestCents,
  calculateStrategyResult,
} from '../debt-payoff-engine';

const DEFAULT_MAX_MONTHS = 1200;

export type ConsolidationFeeTreatment = 'paid_upfront' | 'financed';

export interface ConsolidationScenarioInput {
  readonly debts: readonly Debt[];
  readonly selectedDebtIds?: readonly string[];
  readonly currentStrategy?: PayoffStrategy;
  readonly currentExtraPaymentCents?: number;
  readonly consolidationAnnualRateBps: number;
  readonly consolidationTermMonths: number;
  readonly originationFeeCents?: number;
  readonly monthlyPaymentTargetCents?: number;
  readonly feeTreatment?: ConsolidationFeeTreatment;
}

export type ConsolidationOfferFlagType =
  | 'no_eligible_debts'
  | 'non_amortizing_payment'
  | 'lower_payment_higher_cost'
  | 'longer_payoff'
  | 'higher_monthly_payment'
  | 'high_fee';

export interface ConsolidationOfferFlag {
  readonly type: ConsolidationOfferFlagType;
  readonly severity: 'info' | 'warning' | 'critical';
  readonly message: string;
}

export interface ConsolidationLoanProjection {
  readonly principalCents: number;
  readonly financedFeeCents: number;
  readonly upfrontFeeCents: number;
  readonly annualRateBps: number;
  readonly termMonths: number;
  readonly monthlyPaymentCents: number;
  readonly totalInterestCents: number;
  readonly totalFeesCents: number;
  readonly totalPaidCents: number;
  readonly totalCostCents: number;
  readonly monthsToPayoff: number | null;
}

export interface ConsolidationComparisonResult {
  readonly selectedDebts: Debt[];
  readonly currentPlan: StrategyResult;
  readonly consolidation: ConsolidationLoanProjection;
  readonly monthlyPaymentDifferenceCents: number;
  readonly totalPaidDifferenceCents: number;
  readonly interestDifferenceCents: number;
  readonly payoffMonthsDifference: number | null;
  readonly flags: ConsolidationOfferFlag[];
  readonly recommendation: 'consider' | 'caution' | 'avoid' | 'insufficient_data';
  readonly recommendationSummary: string;
  readonly assumptions: string[];
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

function projectInstallmentLoan(
  principalCents: number,
  annualRateBps: number,
  monthlyPaymentCents: number,
  termMonths: number,
): { totalInterestCents: number; totalPaidCents: number; monthsToPayoff: number | null } {
  if (principalCents <= 0) {
    return { totalInterestCents: 0, totalPaidCents: 0, monthsToPayoff: 0 };
  }

  let balanceCents = principalCents;
  let totalInterestCents = 0;
  let totalPaidCents = 0;
  const maxMonths = Math.max(termMonths, DEFAULT_MAX_MONTHS);

  for (let month = 1; month <= maxMonths; month++) {
    const interestCents = calculateMonthlyInterestCents(balanceCents, annualRateBps);
    if (monthlyPaymentCents <= interestCents && balanceCents > 0) {
      return { totalInterestCents, totalPaidCents, monthsToPayoff: null };
    }

    const paymentCents = Math.min(monthlyPaymentCents, balanceCents + interestCents);
    const principalPaidCents = Math.max(0, paymentCents - interestCents);
    balanceCents = Math.max(0, balanceCents - principalPaidCents);
    totalInterestCents += interestCents;
    totalPaidCents += paymentCents;

    if (balanceCents === 0) {
      return { totalInterestCents, totalPaidCents, monthsToPayoff: month };
    }
  }

  return { totalInterestCents, totalPaidCents, monthsToPayoff: null };
}

function getSelectedDebts(
  debts: readonly Debt[],
  selectedDebtIds: readonly string[] | undefined,
): Debt[] {
  const selectedIds = selectedDebtIds ? new Set(selectedDebtIds) : null;
  return debts.filter(
    (debt) => debt.balanceCents > 0 && (!selectedIds || selectedIds.has(debt.id)),
  );
}

function sumMinimumPayments(debts: readonly Debt[]): number {
  return debts.reduce((sum, debt) => sum + Math.max(0, debt.minimumPaymentCents), 0);
}

function buildRecommendation(flags: readonly ConsolidationOfferFlag[]): {
  recommendation: ConsolidationComparisonResult['recommendation'];
  summary: string;
} {
  if (flags.some((flag) => flag.type === 'no_eligible_debts')) {
    return {
      recommendation: 'insufficient_data',
      summary: 'Add at least one eligible debt to compare an offer.',
    };
  }
  if (flags.some((flag) => flag.severity === 'critical')) {
    return {
      recommendation: 'avoid',
      summary: 'This offer has a critical drawback versus the current payoff plan.',
    };
  }
  if (flags.some((flag) => flag.severity === 'warning')) {
    return {
      recommendation: 'caution',
      summary: 'This offer may help cash flow, but review the tradeoffs before accepting.',
    };
  }
  return {
    recommendation: 'consider',
    summary: 'This offer appears competitive on cost and payoff timing.',
  };
}

export function compareConsolidationOffer(
  input: ConsolidationScenarioInput,
): ConsolidationComparisonResult {
  const selectedDebts = getSelectedDebts(input.debts, input.selectedDebtIds);
  const currentStrategy = input.currentStrategy ?? 'avalanche';
  const currentExtraPaymentCents = Math.max(0, input.currentExtraPaymentCents ?? 0);
  const currentPlan = calculateStrategyResult(
    selectedDebts,
    currentStrategy,
    currentExtraPaymentCents,
  );
  const selectedBalanceCents = selectedDebts.reduce((sum, debt) => sum + debt.balanceCents, 0);
  const originationFeeCents = Math.max(0, input.originationFeeCents ?? 0);
  const feeTreatment = input.feeTreatment ?? 'paid_upfront';
  const financedFeeCents = feeTreatment === 'financed' ? originationFeeCents : 0;
  const upfrontFeeCents = feeTreatment === 'paid_upfront' ? originationFeeCents : 0;
  const principalCents = selectedBalanceCents + financedFeeCents;
  const termMonths = Math.max(1, input.consolidationTermMonths);
  const scheduledPaymentCents = calculateFixedPaymentCents(
    principalCents,
    Math.max(0, input.consolidationAnnualRateBps),
    termMonths,
  );
  const monthlyPaymentCents = Math.max(0, input.monthlyPaymentTargetCents ?? scheduledPaymentCents);
  const projection = projectInstallmentLoan(
    principalCents,
    Math.max(0, input.consolidationAnnualRateBps),
    monthlyPaymentCents,
    termMonths,
  );
  const consolidationTotalPaidCents = projection.totalPaidCents + upfrontFeeCents;
  const consolidation: ConsolidationLoanProjection = {
    principalCents,
    financedFeeCents,
    upfrontFeeCents,
    annualRateBps: Math.max(0, input.consolidationAnnualRateBps),
    termMonths,
    monthlyPaymentCents,
    totalInterestCents: projection.totalInterestCents,
    totalFeesCents: originationFeeCents,
    totalPaidCents: consolidationTotalPaidCents,
    totalCostCents: projection.totalInterestCents + originationFeeCents,
    monthsToPayoff: projection.monthsToPayoff,
  };

  const currentMonthlyPaymentCents = sumMinimumPayments(selectedDebts) + currentExtraPaymentCents;
  const monthlyPaymentDifferenceCents = monthlyPaymentCents - currentMonthlyPaymentCents;
  const totalPaidDifferenceCents = consolidation.totalPaidCents - currentPlan.totalPaidCents;
  const interestDifferenceCents = consolidation.totalInterestCents - currentPlan.totalInterestCents;
  const payoffMonthsDifference =
    consolidation.monthsToPayoff === null
      ? null
      : consolidation.monthsToPayoff - currentPlan.totalMonths;

  const flags: ConsolidationOfferFlag[] = [];
  if (selectedDebts.length === 0) {
    flags.push({
      type: 'no_eligible_debts',
      severity: 'critical',
      message: 'No positive-balance debts were selected for consolidation.',
    });
  }
  if (projection.monthsToPayoff === null) {
    flags.push({
      type: 'non_amortizing_payment',
      severity: 'critical',
      message: 'The proposed monthly payment does not reliably pay down the consolidation loan.',
    });
  }
  if (monthlyPaymentDifferenceCents < 0 && totalPaidDifferenceCents > 0) {
    flags.push({
      type: 'lower_payment_higher_cost',
      severity: 'warning',
      message: 'The offer lowers the monthly payment but increases total lifetime cost.',
    });
  }
  if (payoffMonthsDifference !== null && payoffMonthsDifference > 0) {
    flags.push({
      type: 'longer_payoff',
      severity: payoffMonthsDifference >= 12 ? 'warning' : 'info',
      message: 'The offer extends the payoff timeline versus the current plan.',
    });
  }
  if (monthlyPaymentDifferenceCents > 0) {
    flags.push({
      type: 'higher_monthly_payment',
      severity: 'info',
      message: 'The offer requires a higher monthly payment than the current selected debts.',
    });
  }
  if (selectedBalanceCents > 0 && (originationFeeCents * 100) / selectedBalanceCents >= 5) {
    flags.push({
      type: 'high_fee',
      severity: 'warning',
      message: 'Origination fees are at least 5% of the consolidated balance.',
    });
  }

  const recommendation = buildRecommendation(flags);

  return {
    selectedDebts,
    currentPlan,
    consolidation,
    monthlyPaymentDifferenceCents,
    totalPaidDifferenceCents,
    interestDifferenceCents,
    payoffMonthsDifference,
    flags,
    recommendation: recommendation.recommendation,
    recommendationSummary: recommendation.summary,
    assumptions: [
      `Current plan uses the ${currentStrategy} strategy and selected debts only.`,
      'The consolidation loan uses fixed monthly payments and simple monthly compounding.',
      feeTreatment === 'financed'
        ? 'Origination fees are treated as financed principal.'
        : 'Origination fees are treated as upfront cash costs.',
    ],
  };
}
