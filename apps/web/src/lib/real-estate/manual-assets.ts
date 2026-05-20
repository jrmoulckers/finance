// SPDX-License-Identifier: BUSL-1.1

/**
 * Manual asset registry for non-connected and illiquid assets.
 *
 * Provides functions to calculate current values, track value history,
 * compute portfolio contributions, and break down by category.
 *
 * All monetary values are integer cents. Percentages are 0–100.
 *
 * References: issue #1581
 */

import type {
  AssetCategoryBreakdown,
  AssetValueEntry,
  ManualAsset,
  ManualAssetCategory,
  ManualAssetPortfolio,
} from './types';

// ---------------------------------------------------------------------------
// Current value
// ---------------------------------------------------------------------------

/**
 * Get the current (most recent) value of a manual asset.
 *
 * Returns the value from the most recent entry in the value history,
 * or 0 if no history exists.
 *
 * @param asset - The manual asset.
 * @returns Current value in cents.
 */
export function getCurrentValue(asset: ManualAsset): number {
  if (asset.valueHistory.length === 0) {
    return 0;
  }

  // Find the most recent entry by date
  let latest: AssetValueEntry = asset.valueHistory[0];
  for (let i = 1; i < asset.valueHistory.length; i++) {
    if (asset.valueHistory[i].date > latest.date) {
      latest = asset.valueHistory[i];
    }
  }

  return latest.valueCents;
}

// ---------------------------------------------------------------------------
// Value change tracking
// ---------------------------------------------------------------------------

/**
 * Calculate the total value change for a manual asset.
 *
 * Compares the earliest and most recent value entries.
 *
 * @param asset - The manual asset.
 * @returns Value change in cents (positive = appreciated, negative = depreciated).
 */
export function getValueChange(asset: ManualAsset): number {
  if (asset.valueHistory.length < 2) {
    return 0;
  }

  const sorted = [...asset.valueHistory].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1].valueCents - sorted[0].valueCents;
}

/**
 * Calculate the percentage change in value for a manual asset.
 *
 * @param asset - The manual asset.
 * @returns Percentage change (e.g., 15.5 for 15.5% gain), or 0 if insufficient data.
 */
export function getValueChangePercent(asset: ManualAsset): number {
  if (asset.valueHistory.length < 2) {
    return 0;
  }

  const sorted = [...asset.valueHistory].sort((a, b) => a.date.localeCompare(b.date));
  const oldValue = sorted[0].valueCents;

  if (oldValue === 0) {
    return 0;
  }

  const change = sorted[sorted.length - 1].valueCents - oldValue;
  return Math.round((change / oldValue) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// Value history
// ---------------------------------------------------------------------------

/**
 * Get the value history of a manual asset sorted chronologically.
 *
 * @param asset - The manual asset.
 * @returns Value entries sorted from oldest to newest.
 */
export function getSortedValueHistory(asset: ManualAsset): readonly AssetValueEntry[] {
  return [...asset.valueHistory].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Portfolio contribution
// ---------------------------------------------------------------------------

/**
 * Calculate a single asset's contribution to a total portfolio value.
 *
 * @param asset - The manual asset.
 * @param totalPortfolioValueCents - Total portfolio value in cents (all assets, not just manual).
 * @returns Contribution percentage (0–100), or 0 if total is zero.
 */
export function calculatePortfolioContribution(
  asset: ManualAsset,
  totalPortfolioValueCents: number,
): number {
  if (totalPortfolioValueCents <= 0) {
    return 0;
  }

  const currentValue = getCurrentValue(asset);
  return Math.round((currentValue / totalPortfolioValueCents) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

/** All supported asset categories for iteration. */
const ALL_CATEGORIES: readonly ManualAssetCategory[] = [
  'real_estate',
  'vehicle',
  'collectible',
  'jewelry',
  'art',
  'precious_metal',
  'business_equity',
  'other',
];

/**
 * Build a portfolio summary with category breakdown from a list of manual assets.
 *
 * @param assets - All manual assets.
 * @returns Portfolio summary with total value and per-category breakdown.
 */
export function buildPortfolioSummary(assets: readonly ManualAsset[]): ManualAssetPortfolio {
  // Aggregate value and count by category
  const categoryMap = new Map<ManualAssetCategory, { total: number; count: number }>();
  for (const cat of ALL_CATEGORIES) {
    categoryMap.set(cat, { total: 0, count: 0 });
  }

  let totalValueCents = 0;

  for (const asset of assets) {
    const value = getCurrentValue(asset);
    totalValueCents += value;

    const entry = categoryMap.get(asset.category);
    if (entry) {
      entry.total += value;
      entry.count += 1;
    }
  }

  // Build breakdown, only include categories that have assets
  const categoryBreakdown: AssetCategoryBreakdown[] = [];

  for (const [category, data] of categoryMap) {
    if (data.count > 0) {
      categoryBreakdown.push({
        category,
        totalValueCents: data.total,
        assetCount: data.count,
        percentOfTotal:
          totalValueCents > 0 ? Math.round((data.total / totalValueCents) * 10000) / 100 : 0,
      });
    }
  }

  // Sort by value descending
  categoryBreakdown.sort((a, b) => b.totalValueCents - a.totalValueCents);

  return {
    totalValueCents,
    assetCount: assets.length,
    categoryBreakdown,
  };
}

/**
 * Filter manual assets by category.
 *
 * @param assets - All manual assets.
 * @param category - The category to filter by.
 * @returns Assets matching the specified category.
 */
export function filterByCategory(
  assets: readonly ManualAsset[],
  category: ManualAssetCategory,
): readonly ManualAsset[] {
  return assets.filter((a) => a.category === category);
}

/**
 * Calculate the total current value across all provided manual assets.
 *
 * @param assets - The manual assets to total.
 * @returns Total value in cents.
 */
export function calculateTotalValue(assets: readonly ManualAsset[]): number {
  return assets.reduce((sum, asset) => sum + getCurrentValue(asset), 0);
}
