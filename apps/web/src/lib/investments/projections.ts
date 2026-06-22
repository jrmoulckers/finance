// SPDX-License-Identifier: BUSL-1.1

/**
 * Compound-growth projection engine for investment portfolios (#2118).
 *
 * Pure, deterministic functions that project the future value of a current
 * portfolio plus recurring contributions over a multi-year horizon, under
 * multiple expected-return scenarios. Produces a year-by-year series suitable
 * for charting and contribution tracking.
 *
 * ## Units & conventions
 *
 * - **Money is integer cents.** No floating-point money is ever returned;
 *   intermediate growth is computed in floating point then rounded to whole
 *   cents at every reported value.
 * - **Return rates are decimals** — `0.07` means 7% per year. Rates may be
 *   `0` (flat) or negative (drawdown) and the math degrades gracefully.
 * - **Compounding follows the contribution cadence.** A monthly contribution
 *   compounds monthly (periodic rate = annualRate / 12); an annual
 *   contribution compounds annually (periodic rate = annualRate). This matches
 *   the standard textbook ordinary-annuity / compound-interest formulas used
 *   by mainstream financial calculators, which keeps the numbers explainable
 *   and unit-testable.
 *
 * ## Real vs. nominal returns
 *
 * Rates are treated as **expected real (inflation-adjusted) annual returns**
 * by default, so projected values are expressed in *today's* purchasing power.
 * The arithmetic itself is rate-agnostic — callers may pass nominal rates, in
 * which case the results are nominal. The UI surfaces this assumption to the
 * user via a disclaimer.
 *
 * ## Data scope (issue #2118)
 *
 * This engine projects from the user's **local** holdings and contribution
 * assumptions only. It does NOT ingest real-time market prices or brokerage
 * data — that requires a market-data provider integration which is tracked as
 * separate, blocked work (provider selection + credentials).
 *
 * References: issue #2118
 */

/** How often the recurring contribution is made (and how growth compounds). */
export type ContributionFrequency = 'monthly' | 'annual';

/** A named expected-return assumption used to drive one projection line. */
export interface ProjectionScenario {
  /** Stable identifier, also used as the chart series key. */
  readonly id: string;
  /** Human-readable label shown in the UI and chart legend. */
  readonly label: string;
  /** Expected annual return as a decimal (`0.07` = 7%); may be `0`/negative. */
  readonly annualReturnRate: number;
}

/** Inputs to {@link projectPortfolioGrowth}. */
export interface ProjectionInput {
  /** Current portfolio market value in cents. Negative values clamp to 0. */
  readonly currentValueCents: number;
  /** Recurring contribution per period in cents. Negative values clamp to 0. */
  readonly contributionCents: number;
  /** Whether the contribution recurs monthly or annually. */
  readonly contributionFrequency: ContributionFrequency;
  /** Projection horizon in whole years (clamped to `[0, MAX_PROJECTION_YEARS]`). */
  readonly years: number;
  /** Optional scenario set; defaults to {@link DEFAULT_PROJECTION_SCENARIOS}. */
  readonly scenarios?: readonly ProjectionScenario[];
}

/** A single year's snapshot within a scenario projection. */
export interface ProjectionYearPoint {
  /** Year offset from today (`0` is the starting/baseline value). */
  readonly year: number;
  /** Portfolio value in cents at the start of the year. */
  readonly startValueCents: number;
  /** Portfolio value in cents at the end of the year. */
  readonly endValueCents: number;
  /** Contributions made during this year, in cents. */
  readonly contributionsThisYearCents: number;
  /** Investment growth (gains) credited during this year, in cents. */
  readonly growthThisYearCents: number;
  /** Contributions made from the start through this year, in cents. */
  readonly cumulativeContributionsCents: number;
  /** Growth accrued from the start through this year, in cents. */
  readonly cumulativeGrowthCents: number;
}

/** A full projection for one scenario, including its year-by-year series. */
export interface ScenarioProjection {
  readonly scenario: ProjectionScenario;
  /** Portfolio value in cents at the end of the horizon. */
  readonly finalValueCents: number;
  /** Total contributions over the horizon, in cents. */
  readonly totalContributionsCents: number;
  /** Total growth over the horizon, in cents (can be negative). */
  readonly totalGrowthCents: number;
  /** Starting portfolio value in cents (year 0). */
  readonly startingValueCents: number;
  /** Year-by-year series including the year-0 baseline. */
  readonly series: readonly ProjectionYearPoint[];
}

