// SPDX-License-Identifier: BUSL-1.1

/** FIRE and Coast-FIRE planning helpers for web beta calculators (#2239). */

import {
  calculateCoastFI,
  calculateFINumber,
  calculateFIPercent,
  calculateSavingsRate,
  calculateYearsToFI,
} from './fire-calculator';

export interface FirePlanningInput {
  readonly currentInvestedAssetsCents: number;
  readonly annualExpensesCents: number;
  readonly annualContributionsCents: number;
  readonly annualIncomeCents: number;
  readonly currentAge: number;
  readonly targetRetirementAge: number;
  readonly expectedRealReturnPercent: number;
  readonly withdrawalRatePercent: number;
}

export interface FireScenarioOverride {
  readonly id: string;
  readonly label: string;
  readonly annualContributionsCents?: number;
  readonly annualExpensesCents?: number;
  readonly expectedRealReturnPercent?: number;
  readonly withdrawalRatePercent?: number;
}

export interface FirePlanResult {
  readonly scenarioId: string;
  readonly label: string;
  readonly fiNumberCents: number;
  readonly fiPercent: number;
  readonly coastFITargetCents: number;
  readonly isCoastFI: boolean;
  readonly savingsRatePercent: number;
  readonly yearsToFI: number;
  readonly fireAge: number;
  readonly canReachFIByTargetAge: boolean;
  readonly warnings: readonly string[];
}

export const DEFAULT_FIRE_SCENARIOS: readonly FireScenarioOverride[] = [
  { id: 'current', label: 'Current plan' },
  { id: 'higher-savings', label: 'Save 10% more', annualContributionsCents: undefined },
  { id: 'lower-return', label: 'Lower return' },
];

function applyOverride(input: FirePlanningInput, override: FireScenarioOverride): FirePlanningInput {
  const annualContributionsCents =
    override.id === 'higher-savings' && override.annualContributionsCents === undefined
      ? Math.round(input.annualContributionsCents * 1.1)
      : (override.annualContributionsCents ?? input.annualContributionsCents);
  const expectedRealReturnPercent =
    override.id === 'lower-return' && override.expectedRealReturnPercent === undefined
      ? input.expectedRealReturnPercent - 2
      : (override.expectedRealReturnPercent ?? input.expectedRealReturnPercent);

  return {
    ...input,
    annualContributionsCents,
    annualExpensesCents: override.annualExpensesCents ?? input.annualExpensesCents,
    expectedRealReturnPercent,
    withdrawalRatePercent: override.withdrawalRatePercent ?? input.withdrawalRatePercent,
  };
}

export function getFirePlanningWarnings(input: FirePlanningInput): readonly string[] {
  const warnings: string[] = [];
  if (input.annualExpensesCents <= 0) warnings.push('Annual expenses must be above zero.');
  if (input.withdrawalRatePercent <= 0) warnings.push('Withdrawal rate must be above zero.');
  if (input.withdrawalRatePercent > 8) warnings.push('Withdrawal rate is unusually high.');
  if (input.expectedRealReturnPercent < -10 || input.expectedRealReturnPercent > 15) {
    warnings.push('Expected real return is outside typical long-term planning bounds.');
  }
  if (input.targetRetirementAge < input.currentAge) {
    warnings.push('Target retirement age is before current age.');
  }
  if (input.currentInvestedAssetsCents < 0) warnings.push('Current invested assets are negative.');
  return warnings;
}

export function calculateFirePlan(
  input: FirePlanningInput,
  scenario: FireScenarioOverride = { id: 'current', label: 'Current plan' },
): FirePlanResult {
  const scenarioInput = applyOverride(input, scenario);
  const investedAssets = Math.max(0, scenarioInput.currentInvestedAssetsCents);
  const fiNumberCents = calculateFINumber(
    Math.max(0, scenarioInput.annualExpensesCents),
    scenarioInput.withdrawalRatePercent,
  );
  const yearsToTarget = Math.max(0, scenarioInput.targetRetirementAge - scenarioInput.currentAge);
  const coastFITargetCents = calculateCoastFI(
    fiNumberCents,
    scenarioInput.expectedRealReturnPercent,
    yearsToTarget,
  );
  const yearsToFI = calculateYearsToFI(
    investedAssets,
    Math.max(0, scenarioInput.annualContributionsCents),
    scenarioInput.expectedRealReturnPercent,
    fiNumberCents,
  );

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    fiNumberCents,
    fiPercent: calculateFIPercent(investedAssets, fiNumberCents),
    coastFITargetCents,
    isCoastFI: investedAssets >= coastFITargetCents && fiNumberCents > 0,
    savingsRatePercent: calculateSavingsRate(
      Math.max(0, scenarioInput.annualContributionsCents),
      scenarioInput.annualIncomeCents,
    ),
    yearsToFI,
    fireAge: scenarioInput.currentAge + yearsToFI,
    canReachFIByTargetAge: yearsToFI <= yearsToTarget,
    warnings: getFirePlanningWarnings(scenarioInput),
  };
}

export function compareFirePlans(
  input: FirePlanningInput,
  scenarios: readonly FireScenarioOverride[] = DEFAULT_FIRE_SCENARIOS,
): readonly FirePlanResult[] {
  return scenarios.map((scenario) => calculateFirePlan(input, scenario));
}
