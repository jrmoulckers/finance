// SPDX-License-Identifier: BUSL-1.1

/**
 * Risk-adjusted analytics and portfolio stress testing.
 *
 * Computes Sharpe ratio, Sortino ratio, max drawdown, standard deviation,
 * VaR (95%/99%), portfolio beta, correlation matrices, and stress test
 * scenarios (2008 crash, COVID, rate hike).
 *
 * All monetary values are integer cents. Percentages are plain numbers.
 * Pure functions — no side effects or mutations.
 *
 * References: issues #1617, #1698
 */

import type {
  Cents,
  CorrelationEntry,
  Percent,
  RiskMetrics,
  StressScenario,
  StressTestResult,
} from './types';
import { bankersRound, safeDivide } from './trade-import';

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Compute the arithmetic mean of an array of numbers.
 *
 * @param values - Numeric array.
 * @returns Mean value, or 0 for empty arrays.
 */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return safeDivide(
    values.reduce((a, b) => a + b, 0),
    values.length,
  );
}

/**
 * Compute the sample standard deviation.
 *
 * Uses Bessel's correction (n-1 denominator).
 *
 * @param values - Numeric array.
 * @returns Sample standard deviation, or 0 for fewer than 2 values.
 */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sumSqDiff = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
  return Math.sqrt(safeDivide(sumSqDiff, values.length - 1));
}

/**
 * Compute downside deviation (semi-deviation below a target return).
 *
 * Only negative deviations from the target are included.
 *
 * @param values - Array of periodic returns (percentages).
 * @param targetReturn - Minimum acceptable return (percentage, default 0).
 * @returns Downside deviation.
 */
export function downsideDeviation(values: readonly number[], targetReturn: number = 0): number {
  if (values.length < 2) return 0;
  const downsideSqDiffs = values
    .filter((v) => v < targetReturn)
    .map((v) => (v - targetReturn) ** 2);

  if (downsideSqDiffs.length === 0) return 0;
  return Math.sqrt(
    safeDivide(
      downsideSqDiffs.reduce((a, b) => a + b, 0),
      values.length,
    ),
  );
}

// ---------------------------------------------------------------------------
// Risk ratios
// ---------------------------------------------------------------------------

/**
 * Compute the Sharpe ratio.
 *
 * Sharpe = (annualized return − risk-free rate) / annualized std dev.
 *
 * @param monthlyReturns - Array of monthly return percentages.
 * @param annualRiskFreeRate - Annual risk-free rate as a percentage (default 4.5%).
 * @returns Sharpe ratio rounded to 2 decimals, or 0 if insufficient data.
 */
export function computeSharpeRatio(
  monthlyReturns: readonly number[],
  annualRiskFreeRate: Percent = 4.5,
): number {
  if (monthlyReturns.length < 2) return 0;

  const monthlyMean = mean(monthlyReturns);
  const annualizedReturn = monthlyMean * 12;
  const annualizedStdDev = standardDeviation(monthlyReturns) * Math.sqrt(12);

  const excessReturn = annualizedReturn - annualRiskFreeRate;
  return Math.round(safeDivide(excessReturn, annualizedStdDev) * 100) / 100;
}

/**
 * Compute the Sortino ratio.
 *
 * Sortino = (annualized return − risk-free rate) / annualized downside deviation.
 *
 * @param monthlyReturns - Array of monthly return percentages.
 * @param annualRiskFreeRate - Annual risk-free rate as a percentage (default 4.5%).
 * @returns Sortino ratio rounded to 2 decimals, or 0 if insufficient data.
 */