/** Result of {@link projectPortfolioGrowth}. */
export interface ProjectionResult {
  readonly startingValueCents: number;
  readonly years: number;
  readonly contributionCents: number;
  readonly contributionFrequency: ContributionFrequency;
  /** Compounding/contribution periods per year (12 for monthly, 1 for annual). */
  readonly periodsPerYear: number;
  readonly scenarios: readonly ScenarioProjection[];
}

/** Upper bound on the projection horizon to keep loops/values bounded. */
export const MAX_PROJECTION_YEARS = 100;

/** Default conservative / expected / optimistic real-return assumptions. */
export const DEFAULT_PROJECTION_SCENARIOS: readonly ProjectionScenario[] = [
  { id: 'conservative', label: 'Conservative', annualReturnRate: 0.04 },
  { id: 'expected', label: 'Expected', annualReturnRate: 0.07 },
  { id: 'optimistic', label: 'Optimistic', annualReturnRate: 0.09 },
];

/**
 * Round to whole cents, guarding against non-finite values so a bad input
 * (e.g. `NaN` from an empty form field) never propagates through the series.
 */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Number of compounding/contribution periods per year for a frequency. */
export function periodsPerYearForFrequency(frequency: ContributionFrequency): number {
  return frequency === 'monthly' ? 12 : 1;
}

/**
 * Clamp a requested horizon to a whole number of years in
 * `[0, MAX_PROJECTION_YEARS]`. Non-finite or negative inputs become `0`.
 */
export function clampProjectionYears(years: number): number {
  if (!Number.isFinite(years) || years <= 0) return 0;
  return Math.min(MAX_PROJECTION_YEARS, Math.floor(years));
}

/**
 * Future value of a single lump sum after `periods` compounding periods.
 *
 * `FV = principal * (1 + periodicRate)^periods`
 *
 * @param principalCents Present value in cents.
 * @param periodicRate Rate per period as a decimal (may be `0`/negative).
 * @param periods Number of compounding periods (clamped at `0`).
 * @returns Future value in whole cents.
 */
export function futureValueLumpSum(
  principalCents: number,
  periodicRate: number,
  periods: number,
): number {
  if (periods <= 0) return roundCents(principalCents);
  return roundCents(principalCents * Math.pow(1 + periodicRate, periods));
}

/**
 * Future value of an **ordinary annuity** — a level payment made at the end of
 * each period.
 *
 * `FV = payment * (((1 + r)^n - 1) / r)`, with the `r = 0` limit `FV = payment * n`.
 *
 * @param paymentCents Contribution per period in cents.
 * @param periodicRate Rate per period as a decimal (may be `0`/negative).
 * @param periods Number of payment/compounding periods.
 * @returns Future value of the contribution stream in whole cents.
 */
export function futureValueAnnuity(
  paymentCents: number,
  periodicRate: number,
  periods: number,
): number {
  if (periods <= 0 || paymentCents === 0) return 0;
  if (periodicRate === 0) return roundCents(paymentCents * periods);
  const growthFactor = Math.pow(1 + periodicRate, periods);
  return roundCents(paymentCents * ((growthFactor - 1) / periodicRate));
}

/**
 * Project a single scenario into a year-by-year series.
 *
 * Each year's end value is the closed-form sum of the compounded starting
 * balance plus the future value of the contribution annuity, which keeps every
 * reported figure consistent with the standard finance formulas above.
 */
export function projectScenario(
  startingValueCents: number,
  contributionCents: number,
  periodsPerYear: number,
  years: number,
  scenario: ProjectionScenario,
): ScenarioProjection {
  const periodicRate = scenario.annualReturnRate / periodsPerYear;
  const series: ProjectionYearPoint[] = [];

  let previousEndCents = startingValueCents;
  let previousCumulativeContributionsCents = 0;

  for (let year = 0; year <= years; year += 1) {
    const periods = periodsPerYear * year;
    const endValueCents =
      futureValueLumpSum(startingValueCents, periodicRate, periods) +
      futureValueAnnuity(contributionCents, periodicRate, periods);
    const cumulativeContributionsCents = roundCents(contributionCents * periods);
    const cumulativeGrowthCents = endValueCents - startingValueCents - cumulativeContributionsCents;
    const contributionsThisYearCents =
      cumulativeContributionsCents - previousCumulativeContributionsCents;
    const growthThisYearCents = endValueCents - previousEndCents - contributionsThisYearCents;

    series.push({
      year,
      startValueCents: previousEndCents,
      endValueCents,
      contributionsThisYearCents,
      growthThisYearCents,
      cumulativeContributionsCents,
      cumulativeGrowthCents,
    });

    previousEndCents = endValueCents;
    previousCumulativeContributionsCents = cumulativeContributionsCents;
  }

  const last = series[series.length - 1];

  return {
    scenario,
    startingValueCents,
    finalValueCents: last.endValueCents,
    totalContributionsCents: last.cumulativeContributionsCents,
    totalGrowthCents: last.cumulativeGrowthCents,
    series,
  };
}

