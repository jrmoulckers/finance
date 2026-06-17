// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildBenchmarkComparisonPresentation } from './benchmark-comparison-presentation';

describe('buildBenchmarkComparisonPresentation', () => {
  it('builds chart, table, and Modified Dietz limitation copy', () => {
    const presentation = buildBenchmarkComparisonPresentation({
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      benchmarkLabel: 'S&P 500 Total Return',
      portfolioReturnPercent: 10,
      benchmarkReturnPercent: 8,
      deltaPercent: 2,
      annualizedPortfolioReturnPercent: 9.9,
      annualizedBenchmarkReturnPercent: 7.9,
      warnings: ['Benchmark start date was aligned to first available data point.'],
    });

    expect(presentation.title).toBe('Portfolio vs S&P 500 Total Return');
    expect(presentation.chart).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Delta', percent: 2 })]));
    expect(presentation.tableRows.map((row) => row.id)).toEqual(
      expect.arrayContaining(['portfolio-return', 'benchmark-return', 'delta', 'portfolio-annualized', 'benchmark-annualized']),
    );
    expect(presentation.returnMethodLabel).toContain('Modified Dietz');
    expect(presentation.limitationCopy).toContain('not a full time-weighted return');
    expect(presentation.warnings).toHaveLength(1);
  });
});
