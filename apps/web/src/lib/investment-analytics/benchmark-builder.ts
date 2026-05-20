// SPDX-License-Identifier: BUSL-1.1

/**
 * Benchmark comparison and custom benchmark builder.
 *
 * Defines standard benchmarks (S&P 500, Total Market, 60/40), supports
 * custom weighted-index blending, computes period return comparisons
 * (1m/3m/6m/1y/3y/5y), tracking error, alpha, beta, and information ratio.
 *
 * All percentages are plain numbers (e.g., 7 = 7%). Basis points used
 * where precision matters. Pure functions — no side effects.
 *
 * References: issues #1609, #1698
 */

import type {
  BasisPoints,
  Benchmark,
  BenchmarkComparison,
  BenchmarkComponent,
  Percent,
  PeriodComparisonEntry,
  PeriodReturn,
} from './types';
import { bankersRound, safeDivide } from './trade-import';

// ---------------------------------------------------------------------------
// Standard benchmark definitions
// ---------------------------------------------------------------------------

/** S&P 500 benchmark — large-cap US equities. */
export const SP500_BENCHMARK: Benchmark = {
  id: 'sp500',
  name: 'S&P 500',
  description: 'Large-cap US equities (500 largest companies).',
  components: [{ indexId: 'sp500', name: 'S&P 500', weightPercent: 100 }],
};

/** Total US stock market benchmark. */
export const TOTAL_MARKET_BENCHMARK: Benchmark = {
  id: 'total-market',
  name: 'Total US Stock Market',
  description: 'Broad US equity exposure across all market caps.',
  components: [{ indexId: 'total-us', name: 'Total US Stock Market', weightPercent: 100 }],
};

/** Classic 60/40 stock/bond blend. */
export const BALANCED_60_40_BENCHMARK: Benchmark = {
  id: '60-40',
  name: '60/40 Balanced',
  description: '60% US stocks, 40% US bonds — classic moderate allocation.',
  components: [
    { indexId: 'sp500', name: 'S&P 500', weightPercent: 60 },
    { indexId: 'agg-bond', name: 'US Aggregate Bond', weightPercent: 40 },
  ],
};

/** All built-in benchmark definitions. */
export const STANDARD_BENCHMARKS: readonly Benchmark[] = [
  SP500_BENCHMARK,
  TOTAL_MARKET_BENCHMARK,
  BALANCED_60_40_BENCHMARK,
];

/** Standard return periods for comparison. */
export const STANDARD_PERIODS: readonly { label: string; months: number }[] = [
  { label: '1 Month', months: 1 },
  { label: '3 Months', months: 3 },
  { label: '6 Months', months: 6 },
  { label: '1 Year', months: 12 },
  { label: '3 Years', months: 36 },
  { label: '5 Years', months: 60 },
];

// ---------------------------------------------------------------------------
// Custom benchmark builder
// ---------------------------------------------------------------------------

/**
 * Validate that benchmark components sum to 100%.
 *
 * @param components - Array of weighted benchmark components.
 * @returns True if weights sum to exactly 100.
 */
export function validateBenchmarkWeights(components: readonly BenchmarkComponent[]): boolean {
  if (components.length === 0) return false;
  const sum = components.reduce((acc, c) => acc + c.weightPercent, 0);
  return Math.abs(sum - 100) < 0.01;
}

/**
 * Create a custom blended benchmark from weighted index components.
 *
 * @param name - Display name for the benchmark.
 * @param description - Human-readable description.
 * @param components - Weighted index components (must sum to 100%).
 * @returns A Benchmark object or null if weights are invalid.
 */
