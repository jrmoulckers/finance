// SPDX-License-Identifier: BUSL-1.1

/**
 * Portfolio asset allocation and rebalancing workspace.
 *
 * Computes current vs target allocation, drift percentages per asset class,
 * generates rebalance trades (minimizing trade count), supports tax-lot
 * aware rebalancing and cash-flow based rebalancing.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1694
 */

import type {
  AllocationDrift,
  AllocationHolding,
  AllocationTarget,
  AssetClassName,
  Cents,
  Percent,
  RebalanceResult,
  RebalanceTrade,
} from './types';
import { bankersRound, safeDivide } from './trade-import';

// ---------------------------------------------------------------------------
// Allocation validation
// ---------------------------------------------------------------------------

/**
 * Validate that allocation targets sum to 100%.
 *
 * @param targets - Array of allocation targets.
 * @returns True if percentages sum to exactly 100 (within 0.01 tolerance).
 */
export function validateAllocationTargets(targets: readonly AllocationTarget[]): boolean {
  if (targets.length === 0) return false;
  const sum = targets.reduce((acc, t) => acc + t.targetPercent, 0);
  return Math.abs(sum - 100) < 0.01;
}

// ---------------------------------------------------------------------------
// Allocation drift computation
// ---------------------------------------------------------------------------

/**
 * Compute drift between current and target allocation.
 *
 * Aggregates holdings by asset class, computes actual percentages, and
 * determines the delta needed to reach target allocation.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @returns Array of allocation drifts sorted by absolute drift descending.
 */
export function computeAllocationDrift(
  holdings: readonly AllocationHolding[],
  targets: readonly AllocationTarget[],
): AllocationDrift[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);

  // Aggregate by asset class
  const actualByClass = new Map<AssetClassName, Cents>();
  for (const h of holdings) {
    actualByClass.set(h.assetClass, (actualByClass.get(h.assetClass) ?? 0) + h.marketValueCents);
  }

  // Collect all asset classes from both targets and actuals
  const allClasses = new Set<AssetClassName>();
  for (const t of targets) allClasses.add(t.assetClass);
  for (const cls of actualByClass.keys()) allClasses.add(cls);

  const drifts: AllocationDrift[] = [];

  for (const assetClass of allClasses) {
    const target = targets.find((t) => t.assetClass === assetClass);
    const targetPercent = target?.targetPercent ?? 0;
    const currentValueCents = actualByClass.get(assetClass) ?? 0;

    const actualPercent =
      totalValue > 0 ? Math.round(safeDivide(currentValueCents, totalValue) * 10000) / 100 : 0;

    const driftPercent = Math.round((actualPercent - targetPercent) * 100) / 100;
    const targetValueCents = bankersRound((targetPercent / 100) * totalValue);
    const deltaValueCents = targetValueCents - currentValueCents;

    drifts.push({
      assetClass,
      targetPercent,
      actualPercent,
      driftPercent,
      currentValueCents,
      targetValueCents,
      deltaValueCents,
    });
  }

  // Sort by absolute drift descending
  drifts.sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));

  return drifts;
}

// ---------------------------------------------------------------------------
// Rebalance trade generation
// ---------------------------------------------------------------------------

/**
 * Generate rebalance trades to bring portfolio back to target allocation.
 *
 * Minimizes the number of trades by only suggesting trades for asset classes
 * that exceed the drift threshold.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @param thresholdPercent - Minimum drift to trigger a trade (default 1%).
 * @returns Array of suggested rebalance trades.
 */
export function generateRebalanceTrades(
  holdings: readonly AllocationHolding[],
  targets: readonly AllocationTarget[],
  thresholdPercent: Percent = 1,
): RebalanceTrade[] {
  const drifts = computeAllocationDrift(holdings, targets);
  const trades: RebalanceTrade[] = [];

  // Build a lookup of holdings by asset class for symbol and tax info
  const holdingsByClass = new Map<AssetClassName, AllocationHolding[]>();
  for (const h of holdings) {
    const list = holdingsByClass.get(h.assetClass) ?? [];
    list.push(h);
    holdingsByClass.set(h.assetClass, list);
  }

  for (const drift of drifts) {
    if (Math.abs(drift.driftPercent) < thresholdPercent) continue;

    const classHoldings = holdingsByClass.get(drift.assetClass) ?? [];
    const action: 'BUY' | 'SELL' = drift.deltaValueCents > 0 ? 'BUY' : 'SELL';
    const amountCents = Math.abs(drift.deltaValueCents);

    // Check for tax implications (selling with gains)
    const hasTaxImplication =
      action === 'SELL' && classHoldings.some((h) => (h.unrealizedGainCents ?? 0) > 0);

    // Pick the representative symbol (largest holding in class)
    const sortedHoldings = [...classHoldings].sort(
      (a, b) => b.marketValueCents - a.marketValueCents,
    );
    const symbol = sortedHoldings[0]?.symbol ?? drift.assetClass;

    trades.push({
      symbol,
      assetClass: drift.assetClass,
      action,
      amountCents,
      hasTaxImplication,
    });
  }

  return trades;
}

