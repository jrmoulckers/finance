// SPDX-License-Identifier: BUSL-1.1

/**
 * Rebalancing planner and drift alert engine.
 *
 * Computes drift between target and actual asset allocation, generates
 * rebalance trade suggestions, and provides tax-aware placement advice.
 *
 * All monetary values are integer cents. Percentages use 0–100 scale.
 *
 * References: issue #1600
 */

import type { TaxTreatment } from '../../types/investment';
import type {
  AssetAllocationTarget,
  DriftAnalysis,
  PortfolioHolding,
  RebalanceAction,
  TaxAwareRebalanceAction,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even).
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  const rounded = Math.round(value);
  // When exactly at 0.5, round to even
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Drift analysis
// ---------------------------------------------------------------------------

/**
 * Compute drift analysis for each asset class.
 *
 * Compares current portfolio allocation against target allocation and
 * calculates absolute drift per asset class.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages (must sum to 100).
 * @returns Array of drift analyses sorted by absolute drift descending.
 */
export function computeDrift(
  holdings: readonly PortfolioHolding[],
  targets: readonly AssetAllocationTarget[],
): readonly DriftAnalysis[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);

  if (totalValue === 0) {
    return targets.map((t) => ({
      assetClass: t.assetClass,
      targetPercent: t.targetPercent,
      actualPercent: 0,
      driftPercent: -t.targetPercent,
      currentValueCents: 0,
      targetValueCents: 0,
    }));
  }

  // Aggregate value by asset class
  const valueByClass = new Map<string, number>();
  for (const h of holdings) {
    valueByClass.set(h.assetClass, (valueByClass.get(h.assetClass) ?? 0) + h.marketValueCents);
  }

  // Collect all asset classes (from both targets and holdings)
  const allClasses = new Set([...targets.map((t) => t.assetClass), ...valueByClass.keys()]);

  const results: DriftAnalysis[] = [];

  for (const assetClass of allClasses) {
    const target = targets.find((t) => t.assetClass === assetClass);
    const targetPercent = target?.targetPercent ?? 0;
    const currentValue = valueByClass.get(assetClass) ?? 0;
    const actualPercent = Math.round((currentValue / totalValue) * 10000) / 100;
    const driftPercent = Math.round((actualPercent - targetPercent) * 100) / 100;
    const targetValueCents = bankersRound((targetPercent / 100) * totalValue);

    results.push({
      assetClass: assetClass as DriftAnalysis['assetClass'],
      targetPercent,
      actualPercent,
      driftPercent,
      currentValueCents: currentValue,
      targetValueCents,
    });
  }

  // Sort by absolute drift descending
  results.sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent));

  return results;
}

// ---------------------------------------------------------------------------
// Rebalance trade generation
// ---------------------------------------------------------------------------

/**
 * Generate rebalance trades to bring portfolio back to target allocation.
 *
 * Only generates trades for asset classes where drift exceeds the threshold.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @param thresholdPercent - Minimum drift to trigger a trade (default 1%).
 * @returns Array of rebalance actions (buy/sell amounts).
 */
export function generateRebalanceActions(
  holdings: readonly PortfolioHolding[],
  targets: readonly AssetAllocationTarget[],
  thresholdPercent: number = 1,
): readonly RebalanceAction[] {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  if (totalValue === 0) return [];

  const drifts = computeDrift(holdings, targets);

  return drifts
    .filter((d) => Math.abs(d.driftPercent) >= thresholdPercent)
    .map((d) => {
      const amountCents = d.targetValueCents - d.currentValueCents;
      return {
        assetClass: d.assetClass,
        amountCents,
        direction: amountCents >= 0 ? ('BUY' as const) : ('SELL' as const),
      };
    });
}

// ---------------------------------------------------------------------------
// Tax-aware rebalancing
// ---------------------------------------------------------------------------

