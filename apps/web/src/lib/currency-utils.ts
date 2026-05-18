// SPDX-License-Identifier: BUSL-1.1

/**
 * Multi-currency utilities for grouping and displaying amounts across
 * different currencies without naive addition.
 *
 * These utilities solve the problem of summing balances from accounts
 * that use different currencies — amounts must be grouped per-currency
 * rather than naively added as raw numbers.
 *
 * References: issue #1504
 */

import { formatCurrency } from './currency';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An amount paired with its currency code. */
export interface CurrencyAmount {
  readonly amount: number;
  readonly currency: string;
}

// ---------------------------------------------------------------------------
// Core utilities
// ---------------------------------------------------------------------------

/**
 * Group an array of currency amounts by their currency code, summing amounts
 * within each group.
 *
 * @example
 * ```ts
 * groupByCurrency([
 *   { amount: 100000, currency: 'USD' },
 *   { amount: 50000, currency: 'EUR' },
 *   { amount: 200000, currency: 'USD' },
 * ]);
 * // => { USD: 300000, EUR: 50000 }
 * ```
 */
export function groupByCurrency(amounts: ReadonlyArray<CurrencyAmount>): Record<string, number> {
  const groups: Record<string, number> = {};

  for (const { amount, currency } of amounts) {
    groups[currency] = (groups[currency] ?? 0) + amount;
  }

  return groups;
}

/**
 * Format grouped currency totals into a human-readable display string.
 *
 * Each currency total is formatted with its symbol and code, separated
 * by a middle-dot separator. Currencies are sorted alphabetically by code
 * for consistent display.
 *
 * @example
 * ```ts
 * formatCurrencyGroup({ USD: 150000, EUR: 120000 });
 * // => "$1,500.00 EUR €1,200.00"
 * // (exact output depends on Intl formatting)
 * ```
 */
export function formatCurrencyGroup(groups: Record<string, number>): string {
  const entries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  return entries.map(([currency, amount]) => formatCurrency(amount, { currency })).join(' · ');
}

/**
 * Detect whether an array of items with currency codes contains mixed currencies.
 *
 * @returns `true` if more than one distinct currency code is present.
 *
 * @example
 * ```ts
 * detectMixedCurrencies([{ currency: 'USD' }, { currency: 'EUR' }]); // true
 * detectMixedCurrencies([{ currency: 'USD' }, { currency: 'USD' }]); // false
 * detectMixedCurrencies([]); // false
 * ```
 */
export function detectMixedCurrencies(accounts: ReadonlyArray<{ currency: string }>): boolean {
  if (accounts.length <= 1) return false;

  const first = accounts[0]!.currency;
  return accounts.some((account) => account.currency !== first);
}

/**
 * Get the single currency code from a homogeneous list, or null if mixed.
 *
 * @returns The common currency code, or `null` if multiple currencies are present.
 */
export function getSingleCurrency(accounts: ReadonlyArray<{ currency: string }>): string | null {
  if (accounts.length === 0) return null;

  const first = accounts[0]!.currency;
  const allSame = accounts.every((account) => account.currency === first);
  return allSame ? first : null;
}

/**
 * Count the number of distinct currencies in a collection.
 */
export function countCurrencies(accounts: ReadonlyArray<{ currency: string }>): number {
  const seen = new Set<string>();
  for (const account of accounts) {
    seen.add(account.currency);
  }
  return seen.size;
}