export function computeSortinoRatio(
  monthlyReturns: readonly number[],
  annualRiskFreeRate: Percent = 4.5,
): number {
  if (monthlyReturns.length < 2) return 0;

  const monthlyMean = mean(monthlyReturns);
  const annualizedReturn = monthlyMean * 12;
  const monthlyRiskFreeRate = annualRiskFreeRate / 12;
  const annualizedDownside = downsideDeviation(monthlyReturns, monthlyRiskFreeRate) * Math.sqrt(12);

  const excessReturn = annualizedReturn - annualRiskFreeRate;
  return Math.round(safeDivide(excessReturn, annualizedDownside) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Drawdown
// ---------------------------------------------------------------------------

/**
 * Compute the maximum drawdown from a series of portfolio values.
 *
 * Max drawdown is the largest peak-to-trough decline as a percentage.
 *
 * @param values - Array of portfolio values (cents) over time.
 * @returns Maximum drawdown as a negative percentage, or 0 if no drawdown.
 */
export function computeMaxDrawdown(values: readonly number[]): Percent {
  if (values.length < 2) return 0;

  let peak = values[0];
  let maxDd = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
    }
    const dd = safeDivide(values[i] - peak, peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }

  return Math.round(maxDd * 100) / 100;
}

// ---------------------------------------------------------------------------
// Value at Risk (VaR) — historical simulation
// ---------------------------------------------------------------------------

/**
 * Compute Value at Risk using the historical simulation method.
 *
 * Sorts historical returns and picks the percentile cutoff.
 *
 * @param monthlyReturns - Array of monthly return percentages.
 * @param portfolioValueCents - Current portfolio value in cents.
 * @param confidenceLevel - Confidence level (0.95 or 0.99).
 * @returns VaR as a positive cents value representing potential loss.
 */
export function computeVaR(
  monthlyReturns: readonly number[],
  portfolioValueCents: Cents,
  confidenceLevel: number,
): Cents {
  if (monthlyReturns.length === 0) return 0;

  const sorted = [...monthlyReturns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sorted.length);
  const cutoffReturn = sorted[Math.max(0, index)] / 100;

  // VaR is expressed as a positive number (potential loss)
  const loss = -cutoffReturn * portfolioValueCents;
  return Math.max(0, bankersRound(loss));
}

// ---------------------------------------------------------------------------
// Correlation matrix
// ---------------------------------------------------------------------------

/**
 * Compute Pearson correlation between two series.
 *
 * @param a - First numeric series.
 * @param b - Second numeric series.
 * @returns Correlation coefficient (−1 to 1), or 0 if insufficient data.
 */
export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const aSlice = a.slice(0, n);
  const bSlice = b.slice(0, n);
  const aMean = mean(aSlice);
  const bMean = mean(bSlice);

  let sumProduct = 0;
  let sumASq = 0;
  let sumBSq = 0;

  for (let i = 0; i < n; i++) {
    const aDiff = aSlice[i] - aMean;
    const bDiff = bSlice[i] - bMean;
    sumProduct += aDiff * bDiff;
    sumASq += aDiff * aDiff;
    sumBSq += bDiff * bDiff;
  }

  const denominator = Math.sqrt(sumASq * sumBSq);
  if (denominator === 0) return 0;

  return Math.round(safeDivide(sumProduct, denominator) * 100) / 100;
}

/**
 * Build a correlation matrix between multiple holdings.
 *
 * @param holdingReturns - Map of symbol → array of monthly returns.
 * @returns Array of correlation entries for each unique pair.
 */
