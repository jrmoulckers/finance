// SPDX-License-Identifier: BUSL-1.1

/** Benchmark comparison utilities for S&P-style portfolio performance (#2248). */

export interface PortfolioPerformancePoint {
  readonly date: string;
  readonly valueCents: number;
  readonly netCashFlowCents?: number;
}

export interface BenchmarkPoint {
  readonly date: string;
  readonly totalReturnIndex: number;
}

export interface BenchmarkComparisonInput {
  readonly portfolioPoints: readonly PortfolioPerformancePoint[];
  readonly benchmarkPoints: readonly BenchmarkPoint[];
  readonly startDate: string;
  readonly endDate: string;
  readonly benchmarkLabel?: string;
}

export interface BenchmarkComparisonResult {
  readonly startDate: string;
  readonly endDate: string;
  readonly benchmarkLabel: string;
  readonly portfolioReturnPercent: number;
  readonly benchmarkReturnPercent: number;
  readonly deltaPercent: number;
  readonly annualizedPortfolioReturnPercent: number;
  readonly annualizedBenchmarkReturnPercent: number;
  readonly warnings: readonly string[];
}

function parseDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function dayDiff(startDate: string, endDate: string): number {
  return Math.max(1, (parseDate(endDate) - parseDate(startDate)) / 86_400_000);
}

function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function annualize(returnDecimal: number, days: number): number {
  if (returnDecimal <= -1) return -100;
  return roundPercent(Math.pow(1 + returnDecimal, 365 / days) - 1);
}

function pointOnOrAfter(
  points: readonly BenchmarkPoint[],
  date: string,
): BenchmarkPoint | undefined {
  return [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((point) => point.date >= date);
}

function pointOnOrBefore(
  points: readonly BenchmarkPoint[],
  date: string,
): BenchmarkPoint | undefined {
  return [...points]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((point) => point.date <= date);
}

export function calculateModifiedDietzReturn(
  points: readonly PortfolioPerformancePoint[],
  startDate: string,
  endDate: string,
): number {
  const sorted = [...points]
    .filter((point) => point.date >= startDate && point.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0];
  const end = sorted.at(-1);
  if (!start || !end || start.date !== startDate || end.date !== endDate) return 0;

  const totalDays = dayDiff(startDate, endDate);
  const flows = sorted.filter((point) => point.date > startDate && point.netCashFlowCents !== 0);
  const totalFlows = flows.reduce((sum, point) => sum + (point.netCashFlowCents ?? 0), 0);
  const weightedFlows = flows.reduce((sum, point) => {
    const weight = (parseDate(endDate) - parseDate(point.date)) / 86_400_000 / totalDays;
    return sum + (point.netCashFlowCents ?? 0) * weight;
  }, 0);
  const denominator = start.valueCents + weightedFlows;
  if (denominator === 0) return 0;
  return (end.valueCents - start.valueCents - totalFlows) / denominator;
}

export function comparePortfolioToBenchmark(
  input: BenchmarkComparisonInput,
): BenchmarkComparisonResult {
  const warnings: string[] = [];
  const benchmarkStart = pointOnOrAfter(input.benchmarkPoints, input.startDate);
  const benchmarkEnd = pointOnOrBefore(input.benchmarkPoints, input.endDate);
  if (!benchmarkStart || !benchmarkEnd)
    warnings.push('Benchmark data does not cover the selected range.');
  if (benchmarkStart && benchmarkStart.date !== input.startDate) {
    warnings.push('Benchmark start date was aligned to first available data point.');
  }
  if (benchmarkEnd && benchmarkEnd.date !== input.endDate) {
    warnings.push('Benchmark end date was aligned to latest available data point.');
  }

  const portfolioReturn = calculateModifiedDietzReturn(
    input.portfolioPoints,
    input.startDate,
    input.endDate,
  );
  const benchmarkReturn =
    benchmarkStart && benchmarkEnd && benchmarkStart.totalReturnIndex !== 0
      ? benchmarkEnd.totalReturnIndex / benchmarkStart.totalReturnIndex - 1
      : 0;
  const days = dayDiff(input.startDate, input.endDate);

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    benchmarkLabel: input.benchmarkLabel ?? 'S&P 500 Total Return',
    portfolioReturnPercent: roundPercent(portfolioReturn),
    benchmarkReturnPercent: roundPercent(benchmarkReturn),
    deltaPercent: roundPercent(portfolioReturn - benchmarkReturn),
    annualizedPortfolioReturnPercent: annualize(portfolioReturn, days),
    annualizedBenchmarkReturnPercent: annualize(benchmarkReturn, days),
    warnings,
  };
}
