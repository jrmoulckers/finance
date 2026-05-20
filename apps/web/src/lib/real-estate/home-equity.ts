// SPDX-License-Identifier: BUSL-1.1

/**
 * Property value tracking and home equity calculation engine.
 *
 * Computes equity, LTV ratio, equity growth over time, and
 * annual appreciation rates.
 *
 * All monetary values are integer cents. Percentages are 0–100.
 *
 * References: issue #1678
 */

import type { EquitySnapshot, HomeEquity, MortgageDetails, Property } from './types';

// ---------------------------------------------------------------------------
// Banker's rounding helper
// ---------------------------------------------------------------------------

/**
 * Round a number using banker's rounding (round half to even).
 *
 * When the fractional part is exactly 0.5, rounds to the nearest even integer.
 *
 * @param value - The number to round.
 * @returns The rounded integer.
 */
export function bankersRound(value: number): number {
  const floor = Math.floor(value);
  const decimal = value - floor;

  // Not exactly 0.5 — use normal rounding
  if (Math.abs(decimal - 0.5) > 1e-9) {
    return Math.round(value);
  }

  // Exactly 0.5 — round to even
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Core equity calculation
// ---------------------------------------------------------------------------

/**
 * Calculate home equity from property value and mortgage balance.
 *
 * @param propertyValueCents - Current property market value in cents.
 * @param mortgageBalanceCents - Current outstanding mortgage balance in cents.
 * @returns Home equity details including LTV and equity percentages.
 */
export function calculateHomeEquity(
  propertyValueCents: number,
  mortgageBalanceCents: number,
): HomeEquity {
  const equityCents = propertyValueCents - mortgageBalanceCents;

  const ltvPercent =
    propertyValueCents > 0
      ? Math.round((mortgageBalanceCents / propertyValueCents) * 10000) / 100
      : 0;

  const equityPercent =
    propertyValueCents > 0 ? Math.round((equityCents / propertyValueCents) * 10000) / 100 : 0;

  return {
    propertyValueCents,
    mortgageBalanceCents,
    equityCents,
    ltvPercent,
    equityPercent,
  };
}

/**
 * Calculate home equity from a Property and MortgageDetails.
 *
 * Convenience wrapper around {@link calculateHomeEquity}.
 *
 * @param property - The property with current valuation.
 * @param mortgage - The mortgage details with current balance.
 * @returns Home equity details.
 */
export function calculateHomeEquityFromProperty(
  property: Property,
  mortgage: MortgageDetails,
): HomeEquity {
  return calculateHomeEquity(property.currentValueCents, mortgage.currentBalanceCents);
}

// ---------------------------------------------------------------------------
// Appreciation rate
// ---------------------------------------------------------------------------

/**
 * Calculate annualized appreciation rate between two values over a period.
 *
 * Uses the compound annual growth rate (CAGR) formula:
 *   rate = (endValue / startValue)^(1/years) - 1
 *
 * @param startValueCents - Starting value in cents.
 * @param endValueCents - Ending value in cents.
 * @param years - Number of years between the two values.
 * @returns Annualized appreciation rate as a percentage (e.g., 5.25 for 5.25%).
 */
export function calculateAppreciationRate(
  startValueCents: number,
  endValueCents: number,
  years: number,
): number {
  if (startValueCents <= 0 || years <= 0) {
    return 0;
  }

  const ratio = endValueCents / startValueCents;
  const cagr = Math.pow(ratio, 1 / years) - 1;

  return Math.round(cagr * 10000) / 100;
}

/**
 * Calculate appreciation rate for a property based on purchase and current value.
 *
 * @param property - Property with purchase price, purchase date, and current value.
 * @returns Annualized appreciation rate as a percentage.
 */
export function calculatePropertyAppreciation(property: Property): number {
  const purchaseDate = new Date(property.purchaseDate + 'T00:00:00Z');
  const valuationDate = new Date(property.valuationDate + 'T00:00:00Z');
  const diffMs = valuationDate.getTime() - purchaseDate.getTime();
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);

  return calculateAppreciationRate(property.purchasePriceCents, property.currentValueCents, years);
}

// ---------------------------------------------------------------------------
// Equity growth over time
// ---------------------------------------------------------------------------

/**
 * Project equity growth over time given mortgage amortization and property appreciation.
 *
 * Generates monthly snapshots showing how equity builds through both
 * principal pay-down and property appreciation.
 *
 * @param propertyValueCents - Current property value in cents.
 * @param mortgageBalanceCents - Current mortgage balance in cents.
 * @param monthlyPaymentCents - Monthly mortgage payment (P&I) in cents.
 * @param annualRateBps - Annual mortgage interest rate in basis points.
 * @param annualAppreciationPercent - Expected annual property appreciation as a percentage.
 * @param months - Number of months to project.
 * @returns Array of monthly equity snapshots.
 */
export function projectEquityGrowth(
  propertyValueCents: number,
  mortgageBalanceCents: number,
  monthlyPaymentCents: number,
  annualRateBps: number,
  annualAppreciationPercent: number,
  months: number,
): readonly EquitySnapshot[] {
  const snapshots: EquitySnapshot[] = [];
  const monthlyRate = annualRateBps / 10000 / 12;
  const monthlyAppreciation = Math.pow(1 + annualAppreciationPercent / 100, 1 / 12);

  let balance = mortgageBalanceCents;
  let value = propertyValueCents;

  // Initial snapshot
  snapshots.push({
    month: 0,
    propertyValueCents: value,
    mortgageBalanceCents: balance,
    equityCents: value - balance,
  });

  for (let m = 1; m <= months; m++) {
    // Calculate interest and principal for this month
    const interestCents = bankersRound(balance * monthlyRate);
    const principalCents = Math.min(monthlyPaymentCents - interestCents, balance);

    // Update balance (don't go below zero)
    balance = Math.max(0, balance - principalCents);

    // Apply appreciation
    value = bankersRound(value * monthlyAppreciation);

    snapshots.push({
      month: m,
      propertyValueCents: value,
      mortgageBalanceCents: balance,
      equityCents: value - balance,
    });
  }

  return snapshots;
}
