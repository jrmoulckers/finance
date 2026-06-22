// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure trip / country budget engine for the web app (issue #2205).
 *
 * Implements "trip envelopes" for digital nomads: a budget scoped to a named
 * trip / country with a start/end date window (e.g. "Bangkok Jan–Mar"). It
 * computes spend inside the trip window, totals in the trip's local currency,
 * a roll-up into a single home currency, remaining-versus-planned, and an
 * archived state that freezes historical totals.
 *
 * Design rules (per the `financial-modeling` skill):
 *   - Money is **integer minor units** (cents, satang, pence …) everywhere.
 *     No floating-point money is produced or stored.
 *   - Rounding uses **banker's rounding** (HALF_EVEN) via `bankersRound`.
 *   - All functions are **pure** — no I/O, no clocks, no mutation of inputs.
 *
 * FX-RATE CONTRACT (read carefully):
 *   `TripBudget.fxRateHomePerLocal` is a **caller-provided / stored** rate and
 *   is NEVER fetched from the network. It is the number of **home minor units
 *   per 1 local minor unit**. For the common case where both currencies use
 *   two decimal places (e.g. THB↔USD, EUR↔USD, GBP↔USD) this equals the usual
 *   mid-market major-unit rate (e.g. 1 THB = 0.028 USD → `0.028`). For pairs
 *   whose minor-unit scales differ (e.g. JPY has 0 decimals) the caller must
 *   pre-scale the rate so it remains "home minor per local minor".
 *
 * Likewise `TripTotalsOptions.localRates` lets callers convert spend recorded
 * in a foreign currency into the trip's local currency using stored multipliers
 * — also never a network lookup.
 *
 * References: issue #2205
 */

import { bankersRound, daysBetween } from '../budgeting/utils';
import type {
  TripBudget,
  TripBudgetReport,
  TripBudgetStatus,
  TripBudgetTotals,
  TripTotalsOptions,
  TripTransaction,
} from './types';

export type {
  TripBudget,
  TripBudgetReport,
  TripBudgetStatus,
  TripBudgetTotals,
  TripTotalsOptions,
  TripTransaction,
} from './types';

/** One whole unit, expressed in basis points (100% = 10000bps). */
const BASIS_POINTS_SCALE = 10_000;

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Upper-case + trim an ISO 4217 currency code for comparison. */
export function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

