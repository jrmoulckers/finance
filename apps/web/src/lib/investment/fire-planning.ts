// SPDX-License-Identifier: BUSL-1.1

/**
 * FIRE and Coast-FIRE scenario-planning helpers for web beta calculators (#2239).
 *
 * All FIRE math (FI number, Coast-FI, years-to-FI) is delegated to the single
 * canonical engine in `../fire`, which compounds **monthly and geometrically**
 * on **real** (inflation-adjusted) returns. This module is a thin scenario layer
 * on top of that engine — it does not implement its own compounding. Keeping one
 * source of truth avoids the divergent (annual-vs-monthly) results that used to
 * arise from the retired `fire-calculator`/`shared-fire` engines. See #3305.
 */

import { coastFINumber, fiNumber, yearsToFI, MAX_FI_SEARCH_YEARS } from '../fire';

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

function applyOverride(
  input: FirePlanningInput,
  override: FireScenarioOverride,
): FirePlanningInput {
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

/** Percentage ratio (0–100+) with a guarded non-positive denominator → 0. */
function ratioPercent(numeratorCents: number, denominatorCents: number): number {
  if (denominatorCents <= 0) return 0;
  return Math.round((numeratorCents / denominatorCents) * 10000) / 100;
}

export function calculateFirePlan(
  input: FirePlanningInput,
  scenario: FireScenarioOverride = { id: 'current', label: 'Current plan' },
): FirePlanResult {
  const scenarioInput = applyOverride(input, scenario);
  const investedAssets = Math.max(0, scenarioInput.currentInvestedAssetsCents);
  const annualExpensesCents = Math.max(0, scenarioInput.annualExpensesCents);
  const annualContributionsCents = Math.max(0, scenarioInput.annualContributionsCents);
  const swrRate = scenarioInput.withdrawalRatePercent / 100;
  const realReturnRate = scenarioInput.expectedRealReturnPercent / 100;
  const yearsToTarget = Math.max(0, scenarioInput.targetRetirementAge - scenarioInput.currentAge);

  // Delegate to the canonical engine (`../fire`) for consistent monthly,
  // geometric compounding. An unreachable SWR makes `fiNumber` Infinite; clamp
  // to 0 to preserve this module's `FirePlanResult` contract (the non-positive
  // SWR is separately surfaced through `getFirePlanningWarnings`).
  const rawFiNumberCents = fiNumber(annualExpensesCents, swrRate);
  const fiNumberCents = Number.isFinite(rawFiNumberCents) ? rawFiNumberCents : 0;

  const rawCoastCents = coastFINumber({
    annualSpendingCents: annualExpensesCents,
    swrRate,
    realReturnRate,
    yearsToTraditionalRetirement: yearsToTarget,
  });
  const coastFITargetCents = Number.isFinite(rawCoastCents) ? rawCoastCents : 0;

  // Report whole years-to-FI (ceil of the monthly search) to match the prior
  // annual-granularity contract; an unreachable plan caps at the search horizon.
  const ytf = yearsToFI({
    currentInvestedCents: investedAssets,
    annualContributionCents: annualContributionsCents,
    realReturnRate,
    fiNumberCents,
  });
  const yearsToFi = ytf.reachedFI ? Math.ceil(ytf.totalMonths / 12) : MAX_FI_SEARCH_YEARS;

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    fiNumberCents,
    fiPercent: ratioPercent(investedAssets, fiNumberCents),
    coastFITargetCents,
    isCoastFI: fiNumberCents > 0 && investedAssets >= coastFITargetCents,
    savingsRatePercent: ratioPercent(annualContributionsCents, scenarioInput.annualIncomeCents),
    yearsToFI: yearsToFi,
    fireAge: scenarioInput.currentAge + yearsToFi,
    canReachFIByTargetAge: yearsToFi <= yearsToTarget,
    warnings: getFirePlanningWarnings(scenarioInput),
  };
}

export function compareFirePlans(
  input: FirePlanningInput,
  scenarios: readonly FireScenarioOverride[] = DEFAULT_FIRE_SCENARIOS,
): readonly FirePlanResult[] {
  return scenarios.map((scenario) => calculateFirePlan(input, scenario));
}
