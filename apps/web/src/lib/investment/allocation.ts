// SPDX-License-Identifier: BUSL-1.1

/**
 * Target-vs-actual asset allocation engine.
 *
 * Computes current portfolio allocation by asset class, compares against
 * user-defined targets, and generates rebalancing suggestions.
 *
 * All monetary values are integer cents. Percentages are 0–100.
 *
 * References: issue #1595
 */

import type { InvestmentType } from '../../kmp/bridge';
import { ASSET_CLASS_LABELS } from '../../types/investment';
import type {
  AllocationAnalysis,
  AllocationComparison,
  AllocationTarget,
  AssetClass,
} from '../../types/investment';

// ---------------------------------------------------------------------------
// Asset class mapping
// ---------------------------------------------------------------------------

/**
 * Default mapping from InvestmentType to AssetClass.
 *
 * Users can override per-holding, but this provides sensible defaults.
 */
export const DEFAULT_ASSET_CLASS_MAP: Record<InvestmentType, AssetClass> = {
  STOCK: 'US_STOCKS',
  BOND: 'BONDS',
  ETF: 'US_STOCKS',
  MUTUAL_FUND: 'US_STOCKS',
  CRYPTO: 'CRYPTO',
  REAL_ESTATE: 'REAL_ESTATE',
  COMMODITY: 'COMMODITIES',
  OTHER: 'OTHER',
};

// ---------------------------------------------------------------------------
// Preset allocation templates
// ---------------------------------------------------------------------------

/** Common allocation preset strategies. */
export interface AllocationPreset {
  readonly name: string;
  readonly description: string;
  readonly targets: readonly AllocationTarget[];
}

/** Pre-built allocation templates for common investment strategies. */
export const ALLOCATION_PRESETS: readonly AllocationPreset[] = [
  {
    name: 'Aggressive Growth',
    description: '90% stocks, 10% bonds. Suited for long time horizons.',
    targets: [
      { assetClass: 'US_STOCKS', targetPercent: 60 },
      { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 30 },
      { assetClass: 'BONDS', targetPercent: 10 },
    ],
  },
  {
    name: 'Balanced',
    description: '60% stocks, 30% bonds, 10% cash.',
    targets: [
      { assetClass: 'US_STOCKS', targetPercent: 40 },
      { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 20 },
      { assetClass: 'BONDS', targetPercent: 30 },
      { assetClass: 'CASH', targetPercent: 10 },
    ],
  },
  {
    name: 'Conservative',
    description: '30% stocks, 50% bonds, 20% cash. Lower volatility.',
    targets: [
      { assetClass: 'US_STOCKS', targetPercent: 20 },
      { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 10 },
      { assetClass: 'BONDS', targetPercent: 50 },
      { assetClass: 'CASH', targetPercent: 20 },
    ],
  },
  {
    name: 'Three-Fund Portfolio',
    description: 'Classic Bogleheads approach: US stocks, international stocks, bonds.',
    targets: [
      { assetClass: 'US_STOCKS', targetPercent: 50 },
      { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 30 },
      { assetClass: 'BONDS', targetPercent: 20 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Allocation computation
// ---------------------------------------------------------------------------

/** Holding with market value and asset class assignment. */
export interface HoldingWithClass {
  readonly symbol: string;
  readonly marketValue: number; // cents
  readonly assetClass: AssetClass;
}

/**
 * Validate that target allocations sum to 100%.
 *
 * @param targets - Array of allocation targets.
 * @returns True if percentages sum to exactly 100.
 */
export function validateTargets(targets: readonly AllocationTarget[]): boolean {
  const sum = targets.reduce((acc, t) => acc + t.targetPercent, 0);
  return Math.abs(sum - 100) < 0.01;
}

/**
 * Compute target-vs-actual asset allocation analysis.
 *
 * @param holdings - Portfolio holdings with assigned asset classes.
 * @param targets - User-defined target allocation percentages.
 * @returns Full allocation analysis with deviations and rebalancing suggestions.
 */
export function computeAllocation(
  holdings: readonly HoldingWithClass[],
  targets: readonly AllocationTarget[],
): AllocationAnalysis {
  const isTargetValid = validateTargets(targets);

  // Compute total portfolio value
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);

  // Aggregate actual allocation by asset class
  const actualByClass = new Map<AssetClass, number>();
  for (const holding of holdings) {
    const current = actualByClass.get(holding.assetClass) ?? 0;
    actualByClass.set(holding.assetClass, current + holding.marketValue);
  }

  // Build comparison for each target asset class
  const targetClasses = new Set(targets.map((t) => t.assetClass));
  // Also include asset classes that have actual holdings but no target
  for (const ac of actualByClass.keys()) {
    targetClasses.add(ac);
  }

  const comparisons: AllocationComparison[] = [];

  for (const assetClass of targetClasses) {
    const target = targets.find((t) => t.assetClass === assetClass);
    const targetPercent = target?.targetPercent ?? 0;
    const currentValue = actualByClass.get(assetClass) ?? 0;
    const actualPercent =
      totalPortfolioValue > 0 ? Math.round((currentValue / totalPortfolioValue) * 10000) / 100 : 0;
    const deviationPercent = Math.round((actualPercent - targetPercent) * 100) / 100;
    const targetValue = Math.round((targetPercent / 100) * totalPortfolioValue);
    const rebalanceAmount = targetValue - currentValue;

    comparisons.push({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass],
      targetPercent,
      actualPercent,
      deviationPercent,
      currentValue,
      targetValue,
      rebalanceAmount,
    });
  }

  // Sort: largest deviation first for actionable display
  comparisons.sort((a, b) => Math.abs(b.deviationPercent) - Math.abs(a.deviationPercent));

  return {
    totalPortfolioValue,
    comparisons,
    isTargetValid,
  };
}

/**
 * Generate rebalancing trade suggestions.
 *
 * Returns a list of asset classes with the dollar amount to buy or sell
 * to bring the portfolio back to target allocation.
 *
 * @param analysis - The allocation analysis result.
 * @param threshold - Minimum deviation percentage to suggest a trade (default: 1%).
 * @returns Filtered comparisons that exceed the threshold.
 */
export function getRebalancingSuggestions(
  analysis: AllocationAnalysis,
  threshold: number = 1,
): readonly AllocationComparison[] {
  if (!analysis.isTargetValid) {
    return [];
  }

  return analysis.comparisons.filter((c) => Math.abs(c.deviationPercent) >= threshold);
}
