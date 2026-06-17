// SPDX-License-Identifier: BUSL-1.1

import { comparePortfolioToBenchmark } from './benchmark-comparison';
import type { BenchmarkComparisonResult, BenchmarkPoint, PortfolioPerformancePoint } from './benchmark-comparison';

/** Portfolio history to benchmark comparison adapter with coverage diagnostics (#2483, #2485). */

export type BenchmarkRangeKey = '1M' | '3M' | 'YTD' | '1Y' | '5Y' | 'ALL';

export interface PortfolioValuationSnapshot {
  readonly date: string;
  readonly valueCents: number;
  readonly missingPriceSymbols?: readonly string[];
}

export interface PortfolioCashFlowEvent {
  readonly date: string;
  readonly amountCents: number;
}

export interface BenchmarkSourceAttribution {
  readonly label: string;
  readonly url?: string;
  readonly retrievedAt?: string;
}

export interface PortfolioBenchmarkAdapterResult {
  readonly requestedRange: BenchmarkRangeKey;
  readonly requestedStartDate: string;
  readonly requestedEndDate: string;
  readonly comparison: BenchmarkComparisonResult;
  readonly portfolioPoints: readonly PortfolioPerformancePoint[];
  readonly benchmarkPoints: readonly BenchmarkPoint[];
  readonly coverageWarnings: readonly string[];
  readonly benchmarkSource: BenchmarkSourceAttribution;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function resolveBenchmarkRange(params: {
  readonly range: BenchmarkRangeKey;
  readonly asOfDate: string;
  readonly firstPortfolioDate?: string;
}): { readonly startDate: string; readonly endDate: string } {
  const end = new Date(`${params.asOfDate}T00:00:00.000Z`);
  if (params.range === '1M') return { startDate: isoDate(addMonths(end, -1)), endDate: params.asOfDate };
  if (params.range === '3M') return { startDate: isoDate(addMonths(end, -3)), endDate: params.asOfDate };
  if (params.range === '1Y') return { startDate: isoDate(addMonths(end, -12)), endDate: params.asOfDate };
  if (params.range === '5Y') return { startDate: isoDate(addMonths(end, -60)), endDate: params.asOfDate };
  if (params.range === 'YTD') return { startDate: `${params.asOfDate.slice(0, 4)}-01-01`, endDate: params.asOfDate };
  return { startDate: params.firstPortfolioDate ?? params.asOfDate, endDate: params.asOfDate };
}

function firstOnOrAfter<T extends { readonly date: string }>(points: readonly T[], date: string): T | undefined {
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).find((point) => point.date >= date);
}

function lastOnOrBefore<T extends { readonly date: string }>(points: readonly T[], date: string): T | undefined {
  return [...points].sort((a, b) => b.date.localeCompare(a.date)).find((point) => point.date <= date);
}

function uniqueSorted<T extends { readonly date: string }>(points: readonly T[]): readonly T[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildPortfolioBenchmarkComparison(params: {
  readonly valuationHistory: readonly PortfolioValuationSnapshot[];
  readonly cashFlows?: readonly PortfolioCashFlowEvent[];
  readonly benchmarkHistory: readonly BenchmarkPoint[];
  readonly range: BenchmarkRangeKey;
  readonly asOfDate: string;
  readonly benchmarkSource: BenchmarkSourceAttribution;
  readonly benchmarkLabel?: string;
}): PortfolioBenchmarkAdapterResult {
  const sortedValuations = uniqueSorted(params.valuationHistory);
  const requested = resolveBenchmarkRange({
    range: params.range,
    asOfDate: params.asOfDate,
    firstPortfolioDate: sortedValuations[0]?.date,
  });
  const warnings: string[] = [];
  const start = firstOnOrAfter(sortedValuations, requested.startDate);
  const end = lastOnOrBefore(sortedValuations, requested.endDate);

  if (!start || !end) warnings.push('Portfolio valuation history does not cover the selected range.');
  if (start && start.date !== requested.startDate) warnings.push('Portfolio start date was aligned to first available valuation.');
  if (end && end.date !== requested.endDate) warnings.push('Portfolio end date was aligned to latest available valuation.');

  const missingSymbols = new Set<string>();
  for (const point of sortedValuations.filter((valuation) => valuation.date >= requested.startDate && valuation.date <= requested.endDate)) {
    for (const symbol of point.missingPriceSymbols ?? []) missingSymbols.add(symbol);
  }
  if (missingSymbols.size > 0) warnings.push(`Missing historical prices for: ${[...missingSymbols].sort().join(', ')}.`);

  const startDate = start?.date ?? requested.startDate;
  const endDate = end?.date ?? requested.endDate;
  const cashFlowByDate = new Map<string, number>();
  for (const flow of params.cashFlows ?? []) {
    if (flow.date > startDate && flow.date <= endDate) {
      cashFlowByDate.set(flow.date, (cashFlowByDate.get(flow.date) ?? 0) + flow.amountCents);
    }
  }

  const portfolioPoints: PortfolioPerformancePoint[] = sortedValuations
    .filter((valuation) => valuation.date >= startDate && valuation.date <= endDate)
    .map((valuation) => ({
      date: valuation.date,
      valueCents: valuation.valueCents,
      netCashFlowCents: cashFlowByDate.get(valuation.date) ?? 0,
    }));

  const unappliedCashFlowDates = [...cashFlowByDate.keys()].filter(
    (date) => !portfolioPoints.some((point) => point.date === date),
  );
  if (unappliedCashFlowDates.length > 0) {
    warnings.push(`Cash-flow events without same-day valuations were not included: ${unappliedCashFlowDates.sort().join(', ')}.`);
  }

  const benchmarkPoints = params.benchmarkHistory.filter((point) => point.date >= startDate && point.date <= endDate);
  if (benchmarkPoints.length < 2) warnings.push('Benchmark history has fewer than two points in the aligned range.');

  const comparison = comparePortfolioToBenchmark({
    portfolioPoints,
    benchmarkPoints,
    startDate,
    endDate,
    benchmarkLabel: params.benchmarkLabel ?? params.benchmarkSource.label,
  });

  return {
    requestedRange: params.range,
    requestedStartDate: requested.startDate,
    requestedEndDate: requested.endDate,
    comparison,
    portfolioPoints,
    benchmarkPoints,
    coverageWarnings: [...warnings, ...comparison.warnings],
    benchmarkSource: params.benchmarkSource,
  };
}
