// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the asset allocation engine.
 *
 * Covers target validation, allocation computation, deviation calculation,
 * and rebalancing suggestions.
 *
 * References: issue #1595
 */

import { describe, expect, it } from 'vitest';
import type { AllocationTarget } from '../../types/investment';
import {
  ALLOCATION_PRESETS,
  computeAllocation,
  getRebalancingSuggestions,
  validateTargets,
} from './allocation';
import type { HoldingWithClass } from './allocation';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const standardTargets: readonly AllocationTarget[] = [
  { assetClass: 'US_STOCKS', targetPercent: 60 },
  { assetClass: 'BONDS', targetPercent: 30 },
  { assetClass: 'CASH', targetPercent: 10 },
];

const balancedHoldings: readonly HoldingWithClass[] = [
  { symbol: 'VTI', marketValue: 60000_00, assetClass: 'US_STOCKS' },
  { symbol: 'BND', marketValue: 30000_00, assetClass: 'BONDS' },
  { symbol: 'CASH', marketValue: 10000_00, assetClass: 'CASH' },
];

const driftedHoldings: readonly HoldingWithClass[] = [
  { symbol: 'VTI', marketValue: 70000_00, assetClass: 'US_STOCKS' },
  { symbol: 'AAPL', marketValue: 10000_00, assetClass: 'US_STOCKS' },
  { symbol: 'BND', marketValue: 15000_00, assetClass: 'BONDS' },
  { symbol: 'CASH', marketValue: 5000_00, assetClass: 'CASH' },
];

// ---------------------------------------------------------------------------
// validateTargets
// ---------------------------------------------------------------------------