/**
 * Project the future value of a portfolio plus recurring contributions across
 * one or more return scenarios.
 *
 * @param input See {@link ProjectionInput}.
 * @returns A {@link ProjectionResult} with one {@link ScenarioProjection} per scenario.
 */
export function projectPortfolioGrowth(input: ProjectionInput): ProjectionResult {
  const scenarios =
    input.scenarios && input.scenarios.length > 0 ? input.scenarios : DEFAULT_PROJECTION_SCENARIOS;
  const years = clampProjectionYears(input.years);
  const startingValueCents = roundCents(Math.max(0, input.currentValueCents));
  const contributionCents = roundCents(Math.max(0, input.contributionCents));
  const periodsPerYear = periodsPerYearForFrequency(input.contributionFrequency);

  return {
    startingValueCents,
    years,
    contributionCents,
    contributionFrequency: input.contributionFrequency,
    periodsPerYear,
    scenarios: scenarios.map((scenario) =>
      projectScenario(startingValueCents, contributionCents, periodsPerYear, years, scenario),
    ),
  };
}

/**
 * Build conservative / expected / optimistic scenarios around an expected
 * real-return assumption.
 *
 * @param expectedAnnualReturnRate Expected annual return as a decimal.
 * @param spread Symmetric +/- spread applied to derive the bookend scenarios.
 */
export function deriveProjectionScenarios(
  expectedAnnualReturnRate: number,
  spread = 0.03,
): readonly ProjectionScenario[] {
  return [
    {
      id: 'conservative',
      label: 'Conservative',
      annualReturnRate: expectedAnnualReturnRate - spread,
    },
    { id: 'expected', label: 'Expected', annualReturnRate: expectedAnnualReturnRate },
    {
      id: 'optimistic',
      label: 'Optimistic',
      annualReturnRate: expectedAnnualReturnRate + spread,
    },
  ];
}

/** A chart-ready row: a `label` plus one numeric value per series key. */
export interface ProjectionChartRow {
  label: string;
  [seriesKey: string]: number | string;
}

/** A chart series descriptor compatible with `TrendLineChart`. */
export interface ProjectionChartSeries {
  readonly dataKey: string;
  readonly name: string;
}

/** Chart-ready representation of a projection result. */
export interface ProjectionChartData {
  readonly data: readonly ProjectionChartRow[];
  readonly series: readonly ProjectionChartSeries[];
}

/**
 * Convert a {@link ProjectionResult} into chart rows + series for the shared
 * `TrendLineChart`. Adds a "Total invested" baseline (starting value plus
 * cumulative contributions, no growth) so the gap between each scenario line
 * and the baseline visualises compound growth — and is also conveyed in the
 * chart's text/data-table alternatives (not by colour alone).
 */
export function buildProjectionChartData(result: ProjectionResult): ProjectionChartData {
  const baseScenario = result.scenarios[0];
  const rowCount = baseScenario ? baseScenario.series.length : 0;

  const data: ProjectionChartRow[] = Array.from({ length: rowCount }, (_unused, index) => {
    const row: ProjectionChartRow = {
      label: index === 0 ? 'Now' : `Yr ${index}`,
    };
    for (const scenarioProjection of result.scenarios) {
      const point = scenarioProjection.series[index];
      row[scenarioProjection.scenario.id] = point ? point.endValueCents : 0;
    }
    const baselinePoint = baseScenario ? baseScenario.series[index] : undefined;
    row.contributions = baselinePoint
      ? result.startingValueCents + baselinePoint.cumulativeContributionsCents
      : result.startingValueCents;
    return row;
  });

  const series: ProjectionChartSeries[] = [
    ...result.scenarios.map((scenarioProjection) => ({
      dataKey: scenarioProjection.scenario.id,
      name: scenarioProjection.scenario.label,
    })),
    { dataKey: 'contributions', name: 'Total invested' },
  ];

  return { data, series };
}
