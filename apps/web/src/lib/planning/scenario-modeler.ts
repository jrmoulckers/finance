// SPDX-License-Identifier: BUSL-1.1

/**
 * What-if scenario modeler engine.
 *
 * Projects net worth over time by applying scenario adjustments
 * (income, expense, savings, one-time events) to a baseline.
 *
 * All monetary values are in cents (integers).
 *
 * References: #1743, #1735
 */

import type { Scenario, ScenarioAdjustment, ScenarioProjection, ProjectionPoint } from './types';

// ---------------------------------------------------------------------------
// Baseline snapshot
// ---------------------------------------------------------------------------

/** Current financial snapshot used as the projection baseline. */
export interface BaselineSnapshot {
  /** Current net worth in cents. */
  readonly netWorthCents: number;
  /** Current monthly income in cents. */
  readonly monthlyIncomeCents: number;
  /** Current monthly expenses in cents. */
  readonly monthlyExpensesCents: number;
  /** Current savings balance in cents. */
  readonly savingsCents: number;
}

// ---------------------------------------------------------------------------
// Projection engine
// ---------------------------------------------------------------------------

/**
 * Project a single scenario over a number of months.
 *
 * Starts from the baseline and applies monthly adjustments plus any
 * one-time events at their specified month offsets.
 *
 * @param baseline - Current financial snapshot
 * @param scenario - Scenario with adjustments to apply
 * @param months - Number of months to project (default 60 = 5 years)
 * @returns Projection with monthly data points
 */
export function projectScenario(
  baseline: BaselineSnapshot,
  scenario: Scenario,
  months: number = 60,
): ScenarioProjection {
  const points: ProjectionPoint[] = [];

  // Separate recurring from one-time adjustments
  const recurring = scenario.adjustments.filter((a) => a.category !== 'one-time');
  const oneTime = scenario.adjustments.filter((a) => a.category === 'one-time');

  // Compute monthly deltas from recurring adjustments
  const monthlyIncomeDelta = recurring
    .filter((a) => a.category === 'income')
    .reduce((sum, a) => sum + a.monthlyCents, 0);

  const monthlyExpenseDelta = recurring
    .filter((a) => a.category === 'expense')
    .reduce((sum, a) => sum + a.monthlyCents, 0);

  const monthlySavingsDelta = recurring
    .filter((a) => a.category === 'savings')
    .reduce((sum, a) => sum + a.monthlyCents, 0);

  let netWorth = baseline.netWorthCents;
  let savings = baseline.savingsCents;

  for (let month = 0; month <= months; month++) {
    // Apply one-time events at their specified month
    const oneTimeImpact = oneTime
      .filter((a) => a.monthOffset === month)
      .reduce((sum, a) => sum + a.monthlyCents, 0);

    if (month > 0) {
      // Monthly cash flow: (income + income delta) - (expenses + expense delta) + savings delta
      const monthlyIncome = baseline.monthlyIncomeCents + monthlyIncomeDelta;
      const monthlyExpenses = baseline.monthlyExpensesCents + monthlyExpenseDelta;
      const cashFlow = monthlyIncome - monthlyExpenses + monthlySavingsDelta;

      netWorth += cashFlow + oneTimeImpact;
      savings += Math.max(0, cashFlow) + monthlySavingsDelta + oneTimeImpact;
    } else {
      netWorth += oneTimeImpact;
      savings += oneTimeImpact;
    }

    const monthlyIncome = baseline.monthlyIncomeCents + monthlyIncomeDelta;
    const monthlyExpenses = baseline.monthlyExpensesCents + monthlyExpenseDelta;

    points.push({
      month,
      netWorthCents: Math.round(netWorth),
      savingsCents: Math.round(savings),
      cashFlowCents: Math.round(monthlyIncome - monthlyExpenses + monthlySavingsDelta),
    });
  }

  // Find month when net worth hits zero
  const zeroMonth = points.find((p) => p.month > 0 && p.netWorthCents <= 0);
  const monthsToZero = zeroMonth ? zeroMonth.month : null;

  // Net worth delta vs baseline at the end
  const baselineEndNetWorth = projectBaseline(baseline, months);
  const netWorthDeltaCents = (points[points.length - 1]?.netWorthCents ?? 0) - baselineEndNetWorth;

  return {
    scenarioId: scenario.id,
    points,
    monthsToZero,
    netWorthDeltaCents,
  };
}

/**
 * Project the baseline (no adjustments) net worth over time.
 *
 * @param baseline - Current financial snapshot
 * @param months - Number of months
 * @returns Net worth at the end of the period in cents
 */
function projectBaseline(baseline: BaselineSnapshot, months: number): number {
  const monthlyCashFlow = baseline.monthlyIncomeCents - baseline.monthlyExpensesCents;
  return baseline.netWorthCents + monthlyCashFlow * months;
}

/**
 * Generate a baseline projection (no scenario changes) for comparison.
 *
 * @param baseline - Current financial snapshot
 * @param months - Number of months to project
 * @returns Projection with a synthetic "baseline" scenario ID
 */
export function projectBaselineScenario(
  baseline: BaselineSnapshot,
  months: number = 60,
): ScenarioProjection {
  const emptyScenario: Scenario = {
    id: '__baseline__',
    name: 'Current trajectory',
    description: 'No changes from current income, expenses, and savings.',
    adjustments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return projectScenario(baseline, emptyScenario, months);
}

/**
 * Compare multiple scenarios against the baseline.
 *
 * @param baseline - Current financial snapshot
 * @param scenarios - Scenarios to compare
 * @param months - Number of months to project
 * @returns Array of projections including the baseline
 */
export function compareScenarios(
  baseline: BaselineSnapshot,
  scenarios: readonly Scenario[],
  months: number = 60,
): ScenarioProjection[] {
  const baselineProjection = projectBaselineScenario(baseline, months);
  const scenarioProjections = scenarios.map((s) => projectScenario(baseline, s, months));

  return [baselineProjection, ...scenarioProjections];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a new empty scenario with a generated ID. */
export function createEmptyScenario(name: string, description: string = ''): Scenario {
  return {
    id: crypto.randomUUID(),
    name,
    description,
    adjustments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Create a new adjustment with a generated ID. */
export function createAdjustment(
  label: string,
  category: ScenarioAdjustment['category'],
  monthlyCents: number,
  monthOffset?: number,
): ScenarioAdjustment {
  return {
    id: crypto.randomUUID(),
    label,
    category,
    monthlyCents,
    monthOffset,
  };
}

/** Add an adjustment to a scenario (returns new scenario). */
export function addAdjustment(scenario: Scenario, adjustment: ScenarioAdjustment): Scenario {
  return {
    ...scenario,
    adjustments: [...scenario.adjustments, adjustment],
    updatedAt: new Date().toISOString(),
  };
}

/** Remove an adjustment from a scenario (returns new scenario). */
export function removeAdjustment(scenario: Scenario, adjustmentId: string): Scenario {
  return {
    ...scenario,
    adjustments: scenario.adjustments.filter((a) => a.id !== adjustmentId),
    updatedAt: new Date().toISOString(),
  };
}

/** Duplicate a scenario with a new ID and name. */
export function duplicateScenario(scenario: Scenario, newName?: string): Scenario {
  return {
    ...scenario,
    id: crypto.randomUUID(),
    name: newName ?? `${scenario.name} (copy)`,
    adjustments: scenario.adjustments.map((a) => ({ ...a, id: crypto.randomUUID() })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
