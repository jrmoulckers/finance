// SPDX-License-Identifier: BUSL-1.1

/**
 * Tax-location and asset-placement optimizer.
 *
 * Provides:
 * - Asset placement recommendations (tax-inefficient assets → tax-advantaged accounts)
 * - Tax-equivalent yield calculator
 * - Optimal account placement suggestions by asset class
 * - Projected tax savings from optimal placement
 *
 * All monetary values are in integer cents. Pure functions only.
 *
 * References: issues #1660, #1707
 */

import {
  AccountTaxType,
  AssetClass,
  TaxEfficiency,
  type AssetHolding,
  type AssetPlacement,
  type TaxEquivalentYield,
  type TaxLocationSummary,
} from './types';

// ---------------------------------------------------------------------------
// Banker's rounding helper
// ---------------------------------------------------------------------------

/**
 * Round a number using banker's rounding (round half to even).
 *
 * @param value - Value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;

  if (decimal > 0.5) return floor + 1;
  if (decimal < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Asset class → tax efficiency mapping
// ---------------------------------------------------------------------------

/** Maps each asset class to its tax efficiency rating. */
const ASSET_TAX_EFFICIENCY: Readonly<Record<AssetClass, TaxEfficiency>> = {
  [AssetClass.US_STOCKS]: TaxEfficiency.HIGH,
  [AssetClass.INTERNATIONAL_STOCKS]: TaxEfficiency.HIGH,
  [AssetClass.MUNICIPAL_BONDS]: TaxEfficiency.HIGH,
  [AssetClass.BONDS]: TaxEfficiency.LOW,
  [AssetClass.HIGH_YIELD_BONDS]: TaxEfficiency.LOW,
  [AssetClass.REITS]: TaxEfficiency.LOW,
  [AssetClass.TIPS]: TaxEfficiency.LOW,
  [AssetClass.COMMODITIES]: TaxEfficiency.MODERATE,
};

/** Recommended account tax type for each tax efficiency tier. */
const OPTIMAL_PLACEMENT: Readonly<Record<TaxEfficiency, AccountTaxType>> = {
  [TaxEfficiency.HIGH]: AccountTaxType.TAXABLE,
  [TaxEfficiency.MODERATE]: AccountTaxType.TAX_DEFERRED,
  [TaxEfficiency.LOW]: AccountTaxType.TAX_DEFERRED,
};

/**
 * Special overrides: some asset classes have specific best placements.
 *
 * - International stocks → Taxable (foreign tax credit eligibility)
 * - REITs → Tax-deferred (distributions are ordinary income)
 * - Municipal bonds → Taxable (already tax-exempt)
 * - US stocks (qualified dividends) → Taxable
 */
const ASSET_SPECIFIC_PLACEMENT: Readonly<Partial<Record<AssetClass, AccountTaxType>>> = {
  [AssetClass.INTERNATIONAL_STOCKS]: AccountTaxType.TAXABLE,
  [AssetClass.REITS]: AccountTaxType.TAX_DEFERRED,
  [AssetClass.MUNICIPAL_BONDS]: AccountTaxType.TAXABLE,
  [AssetClass.US_STOCKS]: AccountTaxType.TAXABLE,
  [AssetClass.BONDS]: AccountTaxType.TAX_DEFERRED,
  [AssetClass.HIGH_YIELD_BONDS]: AccountTaxType.TAX_DEFERRED,
  [AssetClass.TIPS]: AccountTaxType.TAX_FREE,
};

// ---------------------------------------------------------------------------
// Placement reason strings
// ---------------------------------------------------------------------------

