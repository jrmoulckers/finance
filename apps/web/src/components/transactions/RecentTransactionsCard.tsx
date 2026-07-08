// SPDX-License-Identifier: BUSL-1.1

/**
 * RecentTransactionsCard — condensed, scrollable dashboard surface that brings
 * the full Transactions ledger's search, filter, and sort capabilities to a
 * glanceable card, plus a clear "View all" link to the full ledger.
 *
 * The card loads a capped recent window via `useTransactions` and applies
 * search / advanced filters / sort entirely client-side so it stays fast on the
 * eager dashboard chunk. Privacy is preserved two ways:
 *   1. Amounts render through `CurrencyDisplay`, honoring privacy-mode masking.
 *   2. Biometric-protected category transactions are rolled up into a redacted
 *      aggregate BEFORE search/filter/sort, so the protected total is stable and
 *      never leaks (counts/amounts don't shift) in response to a search term.
 *
 * References: issue #3155
 */

import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { CurrencyDisplay, EmptyState, LoadingSpinner } from '../common';
import { useTransactions } from '../../hooks';
import type { Account, Category, Transaction } from '../../kmp/bridge';
import { selectWorkspaceTransactions, type AccountPurposeFilter } from '../../lib/accountPurpose';
import { rollUpProtectedTransactions } from '../../lib/ui/privacy';
import {
  applyAdvancedFilters,
  matchesTransactionQuery,
  sortTransactions,
} from '../../lib/transactions/filter-sort';
import { countActiveFilters, EMPTY_FILTERS, TransactionFilters } from './TransactionFilters';
import type { AdvancedFilters } from './TransactionFilters';
import { DEFAULT_SORT, TransactionSort } from './TransactionSort';
import type { SortConfig } from './TransactionSort';
import './recent-transactions-card.css';

/** Default number of most-recent transactions loaded into the searchable window. */
const DEFAULT_RECENT_WINDOW = 50;

/** Signed display amount: expenses negative, everything else as stored. */
function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }
  return transaction.amount.amount;
}

