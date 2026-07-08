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

import { getCurrentLocale, translate } from './i18n';
import { getCurrencyFractionDigits, minorUnitFactor } from './currency-metadata';
import { formatAmount, MaskingMode } from './ui/privacy';

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
    locale = getCurrentLocale(),
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay = 'auto',
  } = options;

  return formatAmount(amountInCents, MaskingMode.Visible, locale, {
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  });
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
    locale = getCurrentLocale(),
    minimumFractionDigits,
    maximumFractionDigits,
  } = options;

  return formatAmount(
    Math.round(amountInMajorUnits * minorUnitFactor(currency)),
    MaskingMode.Visible,
    locale,
    {
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    },
  );
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
    return translate(
      'a11y.currency.negative',
      { amount: formatCurrency(Math.abs(amountInCents), options) },
      options.locale,
    ).text;
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
  locale = getCurrentLocale(),
  mode: MaskingMode = MaskingMode.Visible,
): string {
  return formatAmount(Math.round(valueInMajorUnits * minorUnitFactor(currency)), mode, locale, {
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ---------------------------------------------------------------------------
// Parsing & rounding (major units → integer minor units)
// ---------------------------------------------------------------------------
//
// These are the canonical helpers for turning user-entered *major-unit* amounts
// (e.g. "123213.00002") into the integer **cents** the data layer stores. All
// monetary inputs MUST route through these instead of sprinkling ad-hoc
// `Math.round(parseFloat(x) * 100)`, which hardcodes a 2-decimal minor unit and
// silently keeps sub-cent precision on screen.
//
// Rounding uses `Math.round` (round-half-up), matching the established web
// convention already used by `formatCurrencyValue` / `formatChartCurrency`, so
// no new rounding rule is introduced. Precision is derived per-currency from
// `currency-metadata`, so JPY (0 decimals) and BHD (3 decimals) are handled
// correctly rather than assuming pennies.

/** Strip currency symbols, grouping separators, and whitespace from a raw input. */
function stripAmountFormatting(input: string): string {
  return input.replace(/[$£€¥]/g, '').replace(/[,\s]/g, '');
}

/**
 * Round a **major-unit** amount to the currency's minor unit and return the
 * result as **integer minor units** (cents).
 *
 * @example
 * ```ts
 * dollarsToCents(123213.00002);          // 12321300
 * dollarsToCents(12.345);                // 1235  (rounds half up)
 * dollarsToCents(-1.5);                  // -150
 * dollarsToCents(500, 'JPY');            // 500   (0-decimal currency)
 * dollarsToCents(1.234, 'BHD');          // 1234  (3-decimal currency)
 * ```
 */
export function dollarsToCents(amountInMajorUnits: number, currency = 'USD'): number {
  if (!Number.isFinite(amountInMajorUnits)) return 0;
  const cents = Math.round(amountInMajorUnits * minorUnitFactor(currency));
  // Normalize `-0` (e.g. Math.round(-0.4)) to `0` so stored cents are canonical.
  return cents === 0 ? 0 : cents;
}

/**
 * Parse a user-entered **major-unit** value into **integer minor units** (cents),
 * rounded to the currency's precision.
 *
 * Accepts either a number or a string that may contain a currency symbol,
 * grouping separators, and surrounding whitespace. Returns `null` when the
 * input is empty or not a valid number, so callers can distinguish "no value"
 * from a genuine zero.
 *
 * @example
 * ```ts
 * parseAmountToCents('123213.00002'); // 12321300
 * parseAmountToCents('$1,234.56');    // 123456
 * parseAmountToCents('');             // null
 * parseAmountToCents('abc');          // null
 * ```
 */
export function parseAmountToCents(input: string | number, currency = 'USD'): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? dollarsToCents(input, currency) : null;
  }

  const normalized = stripAmountFormatting(input).replace(/−/g, '-');
  if (normalized === '' || normalized === '.' || normalized === '-' || normalized === '+') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? dollarsToCents(parsed, currency) : null;
}

/**
 * Round a **major-unit** amount to the currency's minor-unit precision, keeping
 * the result in **major units**. Useful for constraining values that must stay
 * in dollars (e.g. chart inputs) rather than being stored as cents.
 *
 * @example
 * ```ts
 * roundToCurrencyPrecision(123213.00002); // 123213
 * roundToCurrencyPrecision(1.005);        // 1.01
 * roundToCurrencyPrecision(500.6, 'JPY'); // 501
 * ```
 */
export function roundToCurrencyPrecision(amountInMajorUnits: number, currency = 'USD'): number {
  if (!Number.isFinite(amountInMajorUnits)) return 0;
  const factor = minorUnitFactor(currency);
  const rounded = Math.round(amountInMajorUnits * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Normalize a raw amount-input string to a fixed-decimal **major-unit** string
 * suitable for writing back into a text/number field on blur.
 *
 * Returns `''` for empty or invalid input so the field can simply be cleared.
 *
 * @example
 * ```ts
 * normalizeAmountInputValue('123213.00002'); // "123213.00"
 * normalizeAmountInputValue('5');            // "5.00"
 * normalizeAmountInputValue('500.9', 'JPY'); // "501"
 * normalizeAmountInputValue('');             // ""
 * ```
 */
export function normalizeAmountInputValue(input: string, currency = 'USD'): string {
  const cents = parseAmountToCents(input, currency);
  if (cents === null) return '';
  const digits = getCurrencyFractionDigits(currency);
  return (cents / minorUnitFactor(currency)).toFixed(digits);
}

/**
 * The HTML `step` attribute value representing one minor unit of the currency,
 * so native number inputs constrain entry to whole cents.
 *
 * @example
 * ```ts
 * minorUnitStep();      // "0.01" (USD)
 * minorUnitStep('JPY'); // "1"
 * minorUnitStep('BHD'); // "0.001"
 * ```
 */
export function minorUnitStep(currency = 'USD'): string {
  const digits = getCurrencyFractionDigits(currency);
  return digits === 0 ? '1' : `0.${'0'.repeat(digits - 1)}1`;
}