/** Lower-case + trim a country label for case-insensitive matching. */
export function normalizeCountry(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// FX conversion (minor → minor, banker's rounding)
// ---------------------------------------------------------------------------

/**
 * Convert an integer minor-unit amount using a caller-provided rate.
 *
 * @param amountMinor - Integer minor units in the source currency.
 * @param rate - Target minor units per 1 source minor unit (see FX contract).
 * @returns Integer minor units in the target currency (banker's-rounded).
 */
export function convertMinorUnits(amountMinor: number, rate: number): number {
  if (!Number.isFinite(amountMinor) || !Number.isFinite(rate)) {
    return 0;
  }
  return bankersRound(amountMinor * rate);
}

/**
 * Convert a single transaction's amount into the trip's local minor units.
 *
 * Transactions already in the trip's local currency pass through unchanged.
 * Foreign-currency transactions use `localRates[currency]` when supplied,
 * otherwise the amount is assumed to already be in local minor units (the
 * documented, network-free fallback).
 */
function transactionLocalMinor(
  trip: TripBudget,
  transaction: TripTransaction,
  localRates: Readonly<Record<string, number>> | undefined,
): number {
  const magnitude = Math.abs(transaction.amountMinor);
  const txCurrency = normalizeCurrency(transaction.currency);
  const localCurrency = normalizeCurrency(trip.localCurrency);

  if (txCurrency === localCurrency) {
    return magnitude;
  }

  const rate = localRates?.[txCurrency];
  if (rate !== undefined && Number.isFinite(rate)) {
    return convertMinorUnits(magnitude, rate);
  }

  return magnitude;
}

// ---------------------------------------------------------------------------
// Date-window + country filtering
// ---------------------------------------------------------------------------

/**
 * Whether a transaction falls inside the trip's inclusive date window.
 *
 * ISO `YYYY-MM-DD` strings sort lexicographically, so plain string comparison
 * is correct and avoids any timezone ambiguity.
 */
export function transactionInTripWindow(trip: TripBudget, transaction: TripTransaction): boolean {
  return transaction.date >= trip.startDate && transaction.date <= trip.endDate;
}

/**
 * Whether a transaction belongs to a trip budget.
 *
 * Rules (in order):
 *   1. Excluded transactions never match.
 *   2. The date window is always authoritative — out-of-window never matches.
 *   3. An explicit `tripId` assignment matches only that trip (and bypasses the
 *      country filter), supporting manual overrides such as layover purchases.
 *   4. Otherwise an empty trip country matches any country; a set country must
 *      match the transaction country case-insensitively.
 */
export function transactionMatchesTrip(trip: TripBudget, transaction: TripTransaction): boolean {
  if (transaction.excluded) {
    return false;
  }
  if (!transactionInTripWindow(trip, transaction)) {
    return false;
  }

  const assignedTripId = transaction.tripId?.trim();
  if (assignedTripId) {
    return assignedTripId === trip.id;
  }

  const tripCountry = normalizeCountry(trip.country);
  if (tripCountry === '') {
    return true;
  }
  return normalizeCountry(transaction.country) === tripCountry;
}

/** Return only the transactions that match the trip, preserving order. */
export function filterTripTransactions(
  trip: TripBudget,
  transactions: readonly TripTransaction[],
): TripTransaction[] {
  return transactions.filter((transaction) => transactionMatchesTrip(trip, transaction));
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

/** Build a {@link TripBudgetTotals} from a settled local spend figure. */
function buildTotals(
  trip: TripBudget,
  localSpentMinor: number,
  transactionCount: number,
): TripBudgetTotals {
  const plannedLocalMinor = Math.max(0, Math.trunc(trip.plannedLocalMinor));
  const rate = trip.fxRateHomePerLocal;

  const homeSpentMinor = convertMinorUnits(localSpentMinor, rate);
  const plannedHomeMinor = convertMinorUnits(plannedLocalMinor, rate);

  const utilizationBps =
    plannedLocalMinor > 0
      ? bankersRound((localSpentMinor / plannedLocalMinor) * BASIS_POINTS_SCALE)
      : 0;

  return {
    transactionCount,
    localSpentMinor,
    homeSpentMinor,
    plannedLocalMinor,
    plannedHomeMinor,
    remainingLocalMinor: plannedLocalMinor - localSpentMinor,
    remainingHomeMinor: plannedHomeMinor - homeSpentMinor,
    utilizationBps,
    overBudget: plannedLocalMinor > 0 && localSpentMinor > plannedLocalMinor,
  };
}

/**
 * Compute the spend totals for a trip budget.
 *
 * For an archived trip with a stored snapshot the frozen snapshot is returned
 * verbatim, preserving historical totals even if the transactions change.
 */
export function computeTripTotals(
  trip: TripBudget,
  transactions: readonly TripTransaction[],
  options: TripTotalsOptions = {},
): TripBudgetTotals {
  if (trip.archived && trip.archivedSnapshot) {
    return trip.archivedSnapshot;
  }

  const matched = filterTripTransactions(trip, transactions);
  const localSpentMinor = matched.reduce(
    (sum, transaction) => sum + transactionLocalMinor(trip, transaction, options.localRates),
    0,
  );
  return buildTotals(trip, localSpentMinor, matched.length);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Derive a trip's lifecycle status relative to a reference `today` date. */
export function tripStatus(trip: TripBudget, today: string): TripBudgetStatus {
  if (trip.archived) {
    return 'archived';
  }
  if (today < trip.startDate) {
    return 'upcoming';
  }
  if (today > trip.endDate) {
    return 'ended';
  }
  return 'active';
}

/** Inclusive length of the trip window in whole days (minimum 1). */
export function tripDurationDays(trip: TripBudget): number {
  return Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1);
}

/**
 * Produce a full report (totals + status + matched ids) for a trip budget.
 */
export function summarizeTripBudget(
  trip: TripBudget,
  transactions: readonly TripTransaction[],
  today: string,
  options: TripTotalsOptions = {},
): TripBudgetReport {
  const totals = computeTripTotals(trip, transactions, options);
  const includedTransactionIds = filterTripTransactions(trip, transactions).map(
    (transaction) => transaction.id,
  );

  return {
    ...totals,
    id: trip.id,
    name: trip.name,
    country: trip.country,
    localCurrency: normalizeCurrency(trip.localCurrency),
    homeCurrency: normalizeCurrency(trip.homeCurrency),
    startDate: trip.startDate,
    endDate: trip.endDate,
    archived: trip.archived,
    status: tripStatus(trip, today),
    includedTransactionIds,
  };
}

/**
 * Summarise every trip and roll their home-currency totals into a single
 * cross-trip figure. Trips with mismatched home currencies are summed verbatim
 * (the caller is responsible for keeping a consistent home currency); the
 * returned `homeCurrency` is taken from the first active trip.
 */
export function summarizeTripBudgets(
  trips: readonly TripBudget[],
  transactions: readonly TripTransaction[],
  today: string,
  options: TripTotalsOptions = {},
): {
  readonly reports: readonly TripBudgetReport[];
  readonly homeCurrency: string;
  readonly totalPlannedHomeMinor: number;
  readonly totalSpentHomeMinor: number;
  readonly totalRemainingHomeMinor: number;
  readonly activeTripCount: number;
} {
  const reports = trips.map((trip) => summarizeTripBudget(trip, transactions, today, options));
  const active = reports.filter((report) => !report.archived);

  const totalPlannedHomeMinor = active.reduce((sum, report) => sum + report.plannedHomeMinor, 0);
  const totalSpentHomeMinor = active.reduce((sum, report) => sum + report.homeSpentMinor, 0);

  return {
    reports,
    homeCurrency: active[0]?.homeCurrency ?? reports[0]?.homeCurrency ?? 'USD',
    totalPlannedHomeMinor,
    totalSpentHomeMinor,
    totalRemainingHomeMinor: totalPlannedHomeMinor - totalSpentHomeMinor,
    activeTripCount: active.length,
  };
}

/**
 * Archive a finished trip, freezing its current totals into a snapshot so the
 * historical figures survive later transaction edits. Any pre-existing snapshot
 * is ignored so the snapshot reflects the live state at archive time.
 */
export function archiveTripBudget(
  trip: TripBudget,
  transactions: readonly TripTransaction[],
  archivedAt: string,
  options: TripTotalsOptions = {},
): TripBudget {
  const liveTotals = computeTripTotals(
    { ...trip, archived: false, archivedSnapshot: null },
    transactions,
    options,
  );
  return {
    ...trip,
    archived: true,
    archivedAt,
    archivedSnapshot: liveTotals,
  };
}

/** Re-open an archived trip, discarding the frozen snapshot. */
export function unarchiveTripBudget(trip: TripBudget): TripBudget {
  return {
    ...trip,
    archived: false,
    archivedAt: null,
    archivedSnapshot: null,
  };
}