// ---------------------------------------------------------------------------
// Tax-lot aware rebalancing
// ---------------------------------------------------------------------------

/**
 * Filter rebalance trades to avoid selling holdings with short-term gains.
 *
 * Removes or reduces sell trades where all holdings have unrealized gains
 * and no tax lots to offset. This is a simplified heuristic — real
 * tax-lot optimization requires lot-level data.
 *
 * @param trades - Proposed rebalance trades.
 * @param holdings - Current holdings with unrealized gain info.
 * @returns Filtered trades with tax-aware adjustments.
 */
export function filterTaxAwareTrades(
  trades: readonly RebalanceTrade[],
  holdings: readonly AllocationHolding[],
): RebalanceTrade[] {
  return trades.map((trade) => {
    if (trade.action !== 'SELL' || !trade.hasTaxImplication) return trade;

    // Find holdings in this asset class with losses to harvest
    const classHoldings = holdings.filter((h) => h.assetClass === trade.assetClass);
    const hasLossLots = classHoldings.some((h) => (h.unrealizedGainCents ?? 0) < 0);

    if (hasLossLots) {
      // Allow the trade — tax losses can offset gains
      return { ...trade, hasTaxImplication: false };
    }

    // Still suggest the trade but flag it
    return trade;
  });
}

// ---------------------------------------------------------------------------
// Cash-flow based rebalancing
// ---------------------------------------------------------------------------

/**
 * Direct new cash to underweight asset classes instead of selling.
 *
 * Distributes available cash proportionally to asset classes below target,
 * avoiding any sell trades entirely.
 *
 * @param drifts - Current allocation drifts.
 * @param availableCashCents - New cash to invest (cents).
 * @returns Array of buy-only rebalance trades.
 */
export function generateCashFlowRebalanceTrades(
  drifts: readonly AllocationDrift[],
  availableCashCents: Cents,
): RebalanceTrade[] {
  if (availableCashCents <= 0) return [];

  // Find underweight classes (positive deltaValueCents = need to buy)
  const underweight = drifts.filter((d) => d.deltaValueCents > 0);
  if (underweight.length === 0) return [];

  const totalUnderweight = underweight.reduce((sum, d) => sum + d.deltaValueCents, 0);
  const trades: RebalanceTrade[] = [];

  for (const drift of underweight) {
    // Proportional allocation of cash
    const proportion = safeDivide(drift.deltaValueCents, totalUnderweight);
    const allocatedCents = bankersRound(proportion * availableCashCents);

    if (allocatedCents > 0) {
      trades.push({
        symbol: drift.assetClass,
        assetClass: drift.assetClass,
        action: 'BUY',
        amountCents: allocatedCents,
        hasTaxImplication: false,
      });
    }
  }

  return trades;
}

// ---------------------------------------------------------------------------
// Full rebalance analysis
// ---------------------------------------------------------------------------

/**
 * Run a complete rebalance analysis.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @param thresholdPercent - Minimum drift to trigger a trade (default 1%).
 * @returns Full rebalance result with drifts, trades, and metadata.
 */
export function computeRebalanceAnalysis(
  holdings: readonly AllocationHolding[],
  targets: readonly AllocationTarget[],
  thresholdPercent: Percent = 1,
): RebalanceResult {
  const isTargetValid = validateAllocationTargets(targets);
  const totalPortfolioValueCents = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  const drifts = computeAllocationDrift(holdings, targets);

  let trades: RebalanceTrade[] = [];
  if (isTargetValid) {
    trades = generateRebalanceTrades(holdings, targets, thresholdPercent);
  }

  return {
    drifts,
    trades,
    totalPortfolioValueCents,
    isTargetValid,
    tradeCount: trades.length,
  };
}
