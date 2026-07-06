// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared savings-rate percentage math and formatting.
 *
 * The savings rate is surfaced on the dashboard card, the `/insights` summary,
 * and the weekly/monthly digest. Each surface used to round it differently
 * (whole percent, one decimal, two decimals), so the same period could read as
 * `55%`, `54.7%`, and `54.72%`. Every surface now rounds through the single
 * convention defined here.
 */

/** Canonical display precision for savings-rate percentages, app-wide. */
export const SAVINGS_RATE_DECIMAL_PLACES = 1;

const SAVINGS_RATE_ROUNDING_FACTOR = 10 ** SAVINGS_RATE_DECIMAL_PLACES;

/**
 * Round a savings-rate percentage to the shared app-wide precision.
 *
 * @param value - A percentage value (e.g. `54.72`)
 * @returns The value rounded to {@link SAVINGS_RATE_DECIMAL_PLACES} (e.g. `54.7`)
 */
export function roundSavingsRatePercent(value: number): number {
  return Math.round(value * SAVINGS_RATE_ROUNDING_FACTOR) / SAVINGS_RATE_ROUNDING_FACTOR;
}

/**
 * Compute a savings-rate percentage from income and spend, rounded to the
 * shared app-wide precision.
 *
 * Works with any consistent unit (integer cents or major units) since it is a
 * ratio. Returns `0` when there is no income (division guarded upstream).
 *
 * @param income - Total income for the period (income and spend in the same unit)
 * @param spending - Total spending for the period
 * @returns Savings rate as a percentage rounded to {@link SAVINGS_RATE_DECIMAL_PLACES}
 */
export function computeSavingsRatePercent(income: number, spending: number): number {
  if (income <= 0) {
    return 0;
  }
  return roundSavingsRatePercent(((income - spending) / income) * 100);
}
