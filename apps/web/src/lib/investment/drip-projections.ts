// SPDX-License-Identifier: BUSL-1.1

/**
 * DRIP (Dividend Reinvestment Plan) simulator and yield-on-cost calculator.
 *
 * Projects dividend reinvestment outcomes over N years, accounting for
 * dividend growth, share price appreciation, and compound reinvestment.
 *
 * All monetary values are integer cents.
 *
 * References: issue #1639
 */

import { bankersRound } from './rebalancing';
import type { DRIPInput, DRIPProjection, DRIPYearResult } from './types';

// ---------------------------------------------------------------------------
// Yield-on-cost
// ---------------------------------------------------------------------------

/**
 * Calculate yield on cost for a position.
 *
 * Yield on cost = (current annual dividend per share / original cost per share) × 100.
 *
 * @param currentAnnualDividendPerShareCents - Current annual dividend per share in cents.
 * @param originalCostPerShareCents - Original purchase price per share in cents.
 * @returns Yield on cost as a percentage, or 0 if cost is 0.
 */
export function calculateYieldOnCost(
  currentAnnualDividendPerShareCents: number,
  originalCostPerShareCents: number,
): number {
  if (originalCostPerShareCents <= 0) return 0;
  return Math.round((currentAnnualDividendPerShareCents / originalCostPerShareCents) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// DRIP simulation
// ---------------------------------------------------------------------------

/**
 * Simulate DRIP reinvestment over N years.
 *
 * Each year:
 * 1. Calculate total dividend income (shares × dividend per share).
 * 2. Reinvest dividends at current share price to acquire new shares.
 * 3. Grow dividend per share by the dividend growth rate.
 * 4. Grow share price by the price appreciation rate.
 *
 * @param input - DRIP simulation parameters.
 * @returns Complete projection with year-by-year results.
 */
export function simulateDRIP(input: DRIPInput): DRIPProjection {
  const {
    initialShares,
    sharePriceCents,
    annualDividendPerShareCents,
    dividendGrowthRatePercent,
    priceAppreciationPercent,
    years,
  } = input;

  if (years <= 0 || initialShares <= 0 || sharePriceCents <= 0) {
    return {
      input,
      yearResults: [],
      finalValueCents: bankersRound(initialShares * sharePriceCents),
      totalDividendsCents: 0,
      finalYieldOnCostPercent: 0,
      finalShares: initialShares,
    };
  }

  const yearResults: DRIPYearResult[] = [];
  let currentShares = initialShares;
  let currentPrice = sharePriceCents;
  let currentDividendPerShare = annualDividendPerShareCents;
  let cumulativeDividends = 0;
  const originalCostBasis = sharePriceCents; // Original price for YOC

  for (let year = 1; year <= years; year++) {
    // Calculate dividend income
    const totalDividendCents = bankersRound(currentShares * currentDividendPerShare);
    cumulativeDividends += totalDividendCents;

    // Reinvest dividends at current price
    const newShares = currentPrice > 0 ? totalDividendCents / currentPrice : 0;
    currentShares += newShares;

    // Calculate yield on cost
    const yieldOnCostPercent = calculateYieldOnCost(currentDividendPerShare, originalCostBasis);

    // Portfolio value
    const portfolioValueCents = bankersRound(currentShares * currentPrice);

    yearResults.push({
      year,
      totalShares: Math.round(currentShares * 10000) / 10000, // 4 decimal places
      sharePriceCents: bankersRound(currentPrice),
      dividendPerShareCents: bankersRound(currentDividendPerShare),
      totalDividendCents,
      newSharesFromDrip: Math.round(newShares * 10000) / 10000,
      portfolioValueCents,
      yieldOnCostPercent,
      cumulativeDividendsCents: cumulativeDividends,
    });

    // Grow dividend and price for next year
    currentDividendPerShare *= 1 + dividendGrowthRatePercent / 100;
    currentPrice *= 1 + priceAppreciationPercent / 100;
  }

  const lastYear = yearResults[yearResults.length - 1];

  return {
    input,
    yearResults,
    finalValueCents: lastYear.portfolioValueCents,
    totalDividendsCents: cumulativeDividends,
    finalYieldOnCostPercent: lastYear.yieldOnCostPercent,
    finalShares: lastYear.totalShares,
  };
}

// ---------------------------------------------------------------------------
// Passive income projection
// ---------------------------------------------------------------------------

/**
 * Project passive income growth from dividends over N years.
 *
 * Returns the annual dividend income for each year, accounting for
 * dividend growth and optional DRIP reinvestment.
 *
 * @param initialShares - Starting number of shares.
 * @param annualDividendPerShareCents - Current annual dividend per share in cents.
 * @param dividendGrowthRatePercent - Annual dividend growth rate (percentage).
 * @param sharePriceCents - Current share price in cents (used for DRIP).
 * @param priceAppreciationPercent - Annual share price growth (percentage).
 * @param years - Number of years to project.
 * @param enableDrip - Whether to reinvest dividends (default true).
 * @returns Array of annual income amounts in cents.
 */
export function projectPassiveIncome(
  initialShares: number,
  annualDividendPerShareCents: number,
  dividendGrowthRatePercent: number,
  sharePriceCents: number,
  priceAppreciationPercent: number,
  years: number,
  enableDrip: boolean = true,
): readonly number[] {
  if (!enableDrip) {
    // No reinvestment — just dividend growth on fixed share count
    const incomes: number[] = [];
    let currentDividend = annualDividendPerShareCents;
    for (let y = 0; y < years; y++) {
      incomes.push(bankersRound(initialShares * currentDividend));
      currentDividend *= 1 + dividendGrowthRatePercent / 100;
    }
    return incomes;
  }

  // With DRIP
  const result = simulateDRIP({
    initialShares,
    sharePriceCents,
    annualDividendPerShareCents,
    dividendGrowthRatePercent,
    priceAppreciationPercent,
    years,
  });

  return result.yearResults.map((yr) => yr.totalDividendCents);
}
