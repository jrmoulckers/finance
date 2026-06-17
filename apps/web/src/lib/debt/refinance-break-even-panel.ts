// SPDX-License-Identifier: BUSL-1.1

import type { RefinanceBreakEvenResult } from './refinance-break-even';

export interface RefinanceBreakEvenPanelModel {
  readonly monthlySavingsCents: number;
  readonly totalInterestSavingsCents: number;
  readonly totalCostSavingsCents: number;
  readonly payoffMonthsDifference: number | null;
  readonly breakEvenMonth: number | null;
  readonly warnings: readonly string[];
  readonly assumptions: readonly string[];
  readonly recommendation: RefinanceBreakEvenResult['recommendation'];
}

export function buildRefinanceBreakEvenPanelModel(
  result: RefinanceBreakEvenResult,
): RefinanceBreakEvenPanelModel {
  return {
    monthlySavingsCents: result.monthlySavingsCents,
    totalInterestSavingsCents: result.totalInterestSavingsCents,
    totalCostSavingsCents: result.totalCostSavingsCents,
    payoffMonthsDifference: result.payoffMonthsDifference,
    breakEvenMonth: result.breakEvenMonth,
    warnings: result.warnings.map((warning) => warning.message),
    assumptions: result.assumptions,
    recommendation: result.recommendation,
  };
}
