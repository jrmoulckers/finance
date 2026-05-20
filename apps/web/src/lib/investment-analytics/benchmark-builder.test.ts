// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for benchmark comparison and custom benchmark builder.
 *
 * References: issues #1609, #1698
 */

import { describe, expect, it } from 'vitest';
import {
  BALANCED_60_40_BENCHMARK,
  buildBenchmarkComparison,
  buildCustomBenchmark,
  computeAlpha,
  computeBenchmarkPeriodReturns,
  computeBeta,
  computeBlendedReturn,
  computeInformationRatio,
  computeTrackingError,
  SP500_BENCHMARK,
  STANDARD_BENCHMARKS,
  STANDARD_PERIODS,
  TOTAL_MARKET_BENCHMARK,
  validateBenchmarkWeights,
} from './benchmark-builder';
import type { BenchmarkComponent } from './types';

// ---------------------------------------------------------------------------
// Standard benchmarks
// ---------------------------------------------------------------------------

describe('STANDARD_BENCHMARKS', () => {
  it('includes S&P 500, Total Market, and 60/40', () => {
    expect(STANDARD_BENCHMARKS).toHaveLength(3);
    expect(SP500_BENCHMARK.id).toBe('sp500');
    expect(TOTAL_MARKET_BENCHMARK.id).toBe('total-market');
    expect(BALANCED_60_40_BENCHMARK.id).toBe('60-40');
  });

  it('all benchmarks have valid component weights', () => {
    for (const bm of STANDARD_BENCHMARKS) {
      expect(validateBenchmarkWeights(bm.components)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateBenchmarkWeights
// ---------------------------------------------------------------------------

describe('validateBenchmarkWeights', () => {
  it('returns true when components sum to 100', () => {
    const components: BenchmarkComponent[] = [
      { indexId: 'a', name: 'A', weightPercent: 60 },
      { indexId: 'b', name: 'B', weightPercent: 40 },
    ];
    expect(validateBenchmarkWeights(components)).toBe(true);
  });

  it('returns false when components do not sum to 100', () => {
    const components: BenchmarkComponent[] = [{ indexId: 'a', name: 'A', weightPercent: 50 }];
    expect(validateBenchmarkWeights(components)).toBe(false);
  });

  it('returns false for empty components', () => {
    expect(validateBenchmarkWeights([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCustomBenchmark
// ---------------------------------------------------------------------------

describe('buildCustomBenchmark', () => {
  it('creates a custom benchmark with valid weights', () => {
    const components: BenchmarkComponent[] = [
      { indexId: 'sp500', name: 'S&P 500', weightPercent: 70 },
      { indexId: 'agg-bond', name: 'Bonds', weightPercent: 30 },
    ];
    const bm = buildCustomBenchmark('70/30 Blend', 'Custom blend', components);
    expect(bm).not.toBeNull();
    expect(bm!.name).toBe('70/30 Blend');
    expect(bm!.id).toBe('custom-70/30-blend');
    expect(bm!.components).toHaveLength(2);
  });

  it('returns null for invalid weights', () => {
    const components: BenchmarkComponent[] = [
      { indexId: 'sp500', name: 'S&P 500', weightPercent: 80 },
    ];
    expect(buildCustomBenchmark('Bad', 'Invalid', components)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeBlendedReturn
// ---------------------------------------------------------------------------

describe('computeBlendedReturn', () => {
  it('computes weighted return for a blended benchmark', () => {
    const components: BenchmarkComponent[] = [
      { indexId: 'sp500', name: 'S&P 500', weightPercent: 60 },
      { indexId: 'bonds', name: 'Bonds', weightPercent: 40 },
    ];
    const returns = new Map([
      ['sp500', 10],
      ['bonds', 5],
    ]);
    // 0.6 * 10 + 0.4 * 5 = 8
    expect(computeBlendedReturn(components, returns)).toBe(8);
  });

  it('returns 0 for missing component returns', () => {
    const components: BenchmarkComponent[] = [
      { indexId: 'sp500', name: 'S&P 500', weightPercent: 100 },
    ];
    expect(computeBlendedReturn(components, new Map())).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBenchmarkPeriodReturns
// ---------------------------------------------------------------------------

describe('computeBenchmarkPeriodReturns', () => {
  it('returns period returns for all standard periods', () => {
    const periodReturns = new Map([
      [
        'sp500',
        new Map([
          [1, 2],
          [3, 5],
          [6, 8],
          [12, 15],
          [36, 40],
          [60, 70],
        ]),
      ],
    ]);
    const results = computeBenchmarkPeriodReturns(SP500_BENCHMARK, periodReturns);
    expect(results).toHaveLength(STANDARD_PERIODS.length);
    expect(results[0].label).toBe('1 Month');
    expect(results[0].returnPercent).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeBeta
// ---------------------------------------------------------------------------

describe('computeBeta', () => {
  it('returns 1 for identical series', () => {
    const returns = [1, -2, 3, -1, 2, 0.5, -0.5, 1.5];
    expect(computeBeta(returns, returns)).toBe(1);
  });

  it('returns 0 for insufficient data', () => {
    expect(computeBeta([1], [2])).toBe(0);
    expect(computeBeta([], [])).toBe(0);
  });

  it('computes beta for correlated series', () => {
    const portfolio = [2, 4, 6, 8, 10];
    const benchmark = [1, 2, 3, 4, 5];
    expect(computeBeta(portfolio, benchmark)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// computeTrackingError
// ---------------------------------------------------------------------------

describe('computeTrackingError', () => {
  it('returns 0 for identical series', () => {
    const returns = [1, -2, 3, -1, 2];
    expect(computeTrackingError(returns, returns)).toBe(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(computeTrackingError([1], [2])).toBe(0);
  });

  it('computes positive tracking error for different series', () => {
    const portfolio = [2, -1, 3, -2, 4];
    const benchmark = [1, -0.5, 2, -1, 3];
    const te = computeTrackingError(portfolio, benchmark);
    expect(te).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeAlpha
// ---------------------------------------------------------------------------

describe('computeAlpha', () => {
  it('returns positive alpha when portfolio outperforms', () => {
    // Portfolio 12%, Benchmark 10%, Beta 1.0
    // Alpha = 12 - 1.0 * 10 = 2% = 200 bps
    expect(computeAlpha(12, 10, 1.0)).toBe(200);
  });

  it('returns negative alpha when portfolio underperforms', () => {
    // Portfolio 8%, Benchmark 10%, Beta 1.0
    // Alpha = 8 - 1.0 * 10 = -2% = -200 bps
    expect(computeAlpha(8, 10, 1.0)).toBe(-200);
  });

  it('adjusts for beta', () => {
    // Portfolio 12%, Benchmark 10%, Beta 1.2
    // Alpha = 12 - 1.2 * 10 = 0% = 0 bps
    expect(computeAlpha(12, 10, 1.2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeInformationRatio
// ---------------------------------------------------------------------------

describe('computeInformationRatio', () => {
  it('divides alpha by tracking error', () => {
    expect(computeInformationRatio(200, 100)).toBe(2);
    expect(computeInformationRatio(100, 200)).toBe(0.5);
  });

  it('returns 0 when tracking error is zero', () => {
    expect(computeInformationRatio(200, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildBenchmarkComparison
// ---------------------------------------------------------------------------

describe('buildBenchmarkComparison', () => {
  it('builds a complete comparison with all metrics', () => {
    const portfolioReturns = new Map([
      ['1 Month', 2],
      ['3 Months', 5],
    ]);
    const benchmarkReturns = new Map([
      ['1 Month', 1.5],
      ['3 Months', 4],
    ]);
    const portfolioMonthly = [1, -0.5, 2, -1, 1.5, 0.5, -0.3, 1, -0.2, 0.8, 1.2, -0.5];
    const benchmarkMonthly = [0.8, -0.3, 1.5, -0.8, 1, 0.3, -0.2, 0.8, -0.1, 0.5, 0.9, -0.3];

    const comparison = buildBenchmarkComparison(
      'S&P 500',
      portfolioReturns,
      benchmarkReturns,
      portfolioMonthly,
      benchmarkMonthly,
      10,
      8,
    );

    expect(comparison.benchmarkName).toBe('S&P 500');
    expect(comparison.periods.length).toBeGreaterThan(0);
    expect(typeof comparison.beta).toBe('number');
    expect(typeof comparison.alphaBps).toBe('number');
    expect(typeof comparison.trackingErrorBps).toBe('number');
    expect(typeof comparison.informationRatio).toBe('number');
  });

  it('computes period differences correctly', () => {
    const portfolioReturns = new Map([['1 Month', 3]]);
    const benchmarkReturns = new Map([['1 Month', 2]]);

    const comparison = buildBenchmarkComparison(
      'Test',
      portfolioReturns,
      benchmarkReturns,
      [1, 2],
      [1, 1],
      10,
      8,
    );

    const month1 = comparison.periods.find((p) => p.label === '1 Month');
    expect(month1?.differencePercent).toBe(1);
  });
});
