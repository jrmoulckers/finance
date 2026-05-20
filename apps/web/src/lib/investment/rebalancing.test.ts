// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the rebalancing planner and drift alert engine.
 *
 * Uses known financial test vectors with integer-cents arithmetic.
 *
 * References: issue #1600
 */

import { describe, expect, it } from 'vitest';
import type { AssetAllocationTarget, PortfolioHolding } from './types';
import {
  bankersRound,
  computeDrift,
  generateRebalanceActions,
  generateTaxAwareRebalanceActions,
  hasDriftAlert,
} from './rebalancing';
import type { TaxTreatment } from '../../types/investment';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const holdings: readonly PortfolioHolding[] = [
  {
    id: 'h1',
    symbol: 'VTI',
    name: 'Vanguard Total Stock',
    assetClass: 'US_STOCKS',
    shares: 100,
    currentPriceCents: 200_00,
    marketValueCents: 20000_00,
  },
  {
    id: 'h2',
    symbol: 'BND',
    name: 'Vanguard Total Bond',
    assetClass: 'BONDS',
    shares: 50,
    currentPriceCents: 100_00,
    marketValueCents: 5000_00,
  },
  {
    id: 'h3',
    symbol: 'CASH',
    name: 'Cash',
    assetClass: 'CASH',
    shares: 1,
    currentPriceCents: 5000_00,
    marketValueCents: 5000_00,
  },
];
// Total = $30,000. Actual: US_STOCKS 66.67%, BONDS 16.67%, CASH 16.67%