/** Human-readable primary label for a transaction row. */
function getTransactionLabel(transaction: Transaction): string {
  return (
    transaction.payee?.trim() ||
    transaction.note?.trim() ||
    (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')
  );
}

export interface RecentTransactionsCardProps {
  /** Categories used for the filter panel, name resolution, and protected rollup. */
  categories: Category[];
  /** Accounts used for the filter panel, name resolution, and purpose filtering. */
  accounts: Account[];
  /** Active account-purpose filter from the dashboard (personal/business/all). */
  accountPurposeFilter?: AccountPurposeFilter;
  /** Destination for the "View all" link. */
  viewAllTo?: string;
  /** Number of most-recent transactions to load into the searchable window. */
  windowSize?: number;
}

/**
 * Render the searchable, filterable, sortable condensed recent-transactions card.
 */
export const RecentTransactionsCard: React.FC<RecentTransactionsCardProps> = ({
  categories,
  accounts,
  accountPurposeFilter = 'all',
  viewAllTo = '/transactions',
  windowSize = DEFAULT_RECENT_WINDOW,
}) => {
  const headingId = useId();
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT);

  const recentFilters = useMemo(() => ({ limit: windowSize }), [windowSize]);
  const { transactions: recentTransactions, loading } = useTransactions(recentFilters);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  // Workspace (account-purpose) selection then protected rollup happen BEFORE
  // search/filter/sort so the redacted aggregate stays stable and never leaks
  // under a search term.
  const { visibleTransactions, protectedRollup } = useMemo(() => {
    const workspaceTransactions = selectWorkspaceTransactions(
      recentTransactions,
      accounts,
      accountPurposeFilter,
    );
    return rollUpProtectedTransactions(workspaceTransactions, categories);
  }, [recentTransactions, accounts, accountPurposeFilter, categories]);

  const searchContext = useMemo(
    () => ({ categoryNames, accountNames }),
    [categoryNames, accountNames],
  );

  const results = useMemo(() => {
    const searched = visibleTransactions.filter((transaction) =>
      matchesTransactionQuery(transaction, query, searchContext),
    );
    const filtered = applyAdvancedFilters(searched, advancedFilters);
    return sortTransactions(filtered, sortConfig, categoryNames);
  }, [visibleTransactions, query, searchContext, advancedFilters, sortConfig, categoryNames]);

  const hasAnyTransactions = visibleTransactions.length > 0 || protectedRollup !== null;
  const isNarrowed = query.trim() !== '' || countActiveFilters(advancedFilters) > 0;
  const resultCountLabel = `${results.length} ${results.length === 1 ? 'match' : 'matches'}`;
  const isInitialLoad = loading && recentTransactions.length === 0;

  return (
    <section className="page-section recent-transactions-card" aria-labelledby={headingId}>
      <div className="recent-transactions-card__header">
        <h3 className="page-section__title" id={headingId}>
          Recent Transactions
        </h3>
        <Link to={viewAllTo} className="recent-transactions-card__view-all">
          View all
          <span aria-hidden="true"> →</span>
        </Link>
      </div>

      <div className="card recent-transactions-card__body">
        {isInitialLoad ? (
          <LoadingSpinner label="Loading recent transactions" />
        ) : !hasAnyTransactions ? (
          <EmptyState
            title="No recent transactions"
            description="Transactions you add will appear here."
          />
        ) : (
          <>
            <div className="recent-transactions-card__controls">
              <div className="search-bar" role="search">
                <input
                  type="search"
                  className="search-bar__input"
                  placeholder="Search recent transactions..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search recent transactions"
                />
              </div>
              <div className="recent-transactions-card__controls-row">
                <TransactionFilters
                  filters={advancedFilters}
                  onChange={setAdvancedFilters}
                  isOpen={filtersOpen}
                  onToggle={() => setFiltersOpen((open) => !open)}
                  categories={categories}
                  accounts={accounts}
                />
                <TransactionSort sort={sortConfig} onChange={setSortConfig} />
              </div>
            </div>

            {isNarrowed ? (
              <p className="recent-transactions-card__count" role="status" aria-live="polite">
                {resultCountLabel}
              </p>
            ) : null}

            {results.length === 0 && protectedRollup === null ? (
              <EmptyState
                title="No matching transactions"
                description="Try adjusting your search or filters, or view all transactions."
              />
            ) : (
              <ul
                className="list-group recent-transactions-card__list recent-transactions__list themed-scrollbar"
                role="list"
              >
                {protectedRollup !== null ? (
                  <li className="list-item" role="listitem">
                    <div className="list-item__content">
                      <p className="list-item__primary">Protected</p>
                      <p className="list-item__secondary">
                        {protectedRollup.count} protected transaction
                        {protectedRollup.count === 1 ? '' : 's'} hidden
                      </p>
                    </div>
                    <div className="list-item__trailing">
                      <CurrencyDisplay
                        amount={protectedRollup.totalCents}
                        currency={protectedRollup.currency}
                        context="protected transactions total"
                      />
                    </div>
                  </li>
                ) : null}
                {results.map((transaction) => (
                  <li key={transaction.id} className="list-item" role="listitem">
                    <Link
                      to={`/transactions/${transaction.id}`}
                      className="list-item__link"
                      aria-label={`View transaction: ${getTransactionLabel(transaction)}`}
                    >
                      <div className="list-item__content">
                        <p className="list-item__primary">{getTransactionLabel(transaction)}</p>
                        <p className="list-item__secondary">
                          {transaction.categoryId !== null
                            ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                            : 'Uncategorized'}
                        </p>
                      </div>
                      <div className="list-item__trailing">
                        <CurrencyDisplay
                          amount={getTransactionDisplayAmount(transaction)}
                          currency={transaction.currency.code}
                          colorize
                          showSign
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default RecentTransactionsCard;
