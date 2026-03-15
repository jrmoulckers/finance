// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useAccounts, useCategories, useTransactions } from '../hooks';
import type { Transaction } from '../kmp/bridge';

const ALL_CATEGORIES_FILTER = '__all__';

function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }

  return transaction.amount.amount;
}

export const TransactionsPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORIES_FILTER);

  const filters = useMemo(
    () => ({
      searchTerm: query.trim() || undefined,
      categoryId: selectedCategoryId === ALL_CATEGORIES_FILTER ? undefined : selectedCategoryId,
    }),
    [query, selectedCategoryId],
  );

  const { transactions, loading, error, refresh: refreshTransactions } = useTransactions(filters);
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refresh: refreshCategories,
  } = useCategories();
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();

  const isLoading = loading || categoriesLoading || accountsLoading;
  const resolvedError = error ?? categoriesError ?? accountsError;
  const handleRetry = () => {
    refreshTransactions();
    refreshCategories();
    refreshAccounts();
  };

  const categoryFilters = useMemo(
    () => [
      { id: ALL_CATEGORIES_FILTER, name: 'All' },
      ...categories.map((category) => ({ id: category.id, name: category.name })),
    ],
    [categories],
  );

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    for (const transaction of transactions) {
      const existingTransactions = groups.get(transaction.date);
      if (existingTransactions) {
        existingTransactions.push(transaction);
      } else {
        groups.set(transaction.date, [transaction]);
      }
    }

    return Array.from(groups, ([date, datedTransactions]) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      transactions: datedTransactions,
    }));
  }, [transactions]);

  const hasActiveFilters = filters.searchTerm !== undefined || filters.categoryId !== undefined;

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        Transactions
      </h2>
      <div className="search-bar" role="search">
        <input
          type="search"
          className="search-bar__input"
          placeholder="Search..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search transactions"
        />
      </div>
      <div
        className="filter-chips"
        role="group"
        aria-label="Category filter"
        style={{ marginBottom: 'var(--spacing-4)' }}
      >
        {categoryFilters.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`filter-chip${selectedCategoryId === category.id ? ' filter-chip--active' : ''}`}
            onClick={() => setSelectedCategoryId(category.id)}
            aria-pressed={selectedCategoryId === category.id}
          >
            {category.name}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading transactions" />
        </div>
      ) : resolvedError ? (
        <ErrorBanner message={resolvedError} onRetry={handleRetry} />
      ) : transactions.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? 'No transactions found' : 'No transactions yet'}
          description={
            hasActiveFilters
              ? 'Try adjusting your search or category filters.'
              : 'Transactions you add will appear here.'
          }
        />
      ) : (
        <div>
          {groupedTransactions.map((group) => (
            <section key={group.date} className="page-section" aria-label={group.label}>
              <h3 className="list-group__header">{group.label}</h3>
              <div className="card">
                <ul className="list-group" role="list">
                  {group.transactions.map((transaction) => (
                    <li key={transaction.id} className="list-item" role="listitem">
                      <div className="list-item__content">
                        <p className="list-item__primary">
                          {transaction.payee ??
                            transaction.note ??
                            (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')}
                        </p>
                        <p className="list-item__secondary">
                          {transaction.categoryId !== null
                            ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                            : 'Uncategorized'}{' '}
                          &middot; {accountNames.get(transaction.accountId) ?? 'Unknown account'}
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
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
};

export default TransactionsPage;