const PLACEMENT_REASONS: Readonly<Record<AssetClass, string>> = {
  [AssetClass.US_STOCKS]:
    'US stocks with qualified dividends are tax-efficient; best in taxable accounts.',
  [AssetClass.INTERNATIONAL_STOCKS]:
    'International stocks belong in taxable accounts to claim the foreign tax credit.',
  [AssetClass.BONDS]:
    'Bond interest is taxed as ordinary income; shelter in tax-deferred accounts.',
  [AssetClass.HIGH_YIELD_BONDS]:
    'High-yield bond interest is taxed as ordinary income; shelter in tax-deferred accounts.',
  [AssetClass.REITS]:
    'REIT distributions are ordinary income (not qualified dividends); best in tax-deferred accounts.',
  [AssetClass.TIPS]: 'TIPS phantom income is taxable annually; ideal for Roth (tax-free) accounts.',
  [AssetClass.MUNICIPAL_BONDS]:
    'Municipal bond interest is already tax-exempt; no benefit from tax-advantaged accounts.',
  [AssetClass.COMMODITIES]:
    'Commodities have complex tax treatment (60/40 rule); moderate placement flexibility.',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the tax efficiency classification for an asset class.
 *
 * @param assetClass - The asset class to classify
 * @returns Tax efficiency rating
 */
export function getAssetTaxEfficiency(assetClass: AssetClass): TaxEfficiency {
  return ASSET_TAX_EFFICIENCY[assetClass];
}

/**
 * Get the recommended account type for an asset class.
 *
 * Uses asset-specific overrides when available, falling back to the
 * general efficiency-based recommendation.
 *
 * @param assetClass - The asset class to place
 * @returns Recommended account tax type
 */
export function getRecommendedPlacement(assetClass: AssetClass): AccountTaxType {
  return (
    ASSET_SPECIFIC_PLACEMENT[assetClass] ?? OPTIMAL_PLACEMENT[ASSET_TAX_EFFICIENCY[assetClass]]
  );
}

/**
 * Calculate the tax-equivalent yield of a tax-exempt investment.
 *
 * Formula: TEY = nominal yield / (1 - marginal rate)
 *
 * @param nominalYield - Tax-exempt yield as decimal (0.03 = 3%)
 * @param marginalRate - Marginal tax rate as decimal (0.22 = 22%)
 * @returns Tax-equivalent yield comparison
 *
 * @example
 * ```ts
 * const tey = calculateTaxEquivalentYield(0.03, 0.32);
 * // tey.taxEquivalentYield ≈ 0.0441 (4.41%)
 * ```
 */
export function calculateTaxEquivalentYield(
  nominalYield: number,
  marginalRate: number,
): TaxEquivalentYield {
  // Guard divide-by-zero: if marginal rate >= 1, TEY is infinite → cap at nominal
  const denominator = 1 - marginalRate;
  const taxEquivalentYield = denominator > 0 ? nominalYield / denominator : nominalYield;

  return {
    nominalYield,
    taxEquivalentYield,
    marginalRate,
    isTaxExemptBetter: taxEquivalentYield > nominalYield,
  };
}

/**
 * Analyze a single asset holding and produce a placement recommendation.
 *
 * @param holding - Current asset holding
 * @param marginalRate - Marginal tax rate as decimal (0.22 = 22%)
 * @returns Placement recommendation
 */
export function analyzeAssetPlacement(holding: AssetHolding, marginalRate: number): AssetPlacement {
  const taxEfficiency = ASSET_TAX_EFFICIENCY[holding.assetClass];
  const recommendedAccountTaxType = getRecommendedPlacement(holding.assetClass);
  const isOptimal = holding.accountTaxType === recommendedAccountTaxType;

  // Estimate annual tax savings from optimal placement.
  // If already optimal, savings = 0.
  // If sub-optimal, savings ≈ annual distributions × marginal rate.
  let estimatedAnnualSavingsCents = 0;
  if (!isOptimal && marginalRate > 0) {
    const annualDistributions = bankersRound(holding.valueCents * holding.annualYield);
    estimatedAnnualSavingsCents = bankersRound(annualDistributions * Math.max(0, marginalRate));
  }

  return {
    assetId: holding.assetId,
    name: holding.name,
    assetClass: holding.assetClass,
    taxEfficiency,
    currentAccountId: holding.accountId,
    currentAccountTaxType: holding.accountTaxType,
    recommendedAccountTaxType,
    isOptimal,
    estimatedAnnualSavingsCents,
    reason: PLACEMENT_REASONS[holding.assetClass],
  };
}

/**
 * Analyze all asset holdings and produce a tax-location optimization summary.
 *
 * @param holdings - All asset holdings across accounts
 * @param marginalRate - Marginal tax rate as decimal
 * @returns Optimization summary with all recommendations
 *
 * @example
 * ```ts
 * const summary = analyzeTaxLocation(holdings, 0.24);
 * console.log(`${summary.suboptimalCount} assets could be better placed`);
 * console.log(`Potential savings: $${summary.totalAnnualSavingsCents / 100}/yr`);
 * ```
 */
export function analyzeTaxLocation(
  holdings: readonly AssetHolding[],
  marginalRate: number,
): TaxLocationSummary {
  const placements = holdings.map((h) => analyzeAssetPlacement(h, marginalRate));
  const optimalCount = placements.filter((p) => p.isOptimal).length;
  const suboptimalCount = placements.length - optimalCount;
  const totalAnnualSavingsCents = placements.reduce(
    (sum, p) => sum + p.estimatedAnnualSavingsCents,
    0,
  );

  return {
    placements,
    optimalCount,
    suboptimalCount,
    totalAnnualSavingsCents,
  };
}

/**
 * Calculate projected tax savings from moving an asset to its optimal placement
 * over multiple years.
 *
 * @param holdingValueCents - Current holding value (cents)
 * @param annualYield - Annual yield as decimal (0.03 = 3%)
 * @param marginalRate - Marginal tax rate as decimal
 * @param years - Projection period in years
 * @returns Total projected savings (cents) over the period
 */
export function projectTaxSavings(
  holdingValueCents: number,
  annualYield: number,
  marginalRate: number,
  years: number,
): number {
  if (years <= 0 || marginalRate <= 0 || annualYield <= 0) return 0;

  let totalSavings = 0;
  let currentValue = holdingValueCents;

  for (let y = 0; y < years; y++) {
    const annualDistributions = bankersRound(currentValue * annualYield);
    const taxSaved = bankersRound(annualDistributions * marginalRate);
    totalSavings += taxSaved;
    // Assume reinvested growth
    currentValue += annualDistributions;
  }

  return totalSavings;
}