export function buildCorrelationMatrix(
  holdingReturns: ReadonlyMap<string, readonly number[]>,
): CorrelationEntry[] {
  const symbols = Array.from(holdingReturns.keys());
  const entries: CorrelationEntry[] = [];

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const aReturns = holdingReturns.get(symbols[i]) ?? [];
      const bReturns = holdingReturns.get(symbols[j]) ?? [];
      entries.push({
        symbolA: symbols[i],
        symbolB: symbols[j],
        correlation: pearsonCorrelation(aReturns, bReturns),
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Full risk metrics
// ---------------------------------------------------------------------------

/**
 * Compute comprehensive risk metrics for a portfolio.
 *
 * @param monthlyReturns - Array of monthly return percentages.
 * @param portfolioValueCents - Current portfolio value in cents.
 * @param benchmarkMonthlyReturns - Benchmark monthly returns for beta calc.
 * @param annualRiskFreeRate - Annual risk-free rate (percentage, default 4.5%).
 * @returns Full risk metrics.
 */
export function computeRiskMetrics(
  monthlyReturns: readonly number[],
  portfolioValueCents: Cents,
  benchmarkMonthlyReturns: readonly number[],
  annualRiskFreeRate: Percent = 4.5,
): RiskMetrics {
  const stdDev = standardDeviation(monthlyReturns);
  const annualizedStdDev = Math.round(stdDev * Math.sqrt(12) * 100) / 100;

  // Beta calculation
  const n = Math.min(monthlyReturns.length, benchmarkMonthlyReturns.length);
  let beta = 0;
  if (n >= 2) {
    const portSlice = monthlyReturns.slice(0, n);
    const benchSlice = benchmarkMonthlyReturns.slice(0, n);
    const portMean = mean(portSlice);
    const benchMean = mean(benchSlice);

    let covariance = 0;
    let benchVariance = 0;
    for (let i = 0; i < n; i++) {
      const pDiff = portSlice[i] - portMean;
      const bDiff = benchSlice[i] - benchMean;
      covariance += pDiff * bDiff;
      benchVariance += bDiff * bDiff;
    }
    covariance = safeDivide(covariance, n);
    benchVariance = safeDivide(benchVariance, n);
    beta = Math.round(safeDivide(covariance, benchVariance) * 100) / 100;
  }

  return {
    standardDeviationPercent: annualizedStdDev,
    sharpeRatio: computeSharpeRatio(monthlyReturns, annualRiskFreeRate),
    sortinoRatio: computeSortinoRatio(monthlyReturns, annualRiskFreeRate),
    maxDrawdownPercent: 0, // Requires portfolio value history, not monthly returns
    var95Cents: computeVaR(monthlyReturns, portfolioValueCents, 0.95),
    var99Cents: computeVaR(monthlyReturns, portfolioValueCents, 0.99),
    beta,
  };
}

// ---------------------------------------------------------------------------
// Stress test scenarios
// ---------------------------------------------------------------------------

/** Pre-built stress test scenario definitions. */
export const STRESS_SCENARIOS: readonly {
  name: string;
  description: string;
  equityDecline: Percent;
  bondChange: Percent;
  realEstateDecline: Percent;
  cryptoDecline: Percent;
}[] = [
  {
    name: '2008 Financial Crisis',
    description: 'Severe financial crisis with major equity and real estate losses.',
    equityDecline: -50,
    bondChange: 5,
    realEstateDecline: -35,
    cryptoDecline: -75,
  },
  {
    name: 'COVID-19 Crash (2020)',
    description: 'Rapid market selloff followed by swift recovery.',
    equityDecline: -34,
    bondChange: 3,
    realEstateDecline: -10,
    cryptoDecline: -50,
  },
  {
    name: 'Aggressive Rate Hike',
    description: 'Central bank rapidly raises rates, impacting bonds and growth stocks.',
    equityDecline: -20,
    bondChange: -15,
    realEstateDecline: -15,
    cryptoDecline: -40,
  },
  {
    name: 'Dot-Com Bust (2000)',
    description: 'Technology bubble collapse with prolonged recovery.',
    equityDecline: -45,
    bondChange: 10,
    realEstateDecline: -5,
    cryptoDecline: -80,
  },
];

/** Asset class to scenario impact mapping. */
type AssetClassKey =
  | 'US_STOCKS'
  | 'INTERNATIONAL_STOCKS'
  | 'BONDS'
  | 'REAL_ESTATE'
  | 'COMMODITIES'
  | 'CASH'
  | 'CRYPTO'
  | 'OTHER';

/**
 * Get the scenario impact percentage for a given asset class.
 *
 * @param assetClass - The asset class.
 * @param scenario - A stress scenario definition.
 * @returns Impact percentage for that asset class under the scenario.
 */
function getAssetClassImpact(
  assetClass: AssetClassKey,
  scenario: (typeof STRESS_SCENARIOS)[number],
): Percent {
  switch (assetClass) {
    case 'US_STOCKS':
    case 'INTERNATIONAL_STOCKS':
      return scenario.equityDecline;
    case 'BONDS':
      return scenario.bondChange;
    case 'REAL_ESTATE':
      return scenario.realEstateDecline;
    case 'CRYPTO':
      return scenario.cryptoDecline;
    case 'COMMODITIES':
      return scenario.equityDecline * 0.5;
    case 'CASH':
      return 0;
    case 'OTHER':
      return scenario.equityDecline * 0.3;
    default:
      return 0;
  }
}

/**
 * Run stress test scenarios against a portfolio.
 *
 * Applies each scenario's asset-class impacts to compute estimated
 * portfolio losses.
 *
 * @param holdings - Array of {assetClass, marketValueCents} objects.
 * @param scenarios - Stress scenarios to run (defaults to built-in scenarios).
 * @returns Stress test results with per-scenario impact.
 */
export function runStressTests(
  holdings: readonly { assetClass: AssetClassKey; marketValueCents: Cents }[],
  scenarios: readonly (typeof STRESS_SCENARIOS)[number][] = STRESS_SCENARIOS,
): StressTestResult {
  const currentValueCents = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);

  const results: StressScenario[] = scenarios.map((scenario) => {
    let estimatedValueCents = 0;

    for (const holding of holdings) {
      const impact = getAssetClassImpact(holding.assetClass, scenario);
      const holdingAfter = bankersRound(holding.marketValueCents * (1 + impact / 100));
      estimatedValueCents += holdingAfter;
    }

    const estimatedLossCents = currentValueCents - estimatedValueCents;
    const impactPercent =
      currentValueCents > 0
        ? Math.round(safeDivide(-estimatedLossCents, currentValueCents) * 10000) / 100
        : 0;

    return {
      name: scenario.name,
      description: scenario.description,
      impactPercent,
      estimatedValueCents,
      estimatedLossCents,
    };
  });

  return {
    currentValueCents,
    scenarios: results,
  };
}
