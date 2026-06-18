// SPDX-License-Identifier: BUSL-1.1

import type { BenchmarkComparisonResult } from './benchmark-comparison';

/** UI-ready table/chart model and return-method copy for benchmark comparison (#2484). */

export interface BenchmarkMetricRow {
  readonly id:
    | 'portfolio-return'
    | 'benchmark-return'
    | 'delta'
    | 'portfolio-annualized'
    | 'benchmark-annualized';
  readonly label: string;
  readonly portfolioPercent: number | null;
  readonly benchmarkPercent: number | null;
  readonly deltaPercent: number | null;
}

export interface BenchmarkComparisonChartDatum {
  readonly label: string;
  readonly percent: number;
  readonly series: 'portfolio' | 'benchmark' | 'delta';
}

export interface BenchmarkComparisonPresentation {
  readonly title: string;
  readonly returnMethodLabel: string;
  readonly limitationCopy: string;
  readonly chart: readonly BenchmarkComparisonChartDatum[];
  readonly tableRows: readonly BenchmarkMetricRow[];
  readonly accessibleSummary: string;
  readonly warnings: readonly string[];
}

export function buildBenchmarkComparisonPresentation(
  comparison: BenchmarkComparisonResult,
): BenchmarkComparisonPresentation {
  const tableRows: BenchmarkMetricRow[] = [
    {
      id: 'portfolio-return',
      label: 'Contribution-adjusted portfolio return',
      portfolioPercent: comparison.portfolioReturnPercent,
      benchmarkPercent: null,
      deltaPercent: null,
    },
    {
      id: 'benchmark-return',
      label: comparison.benchmarkLabel,
      portfolioPercent: null,
      benchmarkPercent: comparison.benchmarkReturnPercent,
      deltaPercent: null,
    },
    {
      id: 'delta',
      label: 'Portfolio minus benchmark',
      portfolioPercent: null,
      benchmarkPercent: null,
      deltaPercent: comparison.deltaPercent,
    },
    {
      id: 'portfolio-annualized',
      label: 'Annualized portfolio return',
      portfolioPercent: comparison.annualizedPortfolioReturnPercent,
      benchmarkPercent: null,
      deltaPercent: null,
    },
    {
      id: 'benchmark-annualized',
      label: 'Annualized benchmark return',
      portfolioPercent: null,
      benchmarkPercent: comparison.annualizedBenchmarkReturnPercent,
      deltaPercent: null,
    },
  ];

  return {
    title: `Portfolio vs ${comparison.benchmarkLabel}`,
    returnMethodLabel: 'Modified Dietz contribution-adjusted return',
    limitationCopy:
      'Modified Dietz estimates the effect of contributions and withdrawals, but it is not a full time-weighted return when valuations or cash-flow dates are sparse.',
    chart: [
      { label: 'Portfolio', percent: comparison.portfolioReturnPercent, series: 'portfolio' },
      {
        label: comparison.benchmarkLabel,
        percent: comparison.benchmarkReturnPercent,
        series: 'benchmark',
      },
      { label: 'Delta', percent: comparison.deltaPercent, series: 'delta' },
    ],
    tableRows,
    accessibleSummary: `From ${comparison.startDate} to ${comparison.endDate}, the portfolio returned ${comparison.portfolioReturnPercent}% versus ${comparison.benchmarkReturnPercent}% for ${comparison.benchmarkLabel}, a ${comparison.deltaPercent}% delta.`,
    warnings: comparison.warnings,
  };
}