/** Tax treatment preference for rebalancing actions. */
interface AccountPreference {
  readonly preferredAccountType: TaxAwareRebalanceAction['preferredAccountType'];
  readonly reason: string;
}

/**
 * Determine preferred account type for a rebalance trade.
 *
 * General tax-efficient placement rules:
 * - Sell (harvest gains) in tax-deferred accounts when possible
 * - Buy bonds/income-producing assets in tax-deferred
 * - Buy stocks/growth in taxable or Roth
 *
 * @param action - The rebalance action.
 * @param holdingTaxTreatments - Map of asset class to available tax treatments.
 * @returns Account preference with reason.
 */
function getAccountPreference(
  action: RebalanceAction,
  holdingTaxTreatments: ReadonlyMap<string, readonly TaxTreatment[]>,
): AccountPreference {
  const treatments = holdingTaxTreatments.get(action.assetClass) ?? [];

  if (action.direction === 'SELL') {
    // Prefer selling in tax-deferred to avoid capital gains
    if (treatments.includes('TAX_DEFERRED')) {
      return {
        preferredAccountType: 'TAX_DEFERRED',
        reason: 'Sell in tax-deferred account to avoid realizing capital gains.',
      };
    }
    if (treatments.includes('TAX_FREE')) {
      return {
        preferredAccountType: 'TAX_FREE',
        reason: 'Sell in tax-free account — no tax impact.',
      };
    }
    return {
      preferredAccountType: 'TAXABLE',
      reason: 'Only taxable accounts available — consider tax-loss harvesting.',
    };
  }

  // BUY direction
  if (action.assetClass === 'BONDS' || action.assetClass === 'CASH') {
    // Income-producing assets belong in tax-deferred
    if (treatments.includes('TAX_DEFERRED')) {
      return {
        preferredAccountType: 'TAX_DEFERRED',
        reason: 'Income-producing assets are most tax-efficient in tax-deferred accounts.',
      };
    }
  }

  // Growth assets (stocks) in Roth/taxable
  if (treatments.includes('TAX_FREE')) {
    return {
      preferredAccountType: 'TAX_FREE',
      reason: 'Growth assets benefit most from tax-free compounding.',
    };
  }

  return {
    preferredAccountType: 'TAXABLE',
    reason: 'Standard taxable account placement.',
  };
}

/**
 * Generate tax-aware rebalancing suggestions.
 *
 * Wraps basic rebalance actions with account placement recommendations.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @param holdingTaxTreatments - Map of asset class to available account tax treatments.
 * @param thresholdPercent - Minimum drift to trigger a trade (default 1%).
 * @returns Array of tax-aware rebalance actions.
 */
export function generateTaxAwareRebalanceActions(
  holdings: readonly PortfolioHolding[],
  targets: readonly AssetAllocationTarget[],
  holdingTaxTreatments: ReadonlyMap<string, readonly TaxTreatment[]>,
  thresholdPercent: number = 1,
): readonly TaxAwareRebalanceAction[] {
  const actions = generateRebalanceActions(holdings, targets, thresholdPercent);

  return actions.map((action) => {
    const pref = getAccountPreference(action, holdingTaxTreatments);
    return {
      ...action,
      preferredAccountType: pref.preferredAccountType,
      reason: pref.reason,
    };
  });
}

/**
 * Check whether any asset class drift exceeds the alert threshold.
 *
 * @param holdings - Current portfolio holdings.
 * @param targets - Target allocation percentages.
 * @param alertThresholdPercent - Drift percentage that triggers an alert (default 5%).
 * @returns True if any asset class drift exceeds the threshold.
 */
export function hasDriftAlert(
  holdings: readonly PortfolioHolding[],
  targets: readonly AssetAllocationTarget[],
  alertThresholdPercent: number = 5,
): boolean {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValueCents, 0);
  if (totalValue === 0) return false;

  const drifts = computeDrift(holdings, targets);
  return drifts.some((d) => Math.abs(d.driftPercent) >= alertThresholdPercent);
}
