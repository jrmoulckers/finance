// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure remittance FX / fee math.
 *
 * Every function here is deterministic and side-effect free so it can be unit
 * tested in isolation and shared between the entry form (live preview) and the
 * saved history/summary. No I/O, no Date.now(), no locale lookups.
 *
 * ── Money & rounding contract ───────────────────────────────────────────────
 *   • All monetary values are **integer minor units** (cents/centavos). Inputs
 *     `sendAmountMinor` and `feeMinor` MUST be integers; FX rates are decimals.
 *   • Currency → minor-unit precision comes from CLDR via
 *     `getCurrencyFractionDigits` (e.g. USD/MXN = 2, JPY/KRW = 0).
 *   • Conversion between currencies:
 *         destMinor = roundHalfUp(sourceMinor × rate × 10^(destDigits − srcDigits))
 *   • {@link roundHalfUp} uses JavaScript `Math.round` semantics — ties round
 *     **up toward +∞** (e.g. 0.5 → 1, 2.5 → 3). Because every monetary input is
 *     non-negative, this is a plain round-half-up. Each derived amount is
 *     rounded **exactly once** to its own currency's minor unit; intermediate
 *     results are kept in full precision so rounding never compounds.
 *
 * References: issue #2170
 */

import { getCurrencyFractionDigits } from '../currency-metadata';
import type { RemittanceQuote, RemittanceQuoteInput } from './remittance-types';

// ---------------------------------------------------------------------------
// Rounding & conversion primitives
// ---------------------------------------------------------------------------

/**
 * Round to the nearest integer, ties going up toward +∞ (`Math.round`).
 *
 * Documented and centralised so the rounding rule is auditable in one place.
 */
export function roundHalfUp(value: number): number {
  return Math.round(value);
}

/**
 * Convert an integer minor-unit amount from one currency to another.
 *
 * @param amountMinor      Source amount in integer minor units.
 * @param rate             `1 source major unit = rate dest major units`.
 * @param sourceFractionDigits Minor-unit digits of the source currency.
 * @param destFractionDigits   Minor-unit digits of the destination currency.
 * @returns The converted amount in destination minor units (rounded once).
 */
export function convertMinorUnits(
  amountMinor: number,
  rate: number,
  sourceFractionDigits: number,
  destFractionDigits: number,
): number {
  const scaled = amountMinor * rate * 10 ** (destFractionDigits - sourceFractionDigits);
  return roundHalfUp(scaled);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer number of minor units (got ${value}).`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (value < 0) {
    throw new RangeError(`${label} must not be negative (got ${value}).`);
  }
}

function assertPositiveRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite rate greater than zero (got ${value}).`);
  }
}

// ---------------------------------------------------------------------------
// Core quote
// ---------------------------------------------------------------------------

/**
 * Compute a complete {@link RemittanceQuote} from sender inputs.
 *
 * Behaviour:
 *   • `ADDITIVE`  → principal = sendAmount; totalPaid = sendAmount + fee.
 *   • `INCLUSIVE` → principal = max(0, sendAmount − fee); totalPaid = sendAmount.
 *   • The recipient receives `principal` converted at {@link RemittanceQuoteInput.fxRate}.
 *   • When a {@link RemittanceQuoteInput.referenceRate} is supplied, the FX
 *     margin and total cost are derived from the mid-market baseline (see
 *     module-level rounding contract).
 *
 * @throws RangeError if amounts are non-integer/negative or any rate ≤ 0.
 */
export function quoteRemittance(input: RemittanceQuoteInput): RemittanceQuote {
  const {
    sendAmountMinor,
    feeMinor,
    fxRate,
    feeModel,
    sourceCurrency,
    destCurrency,
    referenceRate,
  } = input;

  assertInteger(sendAmountMinor, 'sendAmountMinor');
  assertInteger(feeMinor, 'feeMinor');
  assertNonNegative(sendAmountMinor, 'sendAmountMinor');
  assertNonNegative(feeMinor, 'feeMinor');
  assertPositiveRate(fxRate, 'fxRate');
  if (referenceRate !== undefined) {
    assertPositiveRate(referenceRate, 'referenceRate');
  }

  const sourceDigits = getCurrencyFractionDigits(sourceCurrency);
  const destDigits = getCurrencyFractionDigits(destCurrency);

  // Split the fee out of, or add it on top of, the send amount.
  const principalMinor =
    feeModel === 'INCLUSIVE' ? Math.max(0, sendAmountMinor - feeMinor) : sendAmountMinor;
  const totalPaidMinor = feeModel === 'INCLUSIVE' ? sendAmountMinor : sendAmountMinor + feeMinor;

  // What the recipient gets: principal converted at the provider's rate.
  const receivedMinor = convertMinorUnits(principalMinor, fxRate, sourceDigits, destDigits);

  // Effective rate the sender actually achieved, after fees: dest per source.
  const totalPaidMajor = totalPaidMinor / 10 ** sourceDigits;
  const receivedMajor = receivedMinor / 10 ** destDigits;
  const effectiveRate = totalPaidMajor > 0 ? receivedMajor / totalPaidMajor : 0;

  // Cost analysis against the mid-market reference, when provided.
  let midMarketReceivedMinor: number | null = null;
  let shortfallInDestMinor: number | null = null;
  let totalCostMinor: number | null = null;
  let fxSpreadCostMinor: number | null = null;

  if (referenceRate !== undefined) {
    // What the recipient would receive if the WHOLE amount paid were converted
    // at mid-market with no fee — the fair-value baseline.
    midMarketReceivedMinor = convertMinorUnits(
      totalPaidMinor,
      referenceRate,
      sourceDigits,
      destDigits,
    );
    shortfallInDestMinor = midMarketReceivedMinor - receivedMinor;
    // Value that shortfall back in the source currency at the reference rate.
    totalCostMinor = convertMinorUnits(
      shortfallInDestMinor,
      1 / referenceRate,
      destDigits,
      sourceDigits,
    );
    // The portion of the cost that is NOT the explicit fee is the FX margin.
    fxSpreadCostMinor = totalCostMinor - feeMinor;
  }

  return {
    sourceCurrency,
    destCurrency,
    feeModel,
    sendAmountMinor,
    feeMinor,
    principalMinor,
    totalPaidMinor,
    appliedRate: fxRate,
    receivedMinor,
    effectiveRate,
    referenceRate: referenceRate ?? null,
    midMarketReceivedMinor,
    shortfallInDestMinor,
    fxSpreadCostMinor,
    totalCostMinor,
  };
}

// ---------------------------------------------------------------------------
// Focused helpers (thin wrappers over quoteRemittance)
// ---------------------------------------------------------------------------

/**
 * The amount the recipient receives, in destination minor units.
 */
export function amountReceivedMinor(input: RemittanceQuoteInput): number {
  return quoteRemittance(input).receivedMinor;
}

/**
 * The effective FX rate after fees (`dest per source`), or `0` when nothing is
 * paid. Always ≤ the quoted `fxRate` whenever a fee is charged.
 */
export function effectiveFxRate(input: RemittanceQuoteInput): number {
  return quoteRemittance(input).effectiveRate;
}

/**
 * Total cost of the transfer (fee + FX margin) in source minor units, valued at
 * the reference rate. Returns `null` when no `referenceRate` is supplied.
 */
export function totalCostMinor(input: RemittanceQuoteInput): number | null {
  return quoteRemittance(input).totalCostMinor;
}
