// SPDX-License-Identifier: BUSL-1.1

/** Local-first FIRE planning view helpers (#2471, #2472, #2473). */

import {
  calculateFirePlan,
  compareFirePlans,
  type FirePlanResult,
  type FirePlanningInput,
  type FireScenarioOverride,
} from './fire-planning';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FirePlanningAssumptions {
  readonly annualExpensesCents: number;
  readonly annualContributionsCents: number;
  readonly annualIncomeCents: number;
  readonly currentAge: number;
  readonly targetRetirementAge: number;
  readonly expectedRealReturnPercent: number;
  readonly withdrawalRatePercent: number;
}

export interface FireDefaultSources {
  readonly investedAssetsCents?: number | null;
  readonly annualExpensesCents?: number | null;
  readonly annualContributionsCents?: number | null;
  readonly annualIncomeCents?: number | null;
  readonly expenseEstimateIsStale?: boolean;
  readonly contributionEstimateIsStale?: boolean;
}

export interface FirePlanningDefaults {
  readonly input: FirePlanningInput;
  readonly warnings: readonly string[];
  readonly assumptionSummary: readonly string[];
}

export interface FireScenarioCard {
  readonly id: string;
  readonly title: string;
  readonly result: FirePlanResult;
  readonly tone: 'on-track' | 'attention' | 'warning';
  readonly headline: string;
}

const STORAGE_KEY = 'finance.firePlanning.assumptions.v1';

export const FIRE_PLANNING_DISCLAIMER =
  'FIRE projections are estimates for planning only, not financial advice.';

export const DEFAULT_FIRE_PLANNING_ASSUMPTIONS: FirePlanningAssumptions = {
  annualExpensesCents: 48_000_00,
  annualContributionsCents: 12_000_00,
  annualIncomeCents: 75_000_00,
  currentAge: 35,
  targetRetirementAge: 65,
  expectedRealReturnPercent: 5,
  withdrawalRatePercent: 4,
};

export const FIRE_VIEW_SCENARIOS: readonly FireScenarioOverride[] = [
  { id: 'standard-fire', label: 'Standard FIRE' },
  { id: 'coast-fire', label: 'Coast-FIRE' },
  { id: 'save-more', label: 'Save more', annualContributionsCents: undefined },
  { id: 'lower-return', label: 'Lower return' },
];

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeFirePlanningAssumptions(
  value: Partial<FirePlanningAssumptions>,
): FirePlanningAssumptions {
  return {
    annualExpensesCents: Math.round(
      Math.max(
        0,
        finiteNumber(
          value.annualExpensesCents,
          DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualExpensesCents,
        ),
      ),
    ),
    annualContributionsCents: Math.round(
      Math.max(
        0,
        finiteNumber(
          value.annualContributionsCents,
          DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualContributionsCents,
        ),
      ),
    ),
    annualIncomeCents: Math.round(
      Math.max(
        0,
        finiteNumber(value.annualIncomeCents, DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualIncomeCents),
      ),
    ),
    currentAge: Math.round(
      clamp(finiteNumber(value.currentAge, DEFAULT_FIRE_PLANNING_ASSUMPTIONS.currentAge), 0, 120),
    ),
    targetRetirementAge: Math.round(
      clamp(
        finiteNumber(
          value.targetRetirementAge,
          DEFAULT_FIRE_PLANNING_ASSUMPTIONS.targetRetirementAge,
        ),
        0,
        120,
      ),
    ),
    expectedRealReturnPercent: clamp(
      finiteNumber(
        value.expectedRealReturnPercent,
        DEFAULT_FIRE_PLANNING_ASSUMPTIONS.expectedRealReturnPercent,
      ),
      -25,
      25,
    ),
    withdrawalRatePercent: clamp(
      finiteNumber(
        value.withdrawalRatePercent,
        DEFAULT_FIRE_PLANNING_ASSUMPTIONS.withdrawalRatePercent,
      ),
      0,
      20,
    ),
  };
}

export function loadFirePlanningAssumptions(storage: StorageLike): FirePlanningAssumptions {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_FIRE_PLANNING_ASSUMPTIONS;

  try {
    return normalizeFirePlanningAssumptions(JSON.parse(raw) as Partial<FirePlanningAssumptions>);
  } catch {
    return DEFAULT_FIRE_PLANNING_ASSUMPTIONS;
  }
}

