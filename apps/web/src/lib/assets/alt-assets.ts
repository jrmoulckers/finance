// SPDX-License-Identifier: BUSL-1.1

/**
 * Alternative asset and collectibles tracking engine.
 *
 * Tracks collectibles (art, wine, cards, watches), vehicles, precious metals,
 * and other tangible assets with manual valuation histories, estimated
 * appreciation, insurance values, and total allocation breakdowns.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1696
 */

import { safeDivide } from './crypto-portfolio';
import type {
  AltAssetCategory,
  AltAssetCategoryAllocation,
  AltAssetSummary,
  AlternativeAsset,
  Valuation,
} from './types';

// ---------------------------------------------------------------------------
// Single asset analytics
// ---------------------------------------------------------------------------

/**
 * Compute the total appreciation for a single alternative asset in cents.
 *
 * @param asset - The alternative asset.
 * @returns Appreciation in cents (positive = gain).
 */
export function assetAppreciation(asset: AlternativeAsset): number {
  return asset.currentValueCents - asset.purchasePriceCents;
}

/**
 * Compute the appreciation percentage for a single alternative asset.
 *
 * @param asset - The alternative asset.
 * @returns Appreciation percentage (e.g. 25.5 for 25.5%), or 0 if cost is 0.
 */
export function assetAppreciationPercent(asset: AlternativeAsset): number {
  const pct = safeDivide(assetAppreciation(asset), asset.purchasePriceCents) * 100;
  return Math.round(pct * 100) / 100;
}

/**
 * Compute annualized appreciation rate for an alternative asset.
 *
 * Uses compound annual growth rate (CAGR) formula.
 *
 * @param asset - The alternative asset.
 * @param asOfDate - Date to compute against (ISO-8601 string).
 * @returns Annualized appreciation rate as a percentage, or 0 if insufficient data.
 */
export function annualizedAppreciation(asset: AlternativeAsset, asOfDate: string): number {
  if (asset.purchasePriceCents <= 0 || asset.currentValueCents <= 0) return 0;

  const purchaseMs = new Date(asset.purchaseDate + 'T00:00:00Z').getTime();
  const asOfMs = new Date(asOfDate + 'T00:00:00Z').getTime();
  const yearsHeld = (asOfMs - purchaseMs) / (1000 * 60 * 60 * 24 * 365.25);

  if (yearsHeld <= 0) return 0;

  const ratio = asset.currentValueCents / asset.purchasePriceCents;
  const cagr = Math.pow(ratio, 1 / yearsHeld) - 1;
  return Math.round(cagr * 10000) / 100;
}

/**
 * Get the latest valuation from a valuation history.
 *
 * @param history - Chronological valuation entries.
 * @returns The most recent valuation, or undefined if empty.
 */
export function latestValuation(history: readonly Valuation[]): Valuation | undefined {
  if (history.length === 0) return undefined;
  return [...history].sort(
    (a, b) => new Date(b.date + 'T00:00:00Z').getTime() - new Date(a.date + 'T00:00:00Z').getTime(),
  )[0];
}

// ---------------------------------------------------------------------------
// Category allocation
// ---------------------------------------------------------------------------

/**
 * Compute allocation by alternative asset category.
 *
 * @param assets - All alternative assets.
 * @returns Allocation breakdown by category.
 */
export function computeCategoryAllocation(
  assets: readonly AlternativeAsset[],
): readonly AltAssetCategoryAllocation[] {
  if (assets.length === 0) return [];

  const categoryMap = new Map<AltAssetCategory, { totalValueCents: number; count: number }>();

  for (const a of assets) {
    const existing = categoryMap.get(a.category);
    if (existing) {
      existing.totalValueCents += a.currentValueCents;
      existing.count += 1;
    } else {
      categoryMap.set(a.category, {
        totalValueCents: a.currentValueCents,
        count: 1,
      });
    }
  }

  const totalValue = assets.reduce((sum, a) => sum + a.currentValueCents, 0);

  const allocations: AltAssetCategoryAllocation[] = [];
  for (const [category, data] of categoryMap) {
    allocations.push({
      category,
      totalValueCents: data.totalValueCents,
      count: data.count,
      percent: Math.round(safeDivide(data.totalValueCents, totalValue) * 10000) / 100,
    });
  }

  return allocations.sort((a, b) => b.totalValueCents - a.totalValueCents);
}

// ---------------------------------------------------------------------------
// Portfolio summary
// ---------------------------------------------------------------------------

/**
 * Compute a full summary of all alternative assets.
 *
 * Aggregates total value, cost, appreciation, insurance value, and
 * allocation by category.
 *
 * @param assets - All alternative assets.
 * @returns Alternative asset portfolio summary.
 */
export function computeAltAssetSummary(assets: readonly AlternativeAsset[]): AltAssetSummary {
  if (assets.length === 0) {
    return {
      totalValueCents: 0,
      totalCostCents: 0,
      totalAppreciationCents: 0,
      totalAppreciationPercent: 0,
      totalInsuranceValueCents: 0,
      allocationByCategory: [],
      assetCount: 0,
    };
  }

  let totalValueCents = 0;
  let totalCostCents = 0;
  let totalInsuranceValueCents = 0;

  for (const a of assets) {
    totalValueCents += a.currentValueCents;
    totalCostCents += a.purchasePriceCents;
    totalInsuranceValueCents += a.insuranceValueCents ?? 0;
  }

  const totalAppreciationCents = totalValueCents - totalCostCents;
  const totalAppreciationPercent =
    Math.round(safeDivide(totalAppreciationCents, totalCostCents) * 10000) / 100;

  return {
    totalValueCents,
    totalCostCents,
    totalAppreciationCents,
    totalAppreciationPercent,
    totalInsuranceValueCents,
    allocationByCategory: computeCategoryAllocation(assets),
    assetCount: assets.length,
  };
}

/**
 * Compute the insurance coverage gap (current value minus insured value).
 *
 * @param asset - An alternative asset.
 * @returns Coverage gap in cents. Positive = underinsured.
 */
export function insuranceCoverageGap(asset: AlternativeAsset): number {
  const insured = asset.insuranceValueCents ?? 0;
  return asset.currentValueCents - insured;
}

/**
 * Filter alternative assets by category.
 *
 * @param assets - All alternative assets.
 * @param category - Category to filter.
 * @returns Filtered assets.
 */
export function filterByCategory(
  assets: readonly AlternativeAsset[],
  category: AltAssetCategory,
): readonly AlternativeAsset[] {
  return assets.filter((a) => a.category === category);
}
