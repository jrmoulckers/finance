// SPDX-License-Identifier: BUSL-1.1

/**
 * Centralized currency formatting utilities.
 *
 * All financial number display in the web app MUST use these functions
 * to ensure consistent, locale-aware formatting. This module is the
 * single source of truth for how monetary values appear to users.
 *
 * Conventions:
 *   - Monetary values are stored as **integer cents** (e.g., 123456 = $1,234.56).
 *   - Conversion from cents to major units happens inside these helpers.
 *   - `Intl.NumberFormat` handles locale rules (grouping, decimal, symbol placement).
 *   - Negative amounts render as "-$1,234.56" (sign before symbol), which is the
 *     default `Intl.NumberFormat` behaviour for `en-US` / `currency` style.
 *
 * References: issue #1351
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options accepted by all formatting functions. */
export interface FormatCurrencyOptions {
  /** ISO 4217 currency code (default: `"USD"`). */
  currency?: string;
  /** BCP 47 locale tag (default: `"en-US"`). */
  locale?: string;
  /** Minimum fraction digits (default: `2`). */
  minimumFractionDigits?: number;
  /** Maximum fraction digits (default: `2`). */
  maximumFractionDigits?: number;
}

/** Extended options for `formatCurrency` (cents-based). */
export interface FormatCurrencyFromCentsOptions extends FormatCurrencyOptions {
  /**
   * Controls the `signDisplay` option passed to `Intl.NumberFormat`.
   *
   * - `"auto"` (default) — sign shown only for negative values.
   * - `"exceptZero"` — sign shown for both positive and negative, but not zero.
   * - `"always"` — sign always shown.
   * - `"never"` — sign never shown.
   */
  signDisplay?: 'auto' | 'exceptZero' | 'always' | 'never';
}

// ---------------------------------------------------------------------------
// Core formatting
// ---------------------------------------------------------------------------

/**
 * Format an integer **cents** amount as a locale-aware currency string.
 *
 * This is the primary formatting function and should be used for all
 * user-facing monetary values that originate from the data layer (which
 * stores amounts in cents).
 *
 * @example
 * ```ts
 * formatCurrency(123456);           // "$1,234.56"
 * formatCurrency(-123456);          // "-$1,234.56"
 * formatCurrency(0);                // "$0.00"
 * formatCurrency(123456789);        // "$1,234,567.89"
 * formatCurrency(1234, { currency: 'EUR', locale: 'de-DE' }); // "12,34 €"
 * formatCurrency(500, { signDisplay: 'exceptZero' }); // "+$5.00"
 * ```
 */
export function formatCurrency(
  amountInCents: number,
  options: FormatCurrencyFromCentsOptions = {},
): string {
  const {
    currency = 'USD',
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    signDisplay = 'auto',
  } = options;

  const amountInMajorUnits = amountInCents / 100;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  }).format(amountInMajorUnits);
}

/**
 * Format a **major-unit** (dollars) amount as a locale-aware currency string.
 *
 * Use this for values that are already in dollars (e.g., chart data that has
 * been pre-converted). For values stored as cents, use {@link formatCurrency}
 * instead.
 *
 * @example
 * ```ts
 * formatCurrencyValue(1234.56);  // "$1,234.56"
 * formatCurrencyValue(1234.56, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
 * // "$1,235"
 * ```
 */
export function formatCurrencyValue(
  amountInMajorUnits: number,
  options: FormatCurrencyOptions = {},
): string {
  const {
    currency = 'USD',
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amountInMajorUnits);
}

// ---------------------------------------------------------------------------
// Specialised helpers
// ---------------------------------------------------------------------------

/**
 * Format cents as a gain/loss string with explicit sign ("+$12.34" / "-$12.34").
 *
 * Zero is rendered as "$0.00" (no sign).
 *
 * @example
 * ```ts
 * formatGainLoss(12345);   // "+$123.45"
 * formatGainLoss(-12345);  // "-$123.45"
 * formatGainLoss(0);       // "$0.00"
 * ```
 */
export function formatGainLoss(amountInCents: number, options: FormatCurrencyOptions = {}): string {
  return formatCurrency(amountInCents, {
    ...options,
    signDisplay: 'exceptZero',
  });
}

/**
 * Format cents as an accessible label string.
 *
 * For negative amounts, the word "negative" is prepended and the absolute
 * value is formatted, producing screen-reader-friendly output like
 * "negative $12.34" instead of "-$12.34".
 *
 * @example
 * ```ts
 * formatCurrencyLabel(1234);   // "$12.34"
 * formatCurrencyLabel(-1234);  // "negative $12.34"
 * ```
 */
export function formatCurrencyLabel(
  amountInCents: number,
  options: FormatCurrencyOptions = {},
): string {
  if (amountInCents < 0) {
    return `negative ${formatCurrency(Math.abs(amountInCents), options)}`;
  }
  return formatCurrency(amountInCents, options);
}

/**
 * Format a **major-unit** amount for chart axes / tooltips.
 *
 * Wraps {@link formatCurrencyValue} with compact defaults (0 fraction digits)
 * suitable for chart rendering where space is constrained.
 *
 * This replaces the ad-hoc `formatChartCurrency` that was previously
 * defined in `chart-palette.ts`.
 *
 * @example
 * ```ts
 * formatChartCurrency(1234);          // "$1,234"
 * formatChartCurrency(1234, 'EUR');   // "€1,234"
 * ```
 */
export function formatChartCurrency(
  valueInMajorUnits: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return formatCurrencyValue(valueInMajorUnits, {
    currency,
    locale,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