const targets: readonly AssetAllocationTarget[] = [
  { assetClass: 'US_STOCKS', targetPercent: 60 },
  { assetClass: 'BONDS', targetPercent: 30 },
  { assetClass: 'CASH', targetPercent: 10 },
];

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 2.5 to 2 (even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds 2.3 down', () => {
    expect(bankersRound(2.3)).toBe(2);
  });

  it('rounds 2.7 up', () => {
    expect(bankersRound(2.7)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeDrift
// ---------------------------------------------------------------------------

describe('computeDrift', () => {
  it('computes correct drift for each asset class', () => {
    const drifts = computeDrift(holdings, targets);
    expect(drifts).toHaveLength(3);

    const usDrift = drifts.find((d) => d.assetClass === 'US_STOCKS');
    expect(usDrift).toBeDefined();
    expect(usDrift!.actualPercent).toBeCloseTo(66.67, 1);
    expect(usDrift!.targetPercent).toBe(60);
    expect(usDrift!.driftPercent).toBeCloseTo(6.67, 1);
  });

  it('computes negative drift for underweight classes', () => {
    const drifts = computeDrift(holdings, targets);
    const bondDrift = drifts.find((d) => d.assetClass === 'BONDS');
    expect(bondDrift).toBeDefined();
    expect(bondDrift!.driftPercent).toBeLessThan(0);
  });

  it('returns zero drift for perfectly balanced portfolio', () => {
    const balanced: readonly PortfolioHolding[] = [
      {
        id: 'h1',
        symbol: 'VTI',
        name: 'VTI',
        assetClass: 'US_STOCKS',
        shares: 60,
        currentPriceCents: 100_00,
        marketValueCents: 6000_00,
      },
      {
        id: 'h2',
        symbol: 'BND',
        name: 'BND',
        assetClass: 'BONDS',
        shares: 30,
        currentPriceCents: 100_00,
        marketValueCents: 3000_00,
      },
      {
        id: 'h3',
        symbol: 'CASH',
        name: 'Cash',
        assetClass: 'CASH',
        shares: 1,
        currentPriceCents: 1000_00,
        marketValueCents: 1000_00,
      },
    ];

    const drifts = computeDrift(balanced, targets);
    for (const drift of drifts) {
      expect(Math.abs(drift.driftPercent)).toBeLessThan(0.1);
    }
  });

  it('handles empty portfolio', () => {
    const drifts = computeDrift([], targets);
    expect(drifts).toHaveLength(3);
    for (const d of drifts) {
      expect(d.actualPercent).toBe(0);
      expect(d.currentValueCents).toBe(0);
    }
  });

  it('sorts by absolute drift descending', () => {
    const drifts = computeDrift(holdings, targets);
    for (let i = 1; i < drifts.length; i++) {
      expect(Math.abs(drifts[i - 1].driftPercent)).toBeGreaterThanOrEqual(
        Math.abs(drifts[i].driftPercent),
      );
    }
  });

  it('includes asset classes from holdings not in targets', () => {
    const extraHoldings: readonly PortfolioHolding[] = [
      ...holdings,
      {
        id: 'h4',
        symbol: 'BTC',
        name: 'Bitcoin',
        assetClass: 'CRYPTO',
        shares: 1,
        currentPriceCents: 5000_00,
        marketValueCents: 5000_00,
      },
    ];
    const drifts = computeDrift(extraHoldings, targets);
    const crypto = drifts.find((d) => d.assetClass === 'CRYPTO');
    expect(crypto).toBeDefined();
    expect(crypto!.targetPercent).toBe(0);
    expect(crypto!.actualPercent).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateRebalanceActions
// ---------------------------------------------------------------------------

describe('generateRebalanceActions', () => {
  it('generates buy/sell actions for drifted portfolio', () => {
    const actions = generateRebalanceActions(holdings, targets, 1);
    expect(actions.length).toBeGreaterThan(0);

    const stockAction = actions.find((a) => a.assetClass === 'US_STOCKS');
    expect(stockAction).toBeDefined();
    expect(stockAction!.direction).toBe('SELL');
    expect(stockAction!.amountCents).toBeLessThan(0);

    const bondAction = actions.find((a) => a.assetClass === 'BONDS');
    expect(bondAction).toBeDefined();
    expect(bondAction!.direction).toBe('BUY');
    expect(bondAction!.amountCents).toBeGreaterThan(0);
  });

  it('filters out actions below threshold', () => {
    const actions = generateRebalanceActions(holdings, targets, 50);
    expect(actions).toHaveLength(0);
  });

  it('returns empty array for empty portfolio', () => {
    const actions = generateRebalanceActions([], targets);
    expect(actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateTaxAwareRebalanceActions
// ---------------------------------------------------------------------------

describe('generateTaxAwareRebalanceActions', () => {
  it('adds tax-aware account placement to actions', () => {
    const taxMap = new Map<string, readonly TaxTreatment[]>([
      ['US_STOCKS', ['TAXABLE', 'TAX_FREE']],
      ['BONDS', ['TAX_DEFERRED']],
      ['CASH', ['TAXABLE']],
    ]);

    const actions = generateTaxAwareRebalanceActions(holdings, targets, taxMap, 1);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.preferredAccountType).toBeDefined();
      expect(action.reason).toBeTruthy();
    }
  });

  it('prefers tax-deferred for selling', () => {
    const taxMap = new Map<string, readonly TaxTreatment[]>([
      ['US_STOCKS', ['TAXABLE', 'TAX_DEFERRED']],
      ['BONDS', ['TAXABLE']],
      ['CASH', ['TAXABLE']],
    ]);

    const actions = generateTaxAwareRebalanceActions(holdings, targets, taxMap, 1);
    const sellAction = actions.find((a) => a.direction === 'SELL');
    if (sellAction) {
      expect(sellAction.preferredAccountType).toBe('TAX_DEFERRED');
    }
  });
});

// ---------------------------------------------------------------------------
// hasDriftAlert
// ---------------------------------------------------------------------------

describe('hasDriftAlert', () => {
  it('returns true when drift exceeds threshold', () => {
    expect(hasDriftAlert(holdings, targets, 5)).toBe(true);
  });

  it('returns false when all drift is below threshold', () => {
    expect(hasDriftAlert(holdings, targets, 50)).toBe(false);
  });

  it('returns false for empty portfolio', () => {
    expect(hasDriftAlert([], targets, 1)).toBe(false);
  });
});
