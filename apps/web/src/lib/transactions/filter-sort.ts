// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared transaction filtering, sorting, and search predicates.
 *
 * Extracted from `TransactionsPage` so both the full ledger view and the
 * condensed dashboard "Recent Transactions" card apply identical
 * search / filter / sort semantics without duplicating logic.
 *
 * All functions are pure and side-effect free.
 *
 * References: issue #3155
 */

import type { Transaction } from '../../kmp/bridge';
import type { AdvancedFilters } from '../../components/transactions/TransactionFilters';
import type { SortConfig } from '../../components/transactions/TransactionSort';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Return a new array sorted by the requested field and direction.
 *
 * Non-date primary sorts fall back to a date-descending secondary sort so
 * equal keys retain a stable, newest-first ordering.
 */
export function sortTransactions(
  transactions: readonly Transaction[],
  sort: SortConfig,
  categoryNames: ReadonlyMap<string, string>,
): Transaction[] {
  const sorted = [...transactions].sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'date':
        comparison = a.date.localeCompare(b.date);
        break;
      case 'amount':
        comparison = Math.abs(a.amount.amount) - Math.abs(b.amount.amount);
        break;
      case 'payee':
        comparison = (a.payee ?? '').localeCompare(b.payee ?? '');
        break;
      case 'category': {
        const catA = a.categoryId ? (categoryNames.get(a.categoryId) ?? '') : '';
        const catB = b.categoryId ? (categoryNames.get(b.categoryId) ?? '') : '';
        comparison = catA.localeCompare(catB);
        break;
      }
    }

    if (sort.direction === 'desc') comparison = -comparison;

    // Secondary sort: always by date descending for non-date primary sorts.
    if (comparison === 0 && sort.field !== 'date') {
      comparison = b.date.localeCompare(a.date);
    }

    return comparison;
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// Advanced filters (category / account / amount range / type / status)
// ---------------------------------------------------------------------------

/** Apply the advanced filter set (AND semantics) on top of an existing list. */
export function applyAdvancedFilters(
  transactions: readonly Transaction[],
  filters: AdvancedFilters,
): Transaction[] {
  let result: readonly Transaction[] = transactions;

  if (filters.categoryIds.length > 0) {
    result = result.filter(
      (t) => t.categoryId !== null && filters.categoryIds.includes(t.categoryId),
    );
  }

  if (filters.accountIds.length > 0) {
    result = result.filter((t) => filters.accountIds.includes(t.accountId));
  }

  if (filters.amountMin) {
    const minCents = Math.round(parseFloat(filters.amountMin) * 100);
    result = result.filter((t) => Math.abs(t.amount.amount) >= minCents);
  }

  if (filters.amountMax) {
    const maxCents = Math.round(parseFloat(filters.amountMax) * 100);
    result = result.filter((t) => Math.abs(t.amount.amount) <= maxCents);
  }

  if (filters.types.length > 0) {
    result = result.filter((t) => filters.types.includes(t.type));
  }

  if (filters.statuses.length > 0) {
    result = result.filter((t) => filters.statuses.includes(t.status));
  }

  return [...result];
}

// ---------------------------------------------------------------------------
// Client-side free-text search
// ---------------------------------------------------------------------------

/** Optional lookup maps so search can match resolved category / account names. */
export interface TransactionSearchContext {
  categoryNames?: ReadonlyMap<string, string>;
  accountNames?: ReadonlyMap<string, string>;
}

/**
 * Lower-case and strip diacritics so `cafe` matches `Café` (and vice versa).
 *
 * Uses Unicode NFD decomposition to split accented characters into a base
 * letter plus a combining mark, then removes the combining marks. Keeps search
 * relevance consistent for international merchant and payee names (#3790).
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Test whether a transaction matches a free-text query.
 *
 * Mirrors the repository's SQL search fields (payee, note, tags, status,
 * counterparty, resolved category/account name) plus an exact numeric amount
 * match, so the condensed card behaves like the full ledger search for the
 * window of transactions it holds. An empty/whitespace query matches all.
 */
export function matchesTransactionQuery(
  transaction: Transaction,
  query: string,
  context: TransactionSearchContext = {},
): boolean {
  const term = normalizeSearchText(query.trim());
  if (term === '') return true;

  const haystacks: string[] = [
    transaction.payee ?? '',
    transaction.note ?? '',
    transaction.status,
    transaction.counterpartyName ?? '',
    ...transaction.tags,
  ];

  if (transaction.categoryId !== null) {
    haystacks.push(context.categoryNames?.get(transaction.categoryId) ?? '');
  }
  haystacks.push(context.accountNames?.get(transaction.accountId) ?? '');

  if (haystacks.some((value) => normalizeSearchText(value).includes(term))) {
    return true;
  }

  // Numeric search: match the absolute amount (entered in major units).
  const numericSearch = term.replace(/[$,]/g, '');
  if (/^\d+(\.\d+)?$/.test(numericSearch)) {
    const amountCents = Math.round(parseFloat(numericSearch) * 100);
    if (Math.abs(transaction.amount.amount) === amountCents) {
      return true;
    }
  }

  return false;
}