export function saveFirePlanningAssumptions(
  storage: StorageLike,
  assumptions: Partial<FirePlanningAssumptions>,
): FirePlanningAssumptions {
  const normalized = normalizeFirePlanningAssumptions(assumptions);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetFirePlanningAssumptions(storage: StorageLike): FirePlanningAssumptions {
  storage.removeItem(STORAGE_KEY);
  return DEFAULT_FIRE_PLANNING_ASSUMPTIONS;
}

export function deriveFirePlanningDefaults(
  sources: FireDefaultSources,
  overrides: Partial<FirePlanningAssumptions> = {},
): FirePlanningDefaults {
  const defaults = normalizeFirePlanningAssumptions({
    ...DEFAULT_FIRE_PLANNING_ASSUMPTIONS,
    annualExpensesCents:
      sources.annualExpensesCents ?? DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualExpensesCents,
    annualContributionsCents:
      sources.annualContributionsCents ??
      DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualContributionsCents,
    annualIncomeCents:
      sources.annualIncomeCents ?? DEFAULT_FIRE_PLANNING_ASSUMPTIONS.annualIncomeCents,
    ...overrides,
  });
  const warnings: string[] = [];

  if (sources.investedAssetsCents === null || sources.investedAssetsCents === undefined) {
    warnings.push('Invested assets are missing; using manual FIRE defaults.');
  }
  if (sources.annualExpensesCents === null || sources.annualExpensesCents === undefined) {
    warnings.push('Annual expenses are missing; using manual FIRE defaults.');
  }
  if (sources.expenseEstimateIsStale) warnings.push('Expense estimate may be stale.');
  if (sources.contributionEstimateIsStale) warnings.push('Contribution estimate may be stale.');

  const input: FirePlanningInput = {
    currentInvestedAssetsCents: Math.max(0, Math.round(sources.investedAssetsCents ?? 0)),
    ...defaults,
  };

  return {
    input,
    warnings,
    assumptionSummary: [
      `Annual expenses: ${defaults.annualExpensesCents} cents`,
      `Annual contributions: ${defaults.annualContributionsCents} cents`,
      `Expected real return: ${defaults.expectedRealReturnPercent}%`,
      `Withdrawal rate: ${defaults.withdrawalRatePercent}%`,
      FIRE_PLANNING_DISCLAIMER,
    ],
  };
}

function scenarioForCard(
  scenario: FireScenarioOverride,
  input: FirePlanningInput,
): FireScenarioOverride {
  if (scenario.id === 'save-more') {
    return {
      ...scenario,
      annualContributionsCents: Math.round(input.annualContributionsCents * 1.1),
    };
  }
  if (scenario.id === 'lower-return') {
    return {
      ...scenario,
      expectedRealReturnPercent: input.expectedRealReturnPercent - 2,
    };
  }
  return scenario;
}

function toneForResult(result: FirePlanResult): FireScenarioCard['tone'] {
  if (result.warnings.length > 0) return 'warning';
  return result.canReachFIByTargetAge || result.isCoastFI ? 'on-track' : 'attention';
}

export function buildFireScenarioCards(
  input: FirePlanningInput,
  scenarios: readonly FireScenarioOverride[] = FIRE_VIEW_SCENARIOS,
): readonly FireScenarioCard[] {
  const normalizedScenarios = scenarios.map((scenario) => scenarioForCard(scenario, input));
  return compareFirePlans(input, normalizedScenarios).map((result) => ({
    id: result.scenarioId,
    title: result.label,
    result,
    tone: toneForResult(result),
    headline:
      result.scenarioId === 'coast-fire'
        ? result.isCoastFI
          ? 'Coast-FIRE reached'
          : 'Coast-FIRE not yet reached'
        : result.canReachFIByTargetAge
          ? `Estimated FIRE age ${result.fireAge}`
          : 'Target age needs adjustment',
  }));
}

export function buildCoastFireCard(input: FirePlanningInput): FireScenarioCard {
  const result = calculateFirePlan(input, { id: 'coast-fire', label: 'Coast-FIRE' });
  return {
    id: result.scenarioId,
    title: result.label,
    result,
    tone: toneForResult(result),
    headline: result.isCoastFI ? 'Coast-FIRE reached' : 'Coast-FIRE not yet reached',
  };
}
