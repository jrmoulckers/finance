// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for portfolio asset allocation and rebalancing workspace.
 *
 * References: issue #1694
 */

import { describe, expect, it } from 'vitest';
import type { AllocationHolding, AllocationTarget } from './types';
import {
  computeAllocationDrift,
  computeRebalanceAnalysis,
  filterTaxAwareTrades,
  generateCashFlowRebalanceTrades,
  generateRebalanceTrades,
  validateAllocationTargets,
} from './allocation-engine';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const targets: readonly AllocationTarget[] = [
  { assetClass: 'US_STOCKS', targetPercent: 60 },
  { assetClass: 'BONDS', targetPercent: 30 },
  { assetClass: 'CASH', targetPercent: 10 },
];

const balancedHoldings: readonly AllocationHolding[] = [
  { symbol: 'VTI', assetClass: 'US_STOCKS', marketValueCents: 60000_00 },
  { symbol: 'BND', assetClass: 'BONDS', marketValueCents: 30000_00 },
  { symbol: 'VMFXX', assetClass: 'CASH', marketValueCents: 10000_00 },
];

const driftedHoldings: readonly AllocationHolding[] = [
  {
    symbol: 'VTI',
    assetClass: 'US_STOCKS',
    marketValueCents: 80000_00,
    unrealizedGainCents: 5000_00,
  },
  {
    symbol: 'BND',
    assetClass: 'BONDS',
    marketValueCents: 15000_00,
    unrealizedGainCents: -1000_00,
  },
  { symbol: 'VMFXX', assetClass: 'CASH', marketValueCents: 5000_00 },
];

// ---------------------------------------------------------------------------
// validateAllocationTargets
// ---------------------------------------------------------------------------

