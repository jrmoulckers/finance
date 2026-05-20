// SPDX-License-Identifier: BUSL-1.1

/**
 * Crypto portfolio aggregation across exchanges and wallets.
 *
 * Aggregates holdings from multiple sources, computes total portfolio value,
 * allocation by coin, cost basis tracking, and unrealized gain/loss per holding.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1667
 */

import type {
  CryptoAllocation,
  CryptoHolding,
  CryptoPortfolioSummary,
  CryptoSource,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even) for financial calculations.
 *
 * @param value - The number to round.
 * @returns Rounded integer.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  const diff = value - floored;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/**
 * Safe division that returns 0 when the divisor is zero.
 *
 * @param numerator - The numerator.
 * @param denominator - The denominator.
 * @returns Division result, or 0 if denominator is zero.
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return 0;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Portfolio value per holding
// ---------------------------------------------------------------------------

/**
 * Compute the market value of a single holding in cents.
 *
 * @param holding - The crypto holding.
 * @returns Market value in cents.
 */
export function holdingMarketValue(holding: CryptoHolding): number {
  return bankersRound(holding.quantity * holding.currentPriceCents);
}

/**
 * Compute unrealized gain/loss for a single holding in cents.
 *
 * @param holding - The crypto holding.
 * @returns Unrealized gain/loss in cents (positive = profit).
 */
export function holdingUnrealizedGainLoss(holding: CryptoHolding): number {
  return holdingMarketValue(holding) - holding.costBasisCents;
}

/**
 * Compute unrealized gain/loss percentage for a single holding.
 *
 * @param holding - The crypto holding.
 * @returns Percentage gain/loss (e.g. 25.5 for 25.5%), or 0 if cost basis is 0.
 */
export function holdingUnrealizedPercent(holding: CryptoHolding): number {
  const gainLoss = holdingUnrealizedGainLoss(holding);
  const pct = safeDivide(gainLoss, holding.costBasisCents) * 100;
  return Math.round(pct * 100) / 100;
}

// ---------------------------------------------------------------------------
// Portfolio aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate holdings by symbol across all sources.
 *
 * Merges holdings that share the same symbol, summing their quantities,
 * cost bases, and values.
 *
 * @param holdings - All crypto holdings across exchanges and wallets.
 * @returns Allocation breakdown by symbol.
 */
export function aggregateBySymbol(holdings: readonly CryptoHolding[]): readonly CryptoAllocation[] {
  if (holdings.length === 0) return [];

  const symbolMap = new Map<string, { totalValueCents: number; totalQuantity: number }>();

  for (const h of holdings) {
    const value = holdingMarketValue(h);
    const existing = symbolMap.get(h.symbol);
    if (existing) {
      existing.totalValueCents += value;
      existing.totalQuantity += h.quantity;
    } else {
      symbolMap.set(h.symbol, { totalValueCents: value, totalQuantity: h.quantity });
    }
  }

  const totalValue = Array.from(symbolMap.values()).reduce((sum, v) => sum + v.totalValueCents, 0);

  const allocations: CryptoAllocation[] = [];
  for (const [symbol, data] of symbolMap) {
    allocations.push({
      symbol,
      totalValueCents: data.totalValueCents,
      totalQuantity: data.totalQuantity,
      percent: Math.round(safeDivide(data.totalValueCents, totalValue) * 10000) / 100,
    });
  }

  return allocations.sort((a, b) => b.totalValueCents - a.totalValueCents);
}

/**
 * Filter holdings by source type.
 *
 * @param holdings - All crypto holdings.
 * @param source - Source filter.
 * @returns Filtered holdings from the specified source.
 */
export function filterBySource(
  holdings: readonly CryptoHolding[],
  source: CryptoSource,
): readonly CryptoHolding[] {
  return holdings.filter((h) => h.source === source);
}

/**
 * Compute a full crypto portfolio summary.
 *
 * Aggregates all holdings across exchanges and wallets into a single
 * summary with total value, cost basis, unrealized gain/loss, and
 * allocation by coin.
 *
 * @param holdings - All crypto holdings.
 * @returns Portfolio summary.
 */
export function computeCryptoPortfolioSummary(
  holdings: readonly CryptoHolding[],
): CryptoPortfolioSummary {
  if (holdings.length === 0) {
    return {
      totalValueCents: 0,
      totalCostBasisCents: 0,
      totalUnrealizedGainLossCents: 0,
      totalUnrealizedGainLossPercent: 0,
      allocationBySymbol: [],
      holdingCount: 0,
    };
  }

  let totalValueCents = 0;
  let totalCostBasisCents = 0;

  for (const h of holdings) {
    totalValueCents += holdingMarketValue(h);
    totalCostBasisCents += h.costBasisCents;
  }

  const totalUnrealizedGainLossCents = totalValueCents - totalCostBasisCents;
  const totalUnrealizedGainLossPercent =
    Math.round(safeDivide(totalUnrealizedGainLossCents, totalCostBasisCents) * 10000) / 100;

  const allocationBySymbol = aggregateBySymbol(holdings);

  return {
    totalValueCents,
    totalCostBasisCents,
    totalUnrealizedGainLossCents,
    totalUnrealizedGainLossPercent,
    allocationBySymbol,
    holdingCount: holdings.length,
  };
}
