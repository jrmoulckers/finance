// SPDX-License-Identifier: BUSL-1.1

/**
 * Remittance domain types.
 *
 * Models a cross-border money transfer (a "remittance") where a sender pays a
 * provider in a *source* currency and a recipient is paid out in a *destination*
 * currency. The persona behind issue #2170 sends ~$500/month to family in
 * Mexico and needs to see exactly how much was sent, how much was lost to fees
 * and FX margin, the rate the recipient received, and how much actually arrived.
 *
 * Money is always represented in **integer minor units** (e.g. US cents,
 * Mexican centavos) to avoid floating-point precision errors — matching the KMP
 * `Cents` value class mirrored in `kmp/bridge.ts`. FX rates are decimals.
 *
 * References: issue #2170
 */

/**
 * How the provider fee relates to the amount the sender enters.
 *
 * - `ADDITIVE` — the fee is charged *on top* of the send amount. The full send
 *   amount is converted at the FX rate, and the sender pays `sendAmount + fee`.
 *   (Typical of "we charge $5 to send $500; recipient gets $500 converted".)
 * - `INCLUSIVE` — the fee is *deducted from* the send amount before conversion.
 *   The sender pays exactly `sendAmount`, and only `sendAmount - fee` is
 *   converted at the FX rate. (Typical of "send $500 total; $5 fee comes out of
 *   it, $495 is converted".)
 */
export type RemittanceFeeModel = 'ADDITIVE' | 'INCLUSIVE';

/** Recipient details captured alongside a remittance. */
export interface RemittanceRecipient {
  /** Recipient display name (free text, user-entered — never translated). */
  readonly name: string;
  /**
   * Destination country. An ISO 3166-1 alpha-2 code is preferred for display
   * via `Intl.DisplayNames`, but free text is accepted for resilience.
   */
  readonly country: string;
}

/**
 * The inputs required to compute a remittance quote.
 *
 * All monetary fields are integer minor units in the {@link sourceCurrency}.
 */
export interface RemittanceQuoteInput {
  /** Amount the sender enters, in source-currency minor units (must be an integer ≥ 0). */
  readonly sendAmountMinor: number;
  /** Provider fee, in source-currency minor units (must be an integer ≥ 0). */
  readonly feeMinor: number;
  /**
   * Provider FX rate applied to the converted principal:
   * `1 unit of sourceCurrency = fxRate units of destCurrency` (must be > 0).
   */
  readonly fxRate: number;
  /** Whether the fee is added on top of, or taken out of, the send amount. */
  readonly feeModel: RemittanceFeeModel;
  /** ISO 4217 code of the currency the sender pays in (e.g. `"USD"`). */
  readonly sourceCurrency: string;
  /** ISO 4217 code of the currency the recipient is paid in (e.g. `"MXN"`). */
  readonly destCurrency: string;
  /**
   * Optional mid-market / reference rate (`1 source = referenceRate dest`) used
   * to estimate the cost of the provider's FX margin. When omitted, FX-spread
   * and total-cost figures on the resulting quote are `null`. Must be > 0 when
   * provided.
   */
  readonly referenceRate?: number;
}

/**
 * The fully computed result of a remittance.
 *
 * Source-currency amounts (`*Minor` paired with {@link sourceCurrency}):
 * {@link sendAmountMinor}, {@link feeMinor}, {@link principalMinor},
 * {@link totalPaidMinor}, {@link fxSpreadCostMinor}, {@link totalCostMinor}.
 *
 * Destination-currency amounts (paired with {@link destCurrency}):
 * {@link receivedMinor}, {@link midMarketReceivedMinor},
 * {@link shortfallInDestMinor}.
 */
export interface RemittanceQuote {
  readonly sourceCurrency: string;
  readonly destCurrency: string;
  readonly feeModel: RemittanceFeeModel;

  /** Amount entered by the sender (source minor units). */
  readonly sendAmountMinor: number;
  /** Provider fee (source minor units). */
  readonly feeMinor: number;
  /** Portion actually converted at the FX rate (source minor units). */
  readonly principalMinor: number;
  /** Total amount leaving the sender's pocket (source minor units). */
  readonly totalPaidMinor: number;

  /** Provider FX rate applied to the principal (`1 source = appliedRate dest`). */
  readonly appliedRate: number;
  /** Amount the recipient receives (destination minor units). */
  readonly receivedMinor: number;
  /**
   * Effective FX rate the sender actually got, *after* fees:
   * `receivedAmount / totalPaid` expressed as `dest per source`. Always ≤
   * {@link appliedRate} when a fee is charged. `0` when nothing is paid.
   */
  readonly effectiveRate: number;

  /** Reference (mid-market) rate used for cost analysis, or `null`. */
  readonly referenceRate: number | null;
  /**
   * What the recipient would have received if the *total paid* were converted
   * at the reference rate with no fee (destination minor units), or `null`.
   */
  readonly midMarketReceivedMinor: number | null;
  /**
   * How much less the recipient received versus the mid-market baseline
   * (destination minor units), or `null`. Negative means the provider beat the
   * reference rate.
   */
  readonly shortfallInDestMinor: number | null;
  /**
   * Cost attributable to the FX margin alone, expressed in source minor units
   * (`totalCost - fee`), or `null`. Negative means a favourable margin.
   */
  readonly fxSpreadCostMinor: number | null;
  /**
   * Total cost of the transfer — fee plus FX margin — expressed in source minor
   * units, valued at the reference rate, or `null` when no reference rate is
   * supplied.
   */
  readonly totalCostMinor: number | null;
}

/**
 * How often a scheduled/recurring remittance repeats. Mirrors the cadence
 * vocabulary used by the cash-runway forecaster (`ScheduledCashEvent`) so a
 * recurring supplier remittance maps cleanly onto a scheduled outflow (#3265,
 * #3244).
 */
export type RemittanceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

/** Recurrence schedule for a remittance that repeats (e.g. monthly to family). */
export interface RemittanceRecurrence {
  /** How often the remittance repeats. */
  readonly frequency: RemittanceFrequency;
  /** Next scheduled send date (`YYYY-MM-DD`). */
  readonly nextDate: string;
}

/** A persisted remittance entry (one row in the history). */
export interface RemittanceRecord {
  readonly id: string;
  /** Calendar date the money was sent (`YYYY-MM-DD`, never time-zone shifted). */
  readonly date: string;
  readonly sourceCurrency: string;
  readonly destCurrency: string;
  readonly sendAmountMinor: number;
  readonly feeMinor: number;
  readonly fxRate: number;
  readonly feeModel: RemittanceFeeModel;
  readonly referenceRate: number | null;
  readonly recipient: RemittanceRecipient;
  readonly note: string | null;
  /**
   * Recurrence schedule when this remittance repeats, or `null` for a one-off.
   * Recurring remittances are projected as scheduled cash outflows so cash
   * runway reflects upcoming supplier/family transfers (#3265, #3244).
   */
  readonly recurrence: RemittanceRecurrence | null;
  /** ISO-8601 instant the record was created locally. */
  readonly createdAt: string;
}

/** Input accepted when creating a remittance record (id/createdAt are generated). */
export type CreateRemittanceInput = Omit<RemittanceRecord, 'id' | 'createdAt'>;