describe('validateAllocationTargets', () => {
  it('returns true when targets sum to 100', () => {
    expect(validateAllocationTargets(targets)).toBe(true);
  });

  it('returns false when targets do not sum to 100', () => {
    const bad: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 50 }];
    expect(validateAllocationTargets(bad)).toBe(false);
  });

  it('returns false for empty targets', () => {
    expect(validateAllocationTargets([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeAllocationDrift
// ---------------------------------------------------------------------------

describe('computeAllocationDrift', () => {
  it('shows zero drift for perfectly balanced portfolio', () => {
    const drifts = computeAllocationDrift(balancedHoldings, targets);
    for (const drift of drifts) {
      expect(Math.abs(drift.driftPercent)).toBeLessThan(0.01);
      expect(drift.deltaValueCents).toBe(0);
    }
  });

  it('detects drift in imbalanced portfolio', () => {
    const drifts = computeAllocationDrift(driftedHoldings, targets);

    const stocksDrift = drifts.find((d) => d.assetClass === 'US_STOCKS');
    expect(stocksDrift!.driftPercent).toBeGreaterThan(0); // Over target

    const bondsDrift = drifts.find((d) => d.assetClass === 'BONDS');
    expect(bondsDrift!.driftPercent).toBeLessThan(0); // Under target
  });

  it('includes asset classes without targets', () => {
    const holdingsWithCrypto: AllocationHolding[] = [
      { symbol: 'VTI', assetClass: 'US_STOCKS', marketValueCents: 50000_00 },
      { symbol: 'BTC', assetClass: 'CRYPTO', marketValueCents: 10000_00 },
    ];
    const simpleTargets: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 100 }];

    const drifts = computeAllocationDrift(holdingsWithCrypto, simpleTargets);
    const cryptoDrift = drifts.find((d) => d.assetClass === 'CRYPTO');
    expect(cryptoDrift).toBeDefined();
    expect(cryptoDrift!.targetPercent).toBe(0);
    expect(cryptoDrift!.actualPercent).toBeGreaterThan(0);
  });

  it('handles empty portfolio', () => {
    const drifts = computeAllocationDrift([], targets);
    for (const drift of drifts) {
      expect(drift.currentValueCents).toBe(0);
      expect(drift.actualPercent).toBe(0);
    }
  });

  it('sorts drifts by absolute drift descending', () => {
    const drifts = computeAllocationDrift(driftedHoldings, targets);
    for (let i = 1; i < drifts.length; i++) {
      expect(Math.abs(drifts[i - 1].driftPercent)).toBeGreaterThanOrEqual(
        Math.abs(drifts[i].driftPercent),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// generateRebalanceTrades
// ---------------------------------------------------------------------------

describe('generateRebalanceTrades', () => {
  it('generates no trades for balanced portfolio', () => {
    const trades = generateRebalanceTrades(balancedHoldings, targets, 1);
    expect(trades).toHaveLength(0);
  });

  it('generates trades for drifted portfolio', () => {
    const trades = generateRebalanceTrades(driftedHoldings, targets, 1);
    expect(trades.length).toBeGreaterThan(0);

    // Should have sell trades for overweight and buy for underweight
    const sells = trades.filter((t) => t.action === 'SELL');
    const buys = trades.filter((t) => t.action === 'BUY');
    expect(sells.length).toBeGreaterThan(0);
    expect(buys.length).toBeGreaterThan(0);
  });

  it('flags tax implications for selling with gains', () => {
    const trades = generateRebalanceTrades(driftedHoldings, targets, 1);
    const stockSell = trades.find((t) => t.assetClass === 'US_STOCKS' && t.action === 'SELL');
    expect(stockSell?.hasTaxImplication).toBe(true);
  });

  it('respects threshold — ignores small drifts', () => {
    const slightDrift: AllocationHolding[] = [
      { symbol: 'VTI', assetClass: 'US_STOCKS', marketValueCents: 60500_00 },
      { symbol: 'BND', assetClass: 'BONDS', marketValueCents: 29750_00 },
      { symbol: 'VMFXX', assetClass: 'CASH', marketValueCents: 9750_00 },
    ];
    const trades = generateRebalanceTrades(slightDrift, targets, 5);
    expect(trades).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterTaxAwareTrades
// ---------------------------------------------------------------------------

describe('filterTaxAwareTrades', () => {
  it('keeps buy trades unchanged', () => {
    const trades = generateRebalanceTrades(driftedHoldings, targets, 1);
    const filtered = filterTaxAwareTrades(trades, driftedHoldings);
    const buys = filtered.filter((t) => t.action === 'BUY');
    expect(buys.length).toBeGreaterThan(0);
  });

  it('clears tax flag when loss lots exist for offset', () => {
    // Bonds have unrealized loss — selling bonds could offset gains
    const trades = generateRebalanceTrades(driftedHoldings, targets, 1);
    const filtered = filterTaxAwareTrades(trades, driftedHoldings);
    // The bond sell should have hasTaxImplication cleared if there are loss lots
    const bondTrade = filtered.find((t) => t.assetClass === 'BONDS');
    if (bondTrade && bondTrade.action === 'SELL') {
      // Bonds have negative gains → losses can offset
      expect(bondTrade.hasTaxImplication).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// generateCashFlowRebalanceTrades
// ---------------------------------------------------------------------------

describe('generateCashFlowRebalanceTrades', () => {
  it('generates buy-only trades for underweight classes', () => {
    const drifts = computeAllocationDrift(driftedHoldings, targets);
    const trades = generateCashFlowRebalanceTrades(drifts, 10000_00);

    expect(trades.length).toBeGreaterThan(0);
    for (const trade of trades) {
      expect(trade.action).toBe('BUY');
      expect(trade.hasTaxImplication).toBe(false);
    }
  });

  it('returns empty for zero cash', () => {
    const drifts = computeAllocationDrift(driftedHoldings, targets);
    expect(generateCashFlowRebalanceTrades(drifts, 0)).toHaveLength(0);
  });

  it('returns empty for negative cash', () => {
    const drifts = computeAllocationDrift(driftedHoldings, targets);
    expect(generateCashFlowRebalanceTrades(drifts, -100)).toHaveLength(0);
  });

  it('returns empty when no classes are underweight', () => {
    const drifts = computeAllocationDrift(balancedHoldings, targets);
    const trades = generateCashFlowRebalanceTrades(drifts, 10000_00);
    expect(trades).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeRebalanceAnalysis
// ---------------------------------------------------------------------------

describe('computeRebalanceAnalysis', () => {
  it('produces complete analysis result', () => {
    const result = computeRebalanceAnalysis(driftedHoldings, targets);
    expect(result.isTargetValid).toBe(true);
    expect(result.totalPortfolioValueCents).toBe(100000_00);
    expect(result.drifts.length).toBeGreaterThan(0);
    expect(result.tradeCount).toBe(result.trades.length);
  });

  it('returns no trades when targets are invalid', () => {
    const badTargets: AllocationTarget[] = [{ assetClass: 'US_STOCKS', targetPercent: 50 }];
    const result = computeRebalanceAnalysis(driftedHoldings, badTargets);
    expect(result.isTargetValid).toBe(false);
    expect(result.trades).toHaveLength(0);
  });

  it('handles empty portfolio', () => {
    const result = computeRebalanceAnalysis([], targets);
    expect(result.totalPortfolioValueCents).toBe(0);
    expect(result.isTargetValid).toBe(true);
  });
});