export function buildCustomBenchmark(
  name: string,
  description: string,
  components: readonly BenchmarkComponent[],
): Benchmark | null {
  if (!validateBenchmarkWeights(components)) return null;

  return {
    id: `custom-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    description,
    components,
  };
}

// ---------------------------------------------------------------------------
// Blended return calculation
// ---------------------------------------------------------------------------

/**
 * Compute the blended return of a benchmark from its component returns.
 *
 * Each component's return is weighted by its allocation percentage.
 *
 * @param components - Benchmark components with weights.
 * @param componentReturns - Map of indexId to return percentage for the period.
 * @returns Weighted blended return as a percentage.
 */
export function computeBlendedReturn(
  components: readonly BenchmarkComponent[],
  componentReturns: ReadonlyMap<string, Percent>,
): Percent {
  let blended = 0;
  for (const comp of components) {
    const ret = componentReturns.get(comp.indexId) ?? 0;
    blended += (comp.weightPercent / 100) * ret;
  }
  return Math.round(blended * 100) / 100;
}

/**
 * Compute period returns for a benchmark across standard periods.
 *
 * @param benchmark - The benchmark definition.
 * @param periodReturns - Map of indexId → Map of months → return percent.
 * @returns Array of period returns for the blended benchmark.
 */
export function computeBenchmarkPeriodReturns(
  benchmark: Benchmark,
  periodReturns: ReadonlyMap<string, ReadonlyMap<number, Percent>>,
): PeriodReturn[] {
  return STANDARD_PERIODS.map(({ label, months }) => {
    const componentReturns = new Map<string, Percent>();
    for (const comp of benchmark.components) {
      const indexReturns = periodReturns.get(comp.indexId);
      componentReturns.set(comp.indexId, indexReturns?.get(months) ?? 0);
    }
    return {
      label,
      months,
      returnPercent: computeBlendedReturn(benchmark.components, componentReturns),
    };
  });
}

// ---------------------------------------------------------------------------
// Alpha, Beta, Tracking Error, Information Ratio
// ---------------------------------------------------------------------------

/**
 * Compute the beta of a portfolio relative to a benchmark.
 *
 * Beta = Covariance(portfolio, benchmark) / Variance(benchmark).
 *
 * @param portfolioReturns - Array of periodic portfolio returns (percentages).
 * @param benchmarkReturns - Array of periodic benchmark returns (percentages).
 * @returns Beta coefficient, or 0 if insufficient data.
 */
export function computeBeta(
  portfolioReturns: readonly number[],
  benchmarkReturns: readonly number[],
): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const portSlice = portfolioReturns.slice(0, n);
  const benchSlice = benchmarkReturns.slice(0, n);

  const portMean = safeDivide(
    portSlice.reduce((a, b) => a + b, 0),
    n,
  );
  const benchMean = safeDivide(
    benchSlice.reduce((a, b) => a + b, 0),
    n,
  );

  let covariance = 0;
  let benchVariance = 0;

  for (let i = 0; i < n; i++) {
    const portDiff = portSlice[i] - portMean;
    const benchDiff = benchSlice[i] - benchMean;
    covariance += portDiff * benchDiff;
    benchVariance += benchDiff * benchDiff;
  }

  covariance = safeDivide(covariance, n);
  benchVariance = safeDivide(benchVariance, n);

  return Math.round(safeDivide(covariance, benchVariance) * 100) / 100;
}

/**
 * Compute tracking error (annualized standard deviation of excess returns).
 *
 * @param portfolioReturns - Array of periodic portfolio returns (percentages).
 * @param benchmarkReturns - Array of periodic benchmark returns (percentages).
 * @returns Tracking error in basis points.
 */
export function computeTrackingError(
  portfolioReturns: readonly number[],
  benchmarkReturns: readonly number[],
): BasisPoints {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const excessReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    excessReturns.push(portfolioReturns[i] - benchmarkReturns[i]);
  }

  const mean = safeDivide(
    excessReturns.reduce((a, b) => a + b, 0),
    n,
  );

  const variance = safeDivide(
    excessReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0),
    n - 1,
  );

  // Annualize assuming monthly data (× √12)
  const annualizedStdDev = Math.sqrt(variance) * Math.sqrt(12);

  return bankersRound(annualizedStdDev * 100);
}

/**
 * Compute annualized alpha.
 *
 * Alpha = annualized portfolio return − beta × annualized benchmark return.
 * Simplified Jensen's alpha without explicit risk-free rate subtraction
 * (assumes risk-free is embedded in returns).
 *
 * @param annualizedPortfolioReturn - Annualized portfolio return (percentage).
 * @param annualizedBenchmarkReturn - Annualized benchmark return (percentage).
 * @param beta - Portfolio beta relative to benchmark.
 * @returns Alpha in basis points.
 */
export function computeAlpha(
  annualizedPortfolioReturn: Percent,
  annualizedBenchmarkReturn: Percent,
  beta: number,
): BasisPoints {
  const alpha = annualizedPortfolioReturn - beta * annualizedBenchmarkReturn;
  return bankersRound(alpha * 100);
}

/**
 * Compute the information ratio (alpha / tracking error).
 *
 * @param alphaBps - Alpha in basis points.
 * @param trackingErrorBps - Tracking error in basis points.
 * @returns Information ratio, or 0 if tracking error is zero.
 */
export function computeInformationRatio(
  alphaBps: BasisPoints,
  trackingErrorBps: BasisPoints,
): number {
  return Math.round(safeDivide(alphaBps, trackingErrorBps) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Full benchmark comparison
// ---------------------------------------------------------------------------

/**
 * Build a full benchmark comparison between a portfolio and a benchmark.
 *
 * @param benchmarkName - Display name of the benchmark.
 * @param portfolioPeriodReturns - Portfolio returns by period (label → percent).
 * @param benchmarkPeriodReturns - Benchmark returns by period (label → percent).
 * @param portfolioMonthlyReturns - Monthly portfolio returns for alpha/beta calc.
 * @param benchmarkMonthlyReturns - Monthly benchmark returns for alpha/beta calc.
 * @param annualizedPortfolioReturn - Annualized portfolio return (percent).
 * @param annualizedBenchmarkReturn - Annualized benchmark return (percent).
 * @returns Full benchmark comparison result.
 */
export function buildBenchmarkComparison(
  benchmarkName: string,
  portfolioPeriodReturns: ReadonlyMap<string, Percent>,
  benchmarkPeriodReturns: ReadonlyMap<string, Percent>,
  portfolioMonthlyReturns: readonly number[],
  benchmarkMonthlyReturns: readonly number[],
  annualizedPortfolioReturn: Percent,
  annualizedBenchmarkReturn: Percent,
): BenchmarkComparison {
  const periods: PeriodComparisonEntry[] = [];

  for (const { label, months } of STANDARD_PERIODS) {
    const portRet = portfolioPeriodReturns.get(label) ?? 0;
    const benchRet = benchmarkPeriodReturns.get(label) ?? 0;
    periods.push({
      label,
      months,
      portfolioReturnPercent: portRet,
      benchmarkReturnPercent: benchRet,
      differencePercent: Math.round((portRet - benchRet) * 100) / 100,
    });
  }

  const beta = computeBeta(portfolioMonthlyReturns, benchmarkMonthlyReturns);
  const trackingErrorBps = computeTrackingError(portfolioMonthlyReturns, benchmarkMonthlyReturns);
  const alphaBps = computeAlpha(annualizedPortfolioReturn, annualizedBenchmarkReturn, beta);
  const informationRatio = computeInformationRatio(alphaBps, trackingErrorBps);

  return {
    benchmarkName,
    periods,
    alphaBps,
    beta,
    trackingErrorBps,
    informationRatio,
  };
}
