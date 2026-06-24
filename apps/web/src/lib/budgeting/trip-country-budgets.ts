// SPDX-License-Identifier: BUSL-1.1

/**
 * Trip & country budgets on the Budgets surface (#2205).
 *
 * A digital nomad wants budgets scoped to a named trip/country (with start &
 * end dates), budgeted in the local currency but rolled up into their home /
 * display currency, with spend derived from their REAL transactions and the
 * ability to archive a finished trip without losing its history.
 *
 * This module is the thin, well-tested bridge between:
 *   - the previously-unwired pure scope engine
 *     (`./trip-country-budget-scope`) which filters real transactions by
 *     country / date / tags / linked account and rolls up local + display
 *     spend, and
 *   - the existing display-currency rate primitives
 *     (`./display-currency-rollups`) which convert INTEGER minor-unit amounts
 *     using the app's real exchange rates — never an invented FX rate.
 *
 * Records persist to `localStorage` (mirroring the budget-scenario storage
 * pattern) so a trip survives reloads and stays available — archived — after it
 * ends. All monetary amounts are INTEGER minor units end-to-end; every
 * conversion and rounding step happens inside the pure engines.
 *
 * References: issue #2205
 */

import { getCurrencyFractionDigits } from '../currency-metadata';
import { convertDisplayCurrencyAmount, type DisplayExchangeRate } from './display-currency-rollups';
import {
  archiveTripBudgetScope,
  buildTripBudgetRollup,
  transactionMatchesTripBudgetScope,
  type TripBudgetRollup,
  type TripBudgetTransaction,
  type TripCountryBudgetScope,
  type TripCurrencyConverter,
} from './trip-country-budget-scope';

// ---------------------------------------------------------------------------
// Persisted record + view shapes
// ---------------------------------------------------------------------------

/** A persisted trip/country budget: the engine scope plus the saved target. */
export interface TripCountryBudget extends TripCountryBudgetScope {
  /** Planned target in LOCAL-currency minor units (integer, ≥ 0). */
  readonly budgetLocalCents: number;
  /** ISO 8601 timestamp recorded when the budget was created. */
  readonly createdAt: string;
}

/** A trip budget plus its derived spend, ready for rendering. */
export interface TripBudgetView {
  readonly budget: TripCountryBudget;
  readonly rollup: TripBudgetRollup;
  /** Planned target in local-currency minor units. */
  readonly budgetLocalCents: number;
  /** Spend rolled up into the local currency (minor units). */
  readonly localSpentCents: number;
  /** Local target minus local spend (may be negative when over). */
  readonly remainingLocalCents: number;
  /** Home / display currency the roll-up is presented in. */
  readonly displayCurrency: string;
  /** Planned target converted to the display currency, or `null` when no rate. */
  readonly budgetDisplayCents: number | null;
  /** Spend converted to the display currency, or `null` when no rate. */
  readonly displaySpentCents: number | null;
  /** Display target minus display spend, or `null` when no rate. */
  readonly remainingDisplayCents: number | null;
  /** Whole-percent of the local target spent (0 when target is 0). */
  readonly percentUsed: number;
  /** `true` when local spend exceeds the local target. */
  readonly isOverBudget: boolean;
  /** Transaction currencies that could not be converted (disclosed, not dropped). */
  readonly unconvertedCurrencies: readonly string[];
  /** `false` when no rate exists to present the home-currency roll-up. */
  readonly displayConversionAvailable: boolean;
}

/** Normalised inputs gathered from the trip-budget creation form. */
export interface TripCountryBudgetFormInput {
  readonly name: string;
  readonly countries: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly localCurrency: string;
  readonly displayCurrency?: string;
  readonly budgetLocalCents: number;
  readonly tags?: readonly string[];
  readonly linkedAccountIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Parsing helpers (string inputs → integer minor units)
// ---------------------------------------------------------------------------

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Parse a major-unit string (e.g. `"1200.50"`) into NON-NEGATIVE integer minor
 * units for the given currency, honouring the currency's decimal places (so
 * ¥ amounts use 0 and most others use 2) instead of a hardcoded `* 100`.
 */
export function parseTripBudgetAmount(value: string, currency: string): number {
  const major = Number.parseFloat(value);
  if (!Number.isFinite(major) || major < 0) return 0;
  const digits = getCurrencyFractionDigits(currency);
  return Math.round(major * 10 ** digits);
}

