// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { calculateModifiedDietzReturn, comparePortfolioToBenchmark } from './benchmark-comparison';

describe('calculateModifiedDietzReturn', () => {
  it('adjusts returns for contributions', () => {
    const result = calculateModifiedDietzReturn(
      [
        { date: '2025-01-01', valueCents: 10_000_00 },
        { date: '2025-07-01', valueCents: 12_000_00, netCashFlowCents: 1_000_00 },
        { date: '2026-01-01', valueCents: 12_650_00 },
      ],
      '2025-01-01',
      '2026-01-01',
    );

    expect(result).toBeCloseTo(0.157, 3);
  });

  it('returns zero when valuation coverage is missing', () => {
    expect(
      calculateModifiedDietzReturn(
        [{ date: '2025-06-01', valueCents: 10_000_00 }],
        '2025-01-01',
        '2026-01-01',
      ),
    ).toBe(0);
  });
});

describe('comparePortfolioToBenchmark', () => {
  it('computes benchmark delta and annualized returns', () => {
    const result = comparePortfolioToBenchmark({
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      portfolioPoints: [
        { date: '2025-01-01', valueCents: 10_000_00 },
        { date: '2026-01-01', valueCents: 11_000_00 },
      ],
      benchmarkPoints: [
        { date: '2025-01-01', totalReturnIndex: 100 },
        { date: '2026-01-01', totalReturnIndex: 108 },
      ],
    });

    expect(result.portfolioReturnPercent).toBe(10);
    expect(result.benchmarkReturnPercent).toBe(8);
    expect(result.deltaPercent).toBe(2);
    expect(result.annualizedPortfolioReturnPercent).toBeGreaterThan(9);
    expect(result.warnings).toEqual([]);
  });

  it('warns when benchmark dates must be aligned', () => {
    const result = comparePortfolioToBenchmark({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      portfolioPoints: [
        { date: '2025-01-01', valueCents: 10_000_00 },
        { date: '2025-12-31', valueCents: 11_000_00 },
      ],
      benchmarkPoints: [
        { date: '2025-01-02', totalReturnIndex: 100 },
        { date: '2025-12-30', totalReturnIndex: 105 },
      ],
    });

    expect(result.warnings).toEqual([
      'Benchmark start date was aligned to first available data point.',
      'Benchmark end date was aligned to latest available data point.',
    ]);
  });
});