describe('validateTargets', () => {
  it('returns true when targets sum to 100', () => {
    expect(validateTargets(standardTargets)).toBe(true);
  });

  it('returns false when targets sum to less than 100', () => {
    const under: AllocationTarget[] = [
      { assetClass: 'US_STOCKS', targetPercent: 50 },
      { assetClass: 'BONDS', targetPercent: 30 },
    ];
    expect(validateTargets(under)).toBe(false);
  });

  it('returns false when targets sum to more than 100', () => {
    const over: AllocationTarget[] = [
      { assetClass: 'US_STOCKS', targetPercent: 60 },
      { assetClass: 'BONDS', targetPercent: 50 },
    ];
    expect(validateTargets(over)).toBe(false);
  });

  it('returns true for empty targets (0 = not 100, so false)', () => {
    expect(validateTargets([])).toBe(false);
  });

  it('handles floating-point precision', () => {
    const precise: AllocationTarget[] = [
      { assetClass: 'US_STOCKS', targetPercent: 33.33 },
      { assetClass: 'BONDS', targetPercent: 33.34 },
      { assetClass: 'CASH', targetPercent: 33.33 },
    ];
    expect(validateTargets(precise)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Presets validation
// ---------------------------------------------------------------------------

describe('ALLOCATION_PRESETS', () => {
  it('all presets sum to 100%', () => {
    for (const preset of ALLOCATION_PRESETS) {
      expect(validateTargets(preset.targets)).toBe(true);
    }
  });

  it('includes at least 3 presets', () => {
    expect(ALLOCATION_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it('describes the Balanced preset by the classes it actually targets (cash, not alternatives)', () => {
    const balanced = ALLOCATION_PRESETS.find((p) => p.name === 'Balanced');
    expect(balanced).toBeDefined();
    // It allocates the final 10% to CASH, so the copy must say cash and must
    // not claim "alternatives" (which it does not hold).
    expect(balanced?.targets.some((t) => t.assetClass === 'CASH')).toBe(true);
    expect(balanced?.description.toLowerCase()).toContain('cash');
    expect(balanced?.description.toLowerCase()).not.toContain('alternative');
  });
});

// ---------------------------------------------------------------------------
// computeAllocation
// ---------------------------------------------------------------------------

describe('computeAllocation', () => {
  it('computes perfectly balanced allocation with zero deviations', () => {
    const analysis = computeAllocation(balancedHoldings, standardTargets);

    expect(analysis.totalPortfolioValue).toBe(100000_00);
    expect(analysis.isTargetValid).toBe(true);

    const stocks = analysis.comparisons.find((c) => c.assetClass === 'US_STOCKS');
    expect(stocks?.actualPercent).toBe(60);
    expect(stocks?.deviationPercent).toBe(0);
    expect(stocks?.rebalanceAmount).toBe(0);
  });

  it('detects drift from target allocation', () => {
    const analysis = computeAllocation(driftedHoldings, standardTargets);

    // Total: 70000 + 10000 + 15000 + 5000 = 100000 (dollars)
    expect(analysis.totalPortfolioValue).toBe(100000_00);

    const stocks = analysis.comparisons.find((c) => c.assetClass === 'US_STOCKS');
    expect(stocks?.actualPercent).toBe(80);
    expect(stocks?.deviationPercent).toBe(20);
    // Target 60% of 10000000 = 6000000, actual 8000000 → rebalance = -2000000
    expect(stocks?.rebalanceAmount).toBe(-20000_00);

    const bonds = analysis.comparisons.find((c) => c.assetClass === 'BONDS');
    expect(bonds?.actualPercent).toBe(15);
    expect(bonds?.deviationPercent).toBe(-15);
    expect(bonds?.rebalanceAmount).toBe(15000_00);
  });

  it('handles empty portfolio', () => {
    const analysis = computeAllocation([], standardTargets);

    expect(analysis.totalPortfolioValue).toBe(0);
    expect(analysis.isTargetValid).toBe(true);
  });

  it('includes asset classes present in holdings but not in targets', () => {
    const holdingsWithCrypto: HoldingWithClass[] = [
      { symbol: 'VTI', marketValue: 50000_00, assetClass: 'US_STOCKS' },
      { symbol: 'BTC', marketValue: 10000_00, assetClass: 'CRYPTO' },
    ];

    const targets: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 100 }];

    const analysis = computeAllocation(holdingsWithCrypto, targets);

    const crypto = analysis.comparisons.find((c) => c.assetClass === 'CRYPTO');
    expect(crypto).toBeDefined();
    expect(crypto?.targetPercent).toBe(0);
    expect(crypto?.actualPercent).toBeGreaterThan(0);
  });

  it('flags invalid targets when they do not sum to 100', () => {
    const badTargets: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 50 }];

    const analysis = computeAllocation(balancedHoldings, badTargets);
    expect(analysis.isTargetValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRebalancingSuggestions
// ---------------------------------------------------------------------------

describe('getRebalancingSuggestions', () => {
  it('returns asset classes with deviation exceeding threshold', () => {
    const analysis = computeAllocation(driftedHoldings, standardTargets);
    const suggestions = getRebalancingSuggestions(analysis, 5);

    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(Math.abs(s.deviationPercent)).toBeGreaterThanOrEqual(5);
    }
  });

  it('returns empty when all deviations are within threshold', () => {
    const analysis = computeAllocation(balancedHoldings, standardTargets);
    const suggestions = getRebalancingSuggestions(analysis, 1);

    expect(suggestions).toHaveLength(0);
  });

  it('returns empty when targets are invalid', () => {
    const badTargets: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 50 }];
    const analysis = computeAllocation(driftedHoldings, badTargets);
    const suggestions = getRebalancingSuggestions(analysis);

    expect(suggestions).toHaveLength(0);
  });

  it('uses default 1% threshold', () => {
    // Slightly drifted portfolio
    const slightDrift: HoldingWithClass[] = [
      { symbol: 'VTI', marketValue: 61000_00, assetClass: 'US_STOCKS' },
      { symbol: 'BND', marketValue: 29500_00, assetClass: 'BONDS' },
      { symbol: 'CASH', marketValue: 9500_00, assetClass: 'CASH' },
    ];

    const analysis = computeAllocation(slightDrift, standardTargets);
    const suggestions = getRebalancingSuggestions(analysis);

    // 1% deviation in stocks → should appear
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });
});
