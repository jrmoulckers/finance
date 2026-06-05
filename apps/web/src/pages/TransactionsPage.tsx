// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { TransactionForm } from '../components/forms';
import { OfflineBanner } from '../components/OfflineBanner';
import {
  TransactionFilters,
  TransactionSort,
  TransactionEditPanel,
  DEFAULT_SORT,
} from '../components/transactions';
import type { AdvancedFilters } from '../components/transactions';
import type { SortConfig, SortField } from '../components/transactions';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import type { Transaction } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// URL param helpers for filter/sort persistence
// ---------------------------------------------------------------------------

function filtersFromParams(params: URLSearchParams): AdvancedFilters {
  return {
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? '',
    categoryIds: params.get('categoryIds') ? params.get('categoryIds')!.split(',') : [],
    accountIds: params.get('accountIds') ? params.get('accountIds')!.split(',') : [],
    amountMin: params.get('amountMin') ?? '',
    amountMax: params.get('amountMax') ?? '',
    types: params.get('types') ? (params.get('types')!.split(',') as AdvancedFilters['types']) : [],
    statuses: params.get('statuses')
      ? (params.get('statuses')!.split(',') as AdvancedFilters['statuses'])
      : [],
  };
}

function filtersToParams(filters: AdvancedFilters): Record<string, string> {
  const result: Record<string, string> = {};
  if (filters.startDate) result.startDate = filters.startDate;
  if (filters.endDate) result.endDate = filters.endDate;
  if (filters.categoryIds.length > 0) result.categoryIds = filters.categoryIds.join(',');
  if (filters.accountIds.length > 0) result.accountIds = filters.accountIds.join(',');
  if (filters.amountMin) result.amountMin = filters.amountMin;
  if (filters.amountMax) result.amountMax = filters.amountMax;
  if (filters.types.length > 0) result.types = filters.types.join(',');
  if (filters.statuses.length > 0) result.statuses = filters.statuses.join(',');
  return result;
}

function sortFromParams(params: URLSearchParams): SortConfig {
  const field = params.get('sortField') as SortField | null;
  const direction = params.get('sortDir') as 'asc' | 'desc' | null;
  return {
    field: field ?? DEFAULT_SORT.field,
    direction: direction ?? DEFAULT_SORT.direction,
  };
}

// ---------------------------------------------------------------------------
// CSV export helpers
// ---------------------------------------------------------------------------

