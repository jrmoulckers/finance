// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure, integer-safe minor-unit math for foreign-currency transaction entry.
 *
 * A digital nomad paid in USD but spending abroad needs to log the ACTUAL
 * local-currency amount (e.g. THB, MXN, JPY) together with the exchange rate
 * they were charged, and still see the base-currency (USD) impact on the
 * account balance.
 *
 * Money is ALWAYS represented as INTEGER minor units (the smallest indivisible
 * unit of the currency) — never as floating-point major units. The number of
 * minor units per major unit differs per currency:
 *
 *   - 0-decimal currencies (JPY, KRW, VND, …): 1 major unit  = 1 minor unit
 *   - 2-decimal currencies (USD, EUR, THB, MXN, …): 1 major unit = 100 minor units
 *   - 3-decimal currencies (KWD, BHD, OMR, …): 1 major unit = 1000 minor units
 *
 * All functions here are pure and deterministic so they can be unit-tested in
 * isolation and reused by the transaction form without pulling in React or any
 * heavy currency dataset.
 *
 * References: issue #2202 (web slice). Native iOS create flow + shared models
 * remain owned elsewhere.
 */

// ---------------------------------------------------------------------------
// Per-currency minor units (decimal places)
// ---------------------------------------------------------------------------

/** Default decimal places when a currency is unknown to the explicit table. */
const DEFAULT_DECIMAL_PLACES = 2;

/**
 * Explicit ISO 4217 minor-unit table for the currencies surfaced in the
 * transaction entry picker. Curated for common digital-nomad destinations and
 * deliberately small so it can be imported directly (no lazy chunk needed).
 *
 * Only the non-default (0- and 3-decimal) currencies are listed explicitly;
 * everything else resolves to the runtime `Intl` precision (2 for almost all
 * currencies), which keeps this table — and the route-ledger bundle — lean.
 */
const CURRENCY_DECIMALS: Readonly<Record<string, number>> = {
  // 0-decimal (no minor unit in everyday use)
  JPY: 0,
  KRW: 0,
  VND: 0,
  IDR: 0,
  CLP: 0,
  // 3-decimal (Gulf dinars)
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
};

/** Normalize an arbitrary input into a 3-letter uppercase code, or `null`. */
export function normalizeCurrencyCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

/**
 * Number of decimal places (minor units exponent) for a currency.
 *
 * Falls back to the runtime `Intl` data for unknown-but-valid codes, then to a
 * safe default of 2 so the function never throws.
 */
export function getCurrencyDecimals(code: string | null | undefined): number {
  const normalized = normalizeCurrencyCode(code);
  if (!normalized) return DEFAULT_DECIMAL_PLACES;

  const known = CURRENCY_DECIMALS[normalized];
  if (known !== undefined) return known;

  try {
    return (
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: normalized,
      }).resolvedOptions().maximumFractionDigits ?? DEFAULT_DECIMAL_PLACES
    );
  } catch {
    return DEFAULT_DECIMAL_PLACES;
  }
}

/** Minor units per major unit (e.g. 100 for USD, 1 for JPY, 1000 for KWD). */
export function minorUnitFactor(code: string | null | undefined): number {
  return 10 ** getCurrencyDecimals(code);
}

// ---------------------------------------------------------------------------
// Parsing / formatting
// ---------------------------------------------------------------------------

/**
 * Parse a free-text amount (e.g. `"1,234.5"`, `"1000"`) into signed INTEGER
 * minor units for the given currency. Returns `null` when the input contains
 * no digits.
 *
 * Extra fractional digits beyond the currency's precision are truncated (not
 * rounded) so the parsed value reflects exactly what the user can express in
 * that currency.
 */
export function parseAmountToMinorUnits(
  input: string,
  code: string | null | undefined,
): number | null {
  const decimals = getCurrencyDecimals(code);
  const normalized = input.replace(/\u2212/g, '-').trim();
  const negative = normalized.startsWith('-');
  const digits = normalized.replace(/[^0-9.]/g, '');
  if (!digits) return null;

  const [wholeRaw = '0', fractionRaw = ''] = digits.split('.', 2);
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';

  let magnitude: number;
  if (decimals === 0) {
    magnitude = Number.parseInt(whole, 10) || 0;
  } else {
    const fraction = fractionRaw.slice(0, decimals).padEnd(decimals, '0');
    magnitude = Number.parseInt(`${whole}${fraction}`, 10);
    if (Number.isNaN(magnitude)) magnitude = 0;
  }

  return negative ? -magnitude : magnitude;
}

/**
 * Convert signed INTEGER minor units back to a plain major-unit number
 * (e.g. `123456` USD minor units -> `1234.56`). Intended for math/serialization,
 * not user display — use the locale-aware formatters for that.
 */
export function minorUnitsToMajorNumber(
  minorUnits: number,
  code: string | null | undefined,
): number {
  return minorUnits / minorUnitFactor(code);
}

// ---------------------------------------------------------------------------
// Persisted FX metadata (web `customFields` round-trip)
// ---------------------------------------------------------------------------

/**
 * Reserved `customFields` keys used to persist the foreign-currency entry
 * details alongside a transaction in the web store's flexible `customFields`
 * bag (no SQLDelight schema change required), mirroring how local-timestamp and
 * BNPL metadata are stored. Kept stable so create -> persist -> edit agree.
 */
export const FX_FIELD_KEYS = {
  /** Signed integer original amount, in the original currency's minor units. */
  originalAmountMinor: 'fxAmtMinor',
  /** ISO 4217 code of the original (foreign) currency. */
  originalCurrency: 'fxCcy',
  /** Exchange rate used: base units per 1 original unit. */
  rate: 'fxRate',
  /** ISO-8601 timestamp the rate was captured. */
  rateTimestamp: 'fxRateTs',
  /** ISO 4217 code of the base (account) currency the amount was converted to. */
  baseCurrency: 'fxBaseCcy',
} as const;

const FX_FIELD_KEY_SET = new Set<string>(Object.values(FX_FIELD_KEYS));

/** Whether a `customFields` key is one of the reserved FX-entry keys. */
export function isFxFieldKey(key: string): boolean {
  return FX_FIELD_KEY_SET.has(key);
}

/** Parsed foreign-currency entry metadata read back from `customFields`. */
export interface FxEntryMetadata {
  readonly originalAmountMinor: number;
  readonly originalCurrency: string;
  readonly rate: string;
  readonly rateTimestamp: string | null;
  readonly baseCurrency: string;
}

/**
 * Read foreign-currency entry metadata from a transaction's `customFields`,
 * or `null` when absent/invalid. Never throws.
 */
export function readFxMetadata(
  customFields: Record<string, string> | null | undefined,
): FxEntryMetadata | null {
  if (!customFields) return null;

  const originalCurrency = normalizeCurrencyCode(customFields[FX_FIELD_KEYS.originalCurrency]);
  const rawAmount = customFields[FX_FIELD_KEYS.originalAmountMinor];
  const rate = customFields[FX_FIELD_KEYS.rate];
  if (!originalCurrency || rawAmount === undefined || rate === undefined) {
    return null;
  }

  const originalAmountMinor = Number.parseInt(rawAmount, 10);
  if (!Number.isFinite(originalAmountMinor)) return null;

  const baseCurrency = normalizeCurrencyCode(customFields[FX_FIELD_KEYS.baseCurrency]) ?? 'USD';

  return {
    originalAmountMinor,
    originalCurrency,
    rate,
    rateTimestamp: customFields[FX_FIELD_KEYS.rateTimestamp] ?? null,
    baseCurrency,
  };
}