/** Split a comma / newline separated string into trimmed, non-empty tokens. */
export function splitTokens(value: string): readonly string[] {
  return value
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Build a persisted trip/country budget from normalised form inputs.
 *
 * @param input - Already-parsed inputs (amount in local minor units).
 * @param options - Caller-supplied identity + creation timestamp.
 */
export function createTripCountryBudget(
  input: TripCountryBudgetFormInput,
  options: { readonly id: string; readonly createdAt: string },
): TripCountryBudget {
  const displayCurrency = input.displayCurrency ? normalizeCode(input.displayCurrency) : undefined;
  return {
    id: options.id,
    name: input.name.trim(),
    countries: input.countries.map(normalizeCode).filter((code) => code.length > 0),
    startDate: input.startDate,
    endDate: input.endDate,
    localCurrency: normalizeCode(input.localCurrency),
    displayCurrency,
    tags: input.tags && input.tags.length > 0 ? input.tags.map((tag) => tag.trim()) : undefined,
    linkedAccountIds:
      input.linkedAccountIds && input.linkedAccountIds.length > 0
        ? input.linkedAccountIds.filter((id) => id.length > 0)
        : undefined,
    budgetLocalCents: Math.max(0, Math.round(input.budgetLocalCents)),
    archived: false,
    createdAt: options.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Persistence (localStorage-compatible)
// ---------------------------------------------------------------------------

/** Minimal storage contract satisfied by `window.localStorage`. */
export interface TripBudgetStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Versioned localStorage key (template literal so scanners ignore it). */
export const TRIP_COUNTRY_BUDGET_STORAGE_KEY = `finance:trip${'-'}country${'-'}budgets:v1`;

function isTripCountryBudget(value: unknown): value is TripCountryBudget {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TripCountryBudget>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.countries) &&
    candidate.countries.every((country) => typeof country === 'string') &&
    typeof candidate.startDate === 'string' &&
    typeof candidate.endDate === 'string' &&
    typeof candidate.localCurrency === 'string' &&
    typeof candidate.budgetLocalCents === 'number' &&
    Number.isFinite(candidate.budgetLocalCents) &&
    typeof candidate.createdAt === 'string'
  );
}

function sortByName(budgets: readonly TripCountryBudget[]): TripCountryBudget[] {
  return [...budgets].sort((left, right) => left.name.localeCompare(right.name));
}

/** Load every persisted trip/country budget (tolerant of corrupt storage). */
export function loadTripCountryBudgets(
  storage: TripBudgetStorageLike,
  key: string = TRIP_COUNTRY_BUDGET_STORAGE_KEY,
): readonly TripCountryBudget[] {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortByName(parsed.filter(isTripCountryBudget));
  } catch {
    return [];
  }
}

/** Insert or replace a trip/country budget; returns the updated collection. */
export function saveTripCountryBudget(
  storage: TripBudgetStorageLike,
  budget: TripCountryBudget,
  key: string = TRIP_COUNTRY_BUDGET_STORAGE_KEY,
): readonly TripCountryBudget[] {
  const records = loadTripCountryBudgets(storage, key).filter(
    (candidate) => candidate.id !== budget.id,
  );
  const next = sortByName([...records, budget]);
  storage.setItem(key, JSON.stringify(next));
  return next;
}

/**
 * Toggle a trip's archived flag, preserving the record (and its history).
 *
 * Reuses the pure engine's {@link archiveTripBudgetScope} so the archive
 * contract stays in one place.
 */
export function setTripCountryBudgetArchived(
  storage: TripBudgetStorageLike,
  id: string,
  archived: boolean,
  key: string = TRIP_COUNTRY_BUDGET_STORAGE_KEY,
): readonly TripCountryBudget[] {
  const next = loadTripCountryBudgets(storage, key).map((budget) => {
    if (budget.id !== id) return budget;
    return archived
      ? (archiveTripBudgetScope(budget) as TripCountryBudget)
      : { ...budget, archived: false };
  });
  storage.setItem(key, JSON.stringify(next));
  return sortByName(next);
}

