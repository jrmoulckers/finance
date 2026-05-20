// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  aggregateBySymbol,
  bankersRound,
  computeCryptoPortfolioSummary,
  filterBySource,
  holdingMarketValue,
  holdingUnrealizedGainLoss,
  holdingUnrealizedPercent,
  safeDivide,
} from './crypto-portfolio';
import type { CryptoHolding } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const btcExchange: CryptoHolding = {
  id: 'h1',
  symbol: 'BTC',
  name: 'Bitcoin',
  quantity: 1.5,
  costBasisCents: 4500000,
  currentPriceCents: 4000000,
  source: 'EXCHANGE',
  sourceLabel: 'Coinbase',
};

const btcWallet: CryptoHolding = {
  id: 'h2',
  symbol: 'BTC',
  name: 'Bitcoin',
  quantity: 0.5,
  costBasisCents: 1500000,
  currentPriceCents: 4000000,
  source: 'WALLET',
  sourceLabel: 'Ledger',
};

const ethExchange: CryptoHolding = {
  id: 'h3',
  symbol: 'ETH',
  name: 'Ethereum',
  quantity: 10,
  costBasisCents: 2000000,
  currentPriceCents: 250000,
  source: 'EXCHANGE',
  sourceLabel: 'Kraken',
};

const holdings: CryptoHolding[] = [btcExchange, btcWallet, ethExchange];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 0.5 to nearest even (0)', () => {
    expect(bankersRound(0.5)).toBe(0);
  });

  it('rounds 1.5 to nearest even (2)', () => {
    expect(bankersRound(1.5)).toBe(2);
  });

  it('rounds 2.5 to nearest even (2)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds normal values normally', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
  });

  it('returns 0 for non-finite values', () => {
    expect(bankersRound(NaN)).toBe(0);
    expect(bankersRound(Infinity)).toBe(0);
  });
});

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it('returns 0 for zero denominator', () => {
    expect(safeDivide(100, 0)).toBe(0);
  });

  it('returns 0 for non-finite denominator', () => {
    expect(safeDivide(100, NaN)).toBe(0);
  });
});

describe('holdingMarketValue', () => {
  it('computes market value as quantity * price', () => {
    // 1.5 * 4000000 = 6000000
    expect(holdingMarketValue(btcExchange)).toBe(6000000);
  });
});

describe('holdingUnrealizedGainLoss', () => {
  it('computes gain when market value > cost basis', () => {
    // market value 6000000 - cost 4500000 = 1500000
    expect(holdingUnrealizedGainLoss(btcExchange)).toBe(1500000);
  });

  it('computes loss when market value < cost basis', () => {
    // ETH: 10 * 250000 = 2500000, cost = 2000000, gain = 500000
    expect(holdingUnrealizedGainLoss(ethExchange)).toBe(500000);
  });
});

describe('holdingUnrealizedPercent', () => {
  it('computes gain percentage', () => {
    // 1500000 / 4500000 * 100 = 33.33%
    expect(holdingUnrealizedPercent(btcExchange)).toBe(33.33);
  });

  it('returns 0 when cost basis is 0', () => {
    const zeroCost = { ...btcExchange, costBasisCents: 0 };
    expect(holdingUnrealizedPercent(zeroCost)).toBe(0);
  });
});

describe('aggregateBySymbol', () => {
  it('groups holdings by symbol', () => {
    const result = aggregateBySymbol(holdings);
    expect(result).toHaveLength(2);
    // BTC should be first (higher value)
    expect(result[0].symbol).toBe('BTC');
    // BTC total: 1.5 * 4M + 0.5 * 4M = 8M
    expect(result[0].totalValueCents).toBe(8000000);
    expect(result[0].totalQuantity).toBe(2);
    expect(result[1].symbol).toBe('ETH');
    expect(result[1].totalValueCents).toBe(2500000);
  });

  it('computes allocation percentages', () => {
    const result = aggregateBySymbol(holdings);
    // BTC: 8M / 10.5M ≈ 76.19%
    expect(result[0].percent).toBeCloseTo(76.19, 1);
  });

  it('returns empty for no holdings', () => {
    expect(aggregateBySymbol([])).toEqual([]);
  });
});

describe('filterBySource', () => {
  it('filters to exchange holdings only', () => {
    const result = filterBySource(holdings, 'EXCHANGE');
    expect(result).toHaveLength(2);
  });

  it('filters to wallet holdings only', () => {
    const result = filterBySource(holdings, 'WALLET');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('h2');
  });
});

describe('computeCryptoPortfolioSummary', () => {
  it('computes full summary', () => {
    const summary = computeCryptoPortfolioSummary(holdings);
    // Total value: 6M + 2M + 2.5M = 10.5M
    expect(summary.totalValueCents).toBe(10500000);
    // Total cost: 4.5M + 1.5M + 2M = 8M
    expect(summary.totalCostBasisCents).toBe(8000000);
    // Gain: 2.5M
    expect(summary.totalUnrealizedGainLossCents).toBe(2500000);
    expect(summary.holdingCount).toBe(3);
    expect(summary.allocationBySymbol).toHaveLength(2);
  });

  it('returns zeros for empty holdings', () => {
    const summary = computeCryptoPortfolioSummary([]);
    expect(summary.totalValueCents).toBe(0);
    expect(summary.holdingCount).toBe(0);
    expect(summary.allocationBySymbol).toEqual([]);
  });
});
