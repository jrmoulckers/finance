// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPortfolioBenchmarkComparison, resolveBenchmarkRange } from './portfolio-benchmark-adapter';

describe('resolveBenchmarkRange', () => {
  it('resolves common benchmark ranges', () => {
    expect(resolveBenchmarkRange({ range: 'YTD', asOfDate: '2025-08-15' })).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-08-15',
    });
    expect(resolveBenchmarkRange({ range: 'ALL', asOfDate: '2025-08-15', firstPortfolioDate: '2022-02-03' })).toEqual({
      startDate: '2022-02-03',
      endDate: '2025-08-15',
    });
  });
});

describe('buildPortfolioBenchmarkComparison', () => {
  it('aligns portfolio, cash flow, and benchmark history with source attribution', () => {
    const result = buildPortfolioBenchmarkComparison({
      range: '1Y',
      asOfDate: '2026-01-01',
      benchmarkSource: { label: 'S&P 500 Total Return', url: 'https://example.test/sp500' },
      valuationHistory: [
        { date: '2025-01-01', valueCents: 10_000_00 },
        { date: '2025-07-01', valueCents: 12_000_00 },
        { date: '2026-01-01', valueCents: 12_650_00 },
      ],
      cashFlows: [{ date: '2025-07-01', amountCents: 1_000_00 }],
      benchmarkHistory: [
        { date: '2025-01-01', totalReturnIndex: 100 },
        { date: '2026-01-01', totalReturnIndex: 108 },
      ],
    });

    expect(result.comparison.portfolioReturnPercent).toBeCloseTo(15.7, 1);
    expect(result.comparison.benchmarkReturnPercent).toBe(8);
    expect(result.benchmarkSource.url).toBe('https://example.test/sp500');
    expect(result.coverageWarnings).toEqual([]);
  });

  it('surfaces missing price and coverage warnings', () => {
    const result = buildPortfolioBenchmarkComparison({
      range: 'YTD',
      asOfDate: '2025-12-31',
      benchmarkSource: { label: 'Benchmark vendor' },
      valuationHistory: [
        { date: '2025-01-02', valueCents: 10_000_00, missingPriceSymbols: ['ABC'] },
        { date: '2025-12-30', valueCents: 11_000_00 },
      ],
      cashFlows: [{ date: '2025-06-01', amountCents: 100_00 }],
      benchmarkHistory: [{ date: '2025-01-02', totalReturnIndex: 100 }],
    });

    expect(result.coverageWarnings).toEqual(
      expect.arrayContaining([
        'Portfolio start date was aligned to first available valuation.',
        'Portfolio end date was aligned to latest available valuation.',
        'Missing historical prices for: ABC.',
        'Benchmark history has fewer than two points in the aligned range.',
      ]),
    );
    expect(result.coverageWarnings.some((warning) => warning.includes('Cash-flow events without same-day valuations'))).toBe(true);
  });
});