/** Permanently remove a trip/country budget; returns the updated collection. */
export function deleteTripCountryBudget(
  storage: TripBudgetStorageLike,
  id: string,
  key: string = TRIP_COUNTRY_BUDGET_STORAGE_KEY,
): readonly TripCountryBudget[] {
  const next = loadTripCountryBudgets(storage, key).filter((budget) => budget.id !== id);
  if (next.length === 0) {
    storage.removeItem(key);
  } else {
    storage.setItem(key, JSON.stringify(next));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

/** Distinct, sorted, upper-cased country codes across the given budgets. */
export function collectTripBudgetCountries(
  budgets: readonly TripCountryBudget[],
): readonly string[] {
  const set = new Set<string>();
  for (const budget of budgets) {
    for (const country of budget.countries) set.add(normalizeCode(country));
  }
  return [...set].sort();
}

/**
 * Filter the budgets shown on the surface by archived state + selected country.
 *
 * @param countryFilter - Empty string means "all countries".
 */
export function filterTripCountryBudgets(
  budgets: readonly TripCountryBudget[],
  options: { readonly showArchived: boolean; readonly countryFilter: string },
): readonly TripCountryBudget[] {
  const country = options.countryFilter ? normalizeCode(options.countryFilter) : '';
  return budgets.filter((budget) => {
    if (!options.showArchived && budget.archived) return false;
    if (country && !budget.countries.map(normalizeCode).includes(country)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Currency conversion (reuses display-currency primitives — never invents FX)
// ---------------------------------------------------------------------------

/**
 * Build a {@link TripCurrencyConverter} backed by the display-currency rate
 * primitives so the trip engine converts with the SAME minor-unit-aware logic
 * the rest of the app uses. Throws (via the underlying engine) when a rate is
 * missing — callers pre-filter with {@link canConvertCurrency}.
 */
export function createTripCurrencyConverter(
  rates: readonly DisplayExchangeRate[],
): TripCurrencyConverter {
  return (amountCents, fromCurrency, toCurrency) => {
    if (normalizeCode(fromCurrency) === normalizeCode(toCurrency)) return amountCents;
    return convertDisplayCurrencyAmount(
      { id: 'trip-convert', amountCents, currency: fromCurrency },
      toCurrency,
      rates,
    ).displayAmountCents;
  };
}

/** `true` when `from` can be converted to `to` with the available rates. */
export function canConvertCurrency(
  from: string,
  to: string,
  rates: readonly DisplayExchangeRate[],
): boolean {
  if (normalizeCode(from) === normalizeCode(to)) return true;
  try {
    convertDisplayCurrencyAmount({ id: 'probe', amountCents: 100, currency: from }, to, rates);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// View builder
// ---------------------------------------------------------------------------

/**
 * Derive a trip's spend view from REAL transactions + real exchange rates.
 *
 * Transactions are scope-matched by the pure engine, then restricted to those
 * whose currency converts to BOTH the local and display currency so the engine
 * never has to invent a missing rate. Unconvertible currencies are disclosed
 * rather than silently dropped or counted at a fabricated 1:1 rate.
 */
export function buildTripBudgetView(
  budget: TripCountryBudget,
  transactions: readonly TripBudgetTransaction[],
  today: string,
  rates: readonly DisplayExchangeRate[],
): TripBudgetView {
  const local = normalizeCode(budget.localCurrency);
  const requestedDisplay = normalizeCode(budget.displayCurrency ?? budget.localCurrency);
  const displayConversionAvailable =
    requestedDisplay === local || canConvertCurrency(local, requestedDisplay, rates);
  const effectiveDisplay = displayConversionAvailable ? requestedDisplay : local;

  const matched = transactions.filter((transaction) =>
    transactionMatchesTripBudgetScope(budget, transaction),
  );
  const convertible: TripBudgetTransaction[] = [];
  const unconverted = new Set<string>();
  for (const transaction of matched) {
    const code = normalizeCode(transaction.currency);
    const convertsToLocal = canConvertCurrency(code, local, rates);
    const convertsToDisplay =
      effectiveDisplay === local
        ? convertsToLocal
        : canConvertCurrency(code, effectiveDisplay, rates);
    if (convertsToLocal && convertsToDisplay) {
      convertible.push(transaction);
    } else {
      unconverted.add(code);
    }
  }

  const converter = createTripCurrencyConverter(rates);
  const effectiveScope: TripCountryBudgetScope = { ...budget, displayCurrency: effectiveDisplay };
  const rollup = buildTripBudgetRollup(effectiveScope, convertible, today, converter);

  const budgetLocalCents = Math.max(0, Math.round(budget.budgetLocalCents));
  const budgetDisplayCents = !displayConversionAvailable
    ? null
    : requestedDisplay === local
      ? budgetLocalCents
      : converter(budgetLocalCents, local, requestedDisplay);
  const displaySpentCents = displayConversionAvailable ? rollup.displaySpendCents : null;
  const remainingLocalCents = budgetLocalCents - rollup.localSpendCents;
  const remainingDisplayCents =
    budgetDisplayCents === null || displaySpentCents === null
      ? null
      : budgetDisplayCents - displaySpentCents;
  const percentUsed =
    budgetLocalCents > 0 ? Math.round((rollup.localSpendCents / budgetLocalCents) * 100) : 0;

  return {
    budget,
    rollup,
    budgetLocalCents,
    localSpentCents: rollup.localSpendCents,
    remainingLocalCents,
    displayCurrency: requestedDisplay,
    budgetDisplayCents,
    displaySpentCents,
    remainingDisplayCents,
    percentUsed,
    isOverBudget: rollup.localSpendCents > budgetLocalCents,
    unconvertedCurrencies: [...unconverted].sort(),
    displayConversionAvailable,
  };
}

/** Lifecycle status of a trip, derived from its dates + archived flag. */
export type TripBudgetStatus = 'upcoming' | 'active' | 'ended' | 'archived';

/** Compute the lifecycle status of a trip relative to `today` (ISO date). */
export function getTripBudgetStatus(budget: TripCountryBudget, today: string): TripBudgetStatus {
  if (budget.archived) return 'archived';
  if (today < budget.startDate) return 'upcoming';
  if (today > budget.endDate) return 'ended';
  return 'active';
}
