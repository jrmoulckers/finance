// SPDX-License-Identifier: BUSL-1.1

/**
 * Type definitions for the trip / country budget engine.
 *
 * These model a "trip envelope" — a budget scoped to a named destination and a
 * start/end date window (e.g. "Bangkok Jan–Mar") — for digital-nomad style
 * budgeting where spending happens in a local currency but must roll up into a
 * single home currency for reporting.
 *
 * Money is represented end-to-end as **integer minor units** (e.g. cents,
 * satang, pence). No value in this module is ever a floating-point amount of
 * money. See `trip-budgets.ts` for the FX-rate contract.
 *
 * References: issue #2205
 */

/** Lifecycle status derived from the trip window and archive flag. */
export type TripBudgetStatus = 'upcoming' | 'active' | 'ended' | 'archived';

/**
 * A budget scoped to a named trip / country with a date window.
 *
 * `plannedLocalMinor` and all derived spend totals are integer minor units of
 * `localCurrency`. `fxRateHomePerLocal` is a caller-provided conversion factor
 * (never fetched from the network) — see `convertMinorUnits` for its exact
 * meaning.
 */
export interface TripBudget {
  /** Stable identifier. */
  readonly id: string;
  /** Human-friendly trip name, e.g. "Bangkok Jan–Mar". */
  readonly name: string;
  /**
   * Country / region label the trip is scoped to. An empty string means the
   * trip matches transactions from any country (date window only).
   */
  readonly country: string;
  /** Inclusive trip start date (ISO 8601 `YYYY-MM-DD`). */
  readonly startDate: string;
  /** Inclusive trip end date (ISO 8601 `YYYY-MM-DD`). */
  readonly endDate: string;
  /** ISO 4217 currency the trip is budgeted in (the destination currency). */
  readonly localCurrency: string;
  /** ISO 4217 currency totals roll up into for cross-trip reporting. */
  readonly homeCurrency: string;
  /** Planned spend for the whole trip, integer minor units of `localCurrency`. */
  readonly plannedLocalMinor: number;
  /**
   * Caller-provided / stored FX rate. Home minor units per 1 local minor unit.
   * Never fetched live — see the `trip-budgets.ts` header for the contract.
   */
  readonly fxRateHomePerLocal: number;
  /** When true, the trip is archived and reports use the frozen snapshot. */
  readonly archived: boolean;
  /** ISO date the trip was archived, when applicable. */
  readonly archivedAt?: string | null;
  /**
   * Totals captured at archive time so historical reporting is preserved even
   * if the underlying transactions change later.
   */
  readonly archivedSnapshot?: TripBudgetTotals | null;
}

/**
 * A spend entry considered for a trip budget.
 *
 * `amountMinor` is a spend magnitude in `currency` minor units; the engine
 * takes its absolute value defensively so callers may pass signed expenses.
 */
export interface TripTransaction {
  /** Stable identifier. */
  readonly id: string;
  /** Spend magnitude in `currency` minor units. */
  readonly amountMinor: number;
  /** ISO 4217 currency the amount is recorded in. */
  readonly currency: string;
  /** Transaction date (ISO 8601 `YYYY-MM-DD`). */
  readonly date: string;
  /** Country / region the spend occurred in. */
  readonly country?: string | null;
  /**
   * Explicit trip assignment. When set, the transaction only matches the trip
   * with this id (and bypasses the country filter), but the date window still
   * applies. Use it to pull a layover purchase into the right envelope.
   */
  readonly tripId?: string | null;
  /** When true, the transaction is excluded (e.g. a refund or transfer). */
  readonly excluded?: boolean;
}

/** Computed totals for a trip budget, all in integer minor units. */
export interface TripBudgetTotals {
  /** Number of transactions that matched the trip. */
  readonly transactionCount: number;
  /** Total spend in `localCurrency` minor units. */
  readonly localSpentMinor: number;
  /** Total spend rolled up into `homeCurrency` minor units. */
  readonly homeSpentMinor: number;
  /** Planned amount in `localCurrency` minor units. */
  readonly plannedLocalMinor: number;
  /** Planned amount rolled up into `homeCurrency` minor units. */
  readonly plannedHomeMinor: number;
  /** Planned minus spent in local minor units (negative when over budget). */
  readonly remainingLocalMinor: number;
  /** Planned minus spent in home minor units (negative when over budget). */
  readonly remainingHomeMinor: number;
  /** Spent ÷ planned expressed in basis points (10000 = 100%); 0 when no plan. */
  readonly utilizationBps: number;
  /** True when there is a plan and spend has exceeded it. */
  readonly overBudget: boolean;
}

/** A trip budget plus its computed totals and lifecycle status. */
export interface TripBudgetReport extends TripBudgetTotals {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly localCurrency: string;
  readonly homeCurrency: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly archived: boolean;
  readonly status: TripBudgetStatus;
  /** Ids of the transactions that currently match the trip window/country. */
  readonly includedTransactionIds: readonly string[];
}

/** Options for {@link computeTripTotals} / {@link summarizeTripBudget}. */
export interface TripTotalsOptions {
  /**
   * Optional map of transaction-currency → local-minor multiplier, used to
   * convert spend recorded in a currency other than the trip's local currency
   * into local minor units. Keyed by ISO 4217 code (case-insensitive).
   *
   * When a non-local transaction currency is absent from this map the engine
   * assumes the amount is already expressed in local minor units (documented
   * fallback — never a network lookup).
   */
  readonly localRates?: Readonly<Record<string, number>>;
}
