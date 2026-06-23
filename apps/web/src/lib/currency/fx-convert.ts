// SPDX-License-Identifier: BUSL-1.1
/**
 * Foreign-currency conversion + persistence math (issue #2202).
 *
 * Split out from {@link ./minor-units} so it can live in the lazily-loaded
 * foreign-currency chunk rather than the widely-imported transaction-form
 * bundle: it is needed only when a user actually logs a foreign-currency spend
 * (statically by the lazy `ForeignCurrencyFields` component for the live
 * preview, and dynamically by `TransactionForm` at submit time).
 *
 * All amounts are signed INTEGER minor units — never floats — so cents are
 * never silently lost.
 */

import { FX_FIELD_KEYS, type FxEntryMetadata } from './minor-units';

/**
 * Round a non-integer value to the nearest integer using "round half away from
 * zero", applied to the magnitude so negative amounts round symmetrically.
 *
 * `Math.round` alone rounds half toward +Infinity (`Math.round(-0.5) === -0`),
 * which would lose a cent asymmetrically for refunds/expenses. Splitting the
 * sign keeps debits and credits consistent.
 */
export function roundToInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/** Inputs for {@link convertToBaseMinorUnits}. */
export interface ConvertToBaseInput {
  /** Signed integer amount in the ORIGINAL (foreign) currency's minor units. */
  readonly originalMinorUnits: number;
  /** Decimal places of the ORIGINAL (foreign) currency. */
  readonly originalDecimals: number;
  /** Decimal places of the BASE (account) currency. */
  readonly baseDecimals: number;
  /**
   * Exchange rate expressed as BASE units per 1 ORIGINAL unit
   * (i.e. `1 foreign = rate base`). For THB->USD this is ~`0.0288`.
   */
  readonly rate: number;
}

/**
 * Convert an integer foreign-currency amount into integer BASE-currency minor
 * units using the supplied exchange rate, with correct cross-precision scaling
 * and sign-safe rounding.
 *
 * The math, derived to stay in integer space as long as possible:
 *
 *   baseMinor = round( originalMinor * rate * 10^(baseDecimals - originalDecimals) )
 *
 * Returns `0` when the rate is not a positive finite number.
 */
export function convertToBaseMinorUnits(input: ConvertToBaseInput): number {
  const { originalMinorUnits, originalDecimals, baseDecimals, rate } = input;

  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(originalMinorUnits)) {
    return 0;
  }

  const scale = 10 ** (baseDecimals - originalDecimals);
  return roundToInteger(originalMinorUnits * rate * scale);
}

/** Build the `customFields` fragment that persists foreign-currency entry. */
export function buildFxCustomFields(metadata: FxEntryMetadata): Record<string, string> {
  const fields: Record<string, string> = {
    [FX_FIELD_KEYS.originalAmountMinor]: String(metadata.originalAmountMinor),
    [FX_FIELD_KEYS.originalCurrency]: metadata.originalCurrency,
    [FX_FIELD_KEYS.rate]: metadata.rate,
    [FX_FIELD_KEYS.baseCurrency]: metadata.baseCurrency,
  };
  if (metadata.rateTimestamp) {
    fields[FX_FIELD_KEYS.rateTimestamp] = metadata.rateTimestamp;
  }
  return fields;
}
