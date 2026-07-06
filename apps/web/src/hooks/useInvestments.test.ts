// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the pure `computeSummary` portfolio aggregation.
 *
 * Focuses on the multi-currency correctness fix (#3239): market value and cost
 * basis must be converted into a single display currency BEFORE summing, so a
 * portfolio mixing e.g. USD and EUR holdings never produces a nonsense total.
 */

import { describe, expect, it } from 'vitest';
import { computeSummary } from './useInvestments';
import type { Investment } from '../kmp/bridge';

function makeInvestment(overrides: Partial<Investment> & Pick<Investment, 'id'>): Investment {
  return {
    householdId: 'household-1',
    accountId: null,
    symbol: 'SYM',
    name: 'Holding',
    type: 'STOCK',
    shares: 0,
    costBasisPerShare: { amount: 0 },
    currentPricePerShare: { amount: 0 },
    currency: { code: 'USD', decimalPlaces: 2 },
    lastPriceUpdate: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

describe('computeSummary', () => {
  it('sums a single-currency portfolio with the default resolvers', () => {
    const investments = [
      makeInvestment({
        id: 'a',
        shares: 10,
        currentPricePerShare: { amount: 19500 },
        costBasisPerShare: { amount: 15000 },
      }),
      makeInvestment({
        id: 'b',
        shares: 25,
        currentPricePerShare: { amount: 24500 },
        costBasisPerShare: { amount: 22000 },
      }),
    ];

    expect(computeSummary(investments)).toEqual({
      totalValue: 807500,
      totalCostBasis: 700000,
      totalGainLoss: 107500,
      totalGainLossPercent: 15.36,
    });
  });

  it('converts each holding into the display currency BEFORE summing (#3239)', () => {
    const usd = makeInvestment({
      id: 'usd',
      shares: 10,
      currentPricePerShare: { amount: 20000 },
      costBasisPerShare: { amount: 15000 },
      currency: { code: 'USD', decimalPlaces: 2 },
    });
    const eur = makeInvestment({
      id: 'eur',
      shares: 5,
      currentPricePerShare: { amount: 30000 },
      costBasisPerShare: { amount: 20000 },
      currency: { code: 'EUR', decimalPlaces: 2 },
    });

    // EUR → USD at 1.1. Value: USD 200000 + EUR 150000×1.1 = 165000 => 365000.
    // Cost:  USD 150000 + EUR 100000×1.1 = 110000 => 260000.
    const rate: Record<string, number> = { USD: 1, EUR: 1.1 };
    const summary = computeSummary(
      [usd, eur],
      (inv) => Math.round(inv.shares * inv.currentPricePerShare.amount * rate[inv.currency.code]),
      (inv) => Math.round(inv.shares * inv.costBasisPerShare.amount * rate[inv.currency.code]),
    );

    expect(summary.totalValue).toBe(365000);
    expect(summary.totalCostBasis).toBe(260000);
    expect(summary.totalGainLoss).toBe(105000);
    expect(summary.totalGainLossPercent).toBe(40.38);

    // Must NOT be the meaningless raw cross-currency sum (350000 value / 250000 cost).
    expect(summary.totalValue).not.toBe(350000);
    expect(summary.totalCostBasis).not.toBe(250000);
  });

  it('returns zeros for an empty portfolio', () => {
    expect(computeSummary([])).toEqual({
      totalValue: 0,
      totalCostBasis: 0,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
    });
  });

  it('reports 0% gain when cost basis is zero (avoids divide-by-zero)', () => {
    const summary = computeSummary([
      makeInvestment({
        id: 'z',
        shares: 1,
        currentPricePerShare: { amount: 5000 },
        costBasisPerShare: { amount: 0 },
      }),
    ]);

    expect(summary.totalValue).toBe(5000);
    expect(summary.totalCostBasis).toBe(0);
    expect(summary.totalGainLoss).toBe(5000);
    expect(summary.totalGainLossPercent).toBe(0);
  });
});