/** Escape a value for safe CSV inclusion. */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Export transactions to CSV and trigger a browser download. */
function exportTransactionsCsv(
  transactions: Transaction[],
  categoryNames: Map<string, string>,
  accountNames: Map<string, string>,
): void {
  const headers = ['date', 'payee', 'amount', 'category', 'account', 'notes'];
  const rows = transactions.map((t) => {
    const amount = (t.type === 'EXPENSE' ? -Math.abs(t.amount.amount) : t.amount.amount) / 100;
    return [
      escapeCsvValue(t.date),
      escapeCsvValue(t.payee ?? ''),
      amount.toFixed(2),
      escapeCsvValue(
        t.categoryId ? (categoryNames.get(t.categoryId) ?? 'Uncategorized') : 'Uncategorized',
      ),
      escapeCsvValue(accountNames.get(t.accountId) ?? 'Unknown'),
      escapeCsvValue(t.note ?? ''),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(anchor);
  }, 100);
}

// ---------------------------------------------------------------------------
// Transaction display helpers
// ---------------------------------------------------------------------------

function getTransactionDisplayAmount(transaction: Transaction): number {
  if (transaction.type === 'EXPENSE') {
    return -Math.abs(transaction.amount.amount);
  }
  return transaction.amount.amount;
}

function getTransactionLabel(transaction: Transaction): string {
  return (
    transaction.payee?.trim() ||
    transaction.note?.trim() ||
    (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 3.25v9.5M3.25 8h9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4.5 6.25 8 9.75l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3.25 11.75 3 13l1.25-.25 7.35-7.35-1-1-7.35 7.35Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.9 3.7.7-.7a1.1 1.1 0 0 1 1.55 0l.85.85a1.1 1.1 0 0 1 0 1.55l-.7.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 2.75v6.5m0 0L5.5 6.75M8 9.25l2.5-2.5M3.25 10.5v1.75c0 .55.45 1 1 1h7.5c.55 0 1-.45 1-1V10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sort logic
// ---------------------------------------------------------------------------

function sortTransactions(
  transactions: Transaction[],
  sort: SortConfig,
  categoryNames: Map<string, string>,
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

    // Secondary sort: always by date descending for non-date primary sorts
    if (comparison === 0 && sort.field !== 'date') {
      comparison = b.date.localeCompare(a.date);
    }

    return comparison;
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// Local filtering (advanced filters applied on top of hook results)
// ---------------------------------------------------------------------------

function applyAdvancedFilters(
  transactions: Transaction[],
  filters: AdvancedFilters,
): Transaction[] {
  let result = transactions;

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

  return result;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export const TransactionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editPanelTransaction, setEditPanelTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Get filters/sort from URL params
  const advancedFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const sortConfig = useMemo(() => sortFromParams(searchParams), [searchParams]);

  // Build hook filters from URL params + search query
  const hookFilters = useMemo(
    () => ({
      searchTerm: query.trim() || undefined,
      startDate: advancedFilters.startDate || undefined,
      endDate: advancedFilters.endDate || undefined,
    }),
    [query, advancedFilters.startDate, advancedFilters.endDate],
  );

  const {
    transactions: rawTransactions,
    loading,
    error,
    refresh: refreshTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(hookFilters);
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

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  // Apply advanced local filters, then sort
  const transactions = useMemo(() => {
    const filtered = applyAdvancedFilters(rawTransactions, advancedFilters);
    return sortTransactions(filtered, sortConfig, categoryNames);
  }, [rawTransactions, advancedFilters, sortConfig, categoryNames]);

  // Group by date for display
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

  // Filter/Sort handlers
  const handleFiltersChange = useCallback(
    (newFilters: AdvancedFilters) => {
      const params = { ...filtersToParams(newFilters) };
      if (sortConfig.field !== DEFAULT_SORT.field) params.sortField = sortConfig.field;
      if (sortConfig.direction !== DEFAULT_SORT.direction) params.sortDir = sortConfig.direction;
      setSearchParams(params, { replace: true });
    },
    [sortConfig, setSearchParams],
  );

  const handleSortChange = useCallback(
    (newSort: SortConfig) => {
      const params = { ...filtersToParams(advancedFilters) };
      if (newSort.field !== DEFAULT_SORT.field) params.sortField = newSort.field;
      if (newSort.direction !== DEFAULT_SORT.direction) params.sortDir = newSort.direction;
      setSearchParams(params, { replace: true });
    },
    [advancedFilters, setSearchParams],
  );

  // Form handlers
  const handleOpenCreateForm = useCallback(() => {
    setEditingTransaction(null);
    setIsFormOpen(true);
    setAddMenuOpen(false);
  }, []);

  /** Navigate to the import wizard from the Add Transaction dropdown. */
  const handleImportFromFile = useCallback(() => {
    setAddMenuOpen(false);
    navigate('/import/wizard');
  }, [navigate]);

  /** Close the add menu when clicking outside. */
  useEffect(() => {
    if (!addMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addMenuOpen]);

  const handleEditTransaction = useCallback((transaction: Transaction) => {
    setEditPanelTransaction(transaction);
  }, []);

  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
    setEditingTransaction(null);
  }, []);

  const handleTransactionSubmit = useCallback(
    async (data: CreateTransactionInput): Promise<void> => {
      if (editingTransaction !== null) {
        const result = updateTransaction(editingTransaction.id, data);
        if (result === null) {
          throw new Error('Failed to update transaction. Please try again.');
        }
      } else {
        const result = createTransaction(data);
        if (result === null) {
          throw new Error('Failed to create transaction. Please try again.');
        }
      }

      handleFormCancel();
      refreshTransactions();
    },
    [
      createTransaction,
      editingTransaction,
      handleFormCancel,
      refreshTransactions,
      updateTransaction,
    ],
  );

  const handleEditPanelSave = useCallback(
    async (id: string, data: CreateTransactionInput): Promise<void> => {
      const result = updateTransaction(id, data);
      if (result === null) {
        throw new Error('Failed to update transaction. Please try again.');
      }
      setEditPanelTransaction(null);
      refreshTransactions();
    },
    [updateTransaction, refreshTransactions],
  );

  const handleEditPanelClose = useCallback(() => {
    setEditPanelTransaction(null);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (deletingTransaction === null) {
      return;
    }

    const deleted = deleteTransaction(deletingTransaction.id);
    if (deleted) {
      setDeletingTransaction(null);
      refreshTransactions();
    }
  }, [deleteTransaction, deletingTransaction, refreshTransactions]);

  const hasActiveFilters =
    query.trim() !== '' ||
    advancedFilters.startDate !== '' ||
    advancedFilters.endDate !== '' ||
    advancedFilters.categoryIds.length > 0 ||
    advancedFilters.accountIds.length > 0 ||
    advancedFilters.amountMin !== '' ||
    advancedFilters.amountMax !== '' ||
    advancedFilters.types.length > 0 ||
    advancedFilters.statuses.length > 0;

  return (
    <>
      <OfflineBanner />
      <div className="transactions-page-header">
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
          }}
        >
          Transactions
        </h2>
        <button
          type="button"
          className="add-button"
          onClick={() => exportTransactionsCsv(transactions, categoryNames, accountNames)}
          aria-label="Export transactions as CSV"
          disabled={transactions.length === 0}
          style={{ marginRight: 'var(--spacing-2)' }}
        >
          <span aria-hidden="true">📤</span> Export CSV
        </button>
        <div className="add-transaction-menu" ref={addMenuRef}>
          <div className="add-transaction-split-button">
            <button
              type="button"
              className="add-button add-transaction-split-button__primary"
              onClick={handleOpenCreateForm}
            >
              <PlusIcon />
              Add Transaction
            </button>
            <button
              type="button"
              className="add-button add-transaction-split-button__toggle"
              onClick={() => setAddMenuOpen((prev) => !prev)}
              aria-label="Open transaction options"
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
            >
              <ChevronDownIcon />
            </button>
          </div>
          {addMenuOpen && (
            <div
              className="add-transaction-dropdown"
              role="menu"
              aria-label="Add transaction options"
            >
              <button
                type="button"
                className="add-transaction-dropdown__item"
                role="menuitem"
                onClick={handleOpenCreateForm}
              >
                <PencilIcon />
                Manual Entry
              </button>
              <button
                type="button"
                className="add-transaction-dropdown__item"
                role="menuitem"
                onClick={handleImportFromFile}
              >
                <ImportIcon />
                Import from File
              </button>
            </div>
          )}
        </div>
      </div>

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

      {/* Filter/Sort controls */}
      <div className="transaction-controls-bar">
        <div className="transaction-controls-bar__left">
          <TransactionFilters
            filters={advancedFilters}
            onChange={handleFiltersChange}
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((o) => !o)}
            categories={categories}
            accounts={accounts}
          />
        </div>
        <TransactionSort sort={sortConfig} onChange={handleSortChange} />
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
              ? 'Try adjusting your search or filters.'
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
                  {group.transactions.map((transaction) => {
                    const transactionLabel = getTransactionLabel(transaction);

                    return (
                      <li key={transaction.id} className="list-item" role="listitem">
                        <div className="list-item__content">
                          <Link
                            to={`/transactions/${transaction.id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                            aria-label={`View details for ${transactionLabel}`}
                          >
                            <p className="list-item__primary">{transactionLabel}</p>
                          </Link>
                          <p className="list-item__secondary">
                            {transaction.counterpartyName
                              ? `${transaction.counterpartyName} · `
                              : ''}
                            {transaction.categoryId !== null
                              ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                              : 'Uncategorized'}{' '}
                            &middot; {accountNames.get(transaction.accountId) ?? 'Unknown account'}
                          </p>
                        </div>
                        <div className="list-item__trailing transaction-list-item__trailing">
                          <div className="transaction-list-item__amount">
                            <CurrencyDisplay
                              amount={getTransactionDisplayAmount(transaction)}
                              currency={transaction.currency.code}
                              colorize
                              showSign
                            />
                          </div>
                          <div
                            className="transaction-item__actions"
                            aria-label="Transaction actions"
                          >
                            <button
                              type="button"
                              className="icon-button transaction-item__action"
                              onClick={() => handleEditTransaction(transaction)}
                              aria-label={`Edit ${transactionLabel}`}
                            >
                              <span aria-hidden="true">✏️</span>
                            </button>
                            <button
                              type="button"
                              className="icon-button transaction-item__action transaction-item__action--delete"
                              onClick={() => setDeletingTransaction(transaction)}
                              aria-label={`Delete ${transactionLabel}`}
                            >
                              <span aria-hidden="true">🗑️</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}

      <TransactionForm
        isOpen={isFormOpen}
        accounts={accounts}
        categories={categories}
        initialData={editingTransaction ?? undefined}
        onSubmit={handleTransactionSubmit}
        onCancel={handleFormCancel}
      />

      <TransactionEditPanel
        transaction={editPanelTransaction}
        accounts={accounts}
        categories={categories}
        onSave={handleEditPanelSave}
        onClose={handleEditPanelClose}
      />

      <ConfirmDialog
        isOpen={deletingTransaction !== null}
        title="Delete Transaction"
        message={
          deletingTransaction !== null
            ? `Are you sure you want to delete "${getTransactionLabel(deletingTransaction)}"?`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTransaction(null)}
      />
    </>
  );
};

export default TransactionsPage;
