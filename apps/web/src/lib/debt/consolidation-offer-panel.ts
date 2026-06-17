// SPDX-License-Identifier: BUSL-1.1

import type { ConsolidationComparisonResult } from './consolidation-comparison';

export interface ConsolidationOfferPanelModel {
  readonly paymentCents: number;
  readonly totalPaidCents: number;
  readonly interestCents: number;
  readonly payoffMonths: number | null;
  readonly feesCents: number;
  readonly flags: readonly string[];
  readonly assumptions: readonly string[];
  readonly recommendation: ConsolidationComparisonResult['recommendation'];
  readonly recommendationSummary: string;
}

export function buildConsolidationOfferPanelModel(
  result: ConsolidationComparisonResult,
): ConsolidationOfferPanelModel {
  return {
    paymentCents: result.consolidation.monthlyPaymentCents,
    totalPaidCents: result.consolidation.totalPaidCents,
    interestCents: result.consolidation.totalInterestCents,
    payoffMonths: result.consolidation.monthsToPayoff,
    feesCents: result.consolidation.totalFeesCents,
    flags: result.flags.map((flag) => flag.message),
    assumptions: result.assumptions,
    recommendation: result.recommendation,
    recommendationSummary: result.recommendationSummary,
  };
}
