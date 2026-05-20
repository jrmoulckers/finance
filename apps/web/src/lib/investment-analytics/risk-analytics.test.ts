// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for risk-adjusted analytics and portfolio stress testing.
 *
 * References: issues #1617, #1698
 */

import { describe, expect, it } from 'vitest';
import {
  buildCorrelationMatrix,
  computeMaxDrawdown,
  computeRiskMetrics,
  computeSharpeRatio,
  computeSortinoRatio,
  computeVaR,
  downsideDeviation,
  mean,
  pearsonCorrelation,
  runStressTests,
  standardDeviation,
  STRESS_SCENARIOS,
} from './risk-analytics';

// ---------------------------------------------------------------------------
// mean
// ---------------------------------------------------------------------------

describe('mean', () => {
  it('computes arithmetic mean', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([10, 20])).toBe(15);
  });

  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('handles single value', () => {
    expect(mean([42])).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// standardDeviation
// ---------------------------------------------------------------------------

describe('standardDeviation', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(standardDeviation([])).toBe(0);
    expect(standardDeviation([5])).toBe(0);
  });

  it('computes correct standard deviation', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → sample std dev = 2.138
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const sd = standardDeviation(values);
    expect(sd).toBeCloseTo(2.138, 2);
  });

  it('returns 0 for identical values', () => {
    expect(standardDeviation([5, 5, 5, 5])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// downsideDeviation
// ---------------------------------------------------------------------------

describe('downsideDeviation', () => {
  it('only considers negative returns', () => {
    const returns = [5, -3, 2, -1, 4, -2];
    const dd = downsideDeviation(returns, 0);
    expect(dd).toBeGreaterThan(0);
  });

  it('returns 0 when all returns are above target', () => {
    expect(downsideDeviation([1, 2, 3, 4], 0)).toBe(0);
  });

  it('returns 0 for fewer than 2 values', () => {
    expect(downsideDeviation([1])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSharpeRatio
// ---------------------------------------------------------------------------

describe('computeSharpeRatio', () => {
  it('returns 0 for insufficient data', () => {
    expect(computeSharpeRatio([1])).toBe(0);
    expect(computeSharpeRatio([])).toBe(0);
  });

  it('computes positive Sharpe for good returns', () => {
    // Monthly returns averaging ~1% with low volatility
    const returns = [1, 1.2, 0.8, 1.1, 0.9, 1.0, 1.3, 0.7, 1.1, 0.9, 1.2, 1.0];
    const sharpe = computeSharpeRatio(returns, 4);
    expect(sharpe).toBeGreaterThan(0);
  });

  it('computes negative Sharpe for poor returns', () => {
    // Monthly returns averaging negative
    const returns = [-1, -0.5, -2, -1.5, -0.8, -1.2];
    const sharpe = computeSharpeRatio(returns, 4);
    expect(sharpe).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeSortinoRatio
// ---------------------------------------------------------------------------

describe('computeSortinoRatio', () => {
  it('returns 0 for insufficient data', () => {
    expect(computeSortinoRatio([])).toBe(0);
  });

  it('is higher than Sharpe when downside volatility is low', () => {
    // Mostly positive returns with few negatives
    const returns = [2, 1.5, 3, -0.5, 2, 1, 2.5, -0.2, 1.8, 2, 1.5, 2.2];
    const sharpe = computeSharpeRatio(returns, 2);
    const sortino = computeSortinoRatio(returns, 2);
    // Sortino should be higher because downside deviation < total deviation
    expect(sortino).toBeGreaterThan(sharpe);
  });
});

// ---------------------------------------------------------------------------
// computeMaxDrawdown
// ---------------------------------------------------------------------------

describe('computeMaxDrawdown', () => {
  it('computes max drawdown from value series', () => {
    const values = [100, 110, 105, 95, 80, 90, 100, 85, 95];
    const dd = computeMaxDrawdown(values);
    // Peak 110, trough 80 → drawdown = (80-110)/110 = -27.27%
    expect(dd).toBeCloseTo(-27.27, 1);
  });

  it('returns 0 for monotonically increasing values', () => {
    expect(computeMaxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it('returns 0 for fewer than 2 values', () => {
    expect(computeMaxDrawdown([100])).toBe(0);
    expect(computeMaxDrawdown([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeVaR
// ---------------------------------------------------------------------------

describe('computeVaR', () => {
  it('returns 0 for empty returns', () => {
    expect(computeVaR([], 100000, 0.95)).toBe(0);
  });

  it('computes VaR at 95% confidence', () => {
    // 20 monthly returns
    const returns = [-5, -3, -2, -1, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8];
    const var95 = computeVaR(returns, 1000000, 0.95);
    // floor((1-0.95) * 20) = 1, sorted[1] = -3% → VaR = 3% of 1000000 = 30000
    expect(var95).toBeGreaterThan(0);
    expect(var95).toBe(30000);
  });

  it('VaR at 99% is greater than or equal to VaR at 95%', () => {
    const returns = [-8, -5, -3, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const var95 = computeVaR(returns, 1000000, 0.95);
    const var99 = computeVaR(returns, 1000000, 0.99);
    expect(var99).toBeGreaterThanOrEqual(var95);
  });
});

// ---------------------------------------------------------------------------
// pearsonCorrelation
// ---------------------------------------------------------------------------

describe('pearsonCorrelation', () => {
  it('returns 1 for perfectly correlated series', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(a, b)).toBe(1);
  });

  it('returns -1 for perfectly negatively correlated series', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(a, b)).toBe(-1);
  });

  it('returns 0 for insufficient data', () => {
    expect(pearsonCorrelation([1], [2])).toBe(0);
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it('returns 0 for uncorrelated series', () => {
    const a = [1, -1, 1, -1, 1, -1];
    const b = [1, 1, -1, -1, 1, 1];
    const corr = pearsonCorrelation(a, b);
    expect(Math.abs(corr)).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// buildCorrelationMatrix
// ---------------------------------------------------------------------------

describe('buildCorrelationMatrix', () => {
  it('builds correlation entries for all pairs', () => {
    const returns = new Map([
      ['AAPL', [1, 2, 3, 4, 5]],
      ['MSFT', [2, 4, 6, 8, 10]],
      ['GOOG', [5, 4, 3, 2, 1]],
    ]);
    const matrix = buildCorrelationMatrix(returns);
    // 3 symbols → 3 pairs
    expect(matrix).toHaveLength(3);
  });

  it('returns empty for fewer than 2 symbols', () => {
    const returns = new Map([['AAPL', [1, 2, 3]]]);
    expect(buildCorrelationMatrix(returns)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeRiskMetrics
// ---------------------------------------------------------------------------

describe('computeRiskMetrics', () => {
  const monthlyReturns = [1, -0.5, 2, -1, 1.5, 0.5, -0.3, 1, -0.2, 0.8, 1.2, -0.5];
  const benchmarkReturns = [0.8, -0.3, 1.5, -0.8, 1, 0.3, -0.2, 0.8, -0.1, 0.5, 0.9, -0.3];

  it('returns all risk metric fields', () => {
    const metrics = computeRiskMetrics(monthlyReturns, 1000000_00, benchmarkReturns);
    expect(typeof metrics.standardDeviationPercent).toBe('number');
    expect(typeof metrics.sharpeRatio).toBe('number');
    expect(typeof metrics.sortinoRatio).toBe('number');
    expect(typeof metrics.var95Cents).toBe('number');
    expect(typeof metrics.var99Cents).toBe('number');
    expect(typeof metrics.beta).toBe('number');
  });

  it('VaR values are non-negative', () => {
    const metrics = computeRiskMetrics(monthlyReturns, 1000000_00, benchmarkReturns);
    expect(metrics.var95Cents).toBeGreaterThanOrEqual(0);
    expect(metrics.var99Cents).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// STRESS_SCENARIOS & runStressTests
// ---------------------------------------------------------------------------

describe('STRESS_SCENARIOS', () => {
  it('includes at least 3 scenarios', () => {
    expect(STRESS_SCENARIOS.length).toBeGreaterThanOrEqual(3);
  });

  it('all scenarios have negative equity decline', () => {
    for (const s of STRESS_SCENARIOS) {
      expect(s.equityDecline).toBeLessThan(0);
    }
  });
});

describe('runStressTests', () => {
  const holdings = [
    { assetClass: 'US_STOCKS' as const, marketValueCents: 600000_00 },
    { assetClass: 'BONDS' as const, marketValueCents: 300000_00 },
    { assetClass: 'CASH' as const, marketValueCents: 100000_00 },
  ];

  it('produces one scenario result per stress scenario', () => {
    const result = runStressTests(holdings);
    expect(result.scenarios).toHaveLength(STRESS_SCENARIOS.length);
    expect(result.currentValueCents).toBe(1000000_00);
  });

  it('all scenarios show losses for equity-heavy portfolios', () => {
    const equityHoldings = [{ assetClass: 'US_STOCKS' as const, marketValueCents: 1000000_00 }];
    const result = runStressTests(equityHoldings);
    for (const s of result.scenarios) {
      expect(s.estimatedLossCents).toBeGreaterThan(0);
      expect(s.impactPercent).toBeLessThan(0);
    }
  });

  it('cash holdings are unaffected', () => {
    const cashOnly = [{ assetClass: 'CASH' as const, marketValueCents: 100000_00 }];
    const result = runStressTests(cashOnly);
    for (const s of result.scenarios) {
      expect(s.estimatedValueCents).toBe(100000_00);
      expect(s.estimatedLossCents).toBe(0);
    }
  });

  it('handles empty portfolio', () => {
    const result = runStressTests([]);
    expect(result.currentValueCents).toBe(0);
    for (const s of result.scenarios) {
      expect(s.estimatedValueCents).toBe(0);
    }
  });
});
