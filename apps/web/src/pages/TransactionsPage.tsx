// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  BulkActionsToolbar,
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { TransactionForm } from '../components/forms';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts } from '../hooks/useAccounts';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import type { Transaction } from '../kmp/bridge';
import '../styles/bulk-actions.css';

const ALL_CATEGORIES_FILTER = '__all__';

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

export const TransactionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORIES_FILTER);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);

  const {
    selectedIds,
    isSelected,
    toggle: toggleSelection,
    selectAll,
    deselectAll,
    selectedCount,
  } = useBulkSelection();

  const filters = useMemo(
    () => ({
      searchTerm: query.trim() || undefined,
      categoryId: selectedCategoryId === ALL_CATEGORIES_FILTER ? undefined : selectedCategoryId,
    }),
    [query, selectedCategoryId],
  );

  const {
    transactions,
    loading,
    error,
    refresh: refreshTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactions(filters);
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

  const handleOpenCreateForm = useCallback(() => {
    setEditingTransaction(null);
    setIsFormOpen(true);
  }, []);

  const handleEditTransaction = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsFormOpen(true);
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

  // -----------------------------------------------------------------------
  // Bulk action handlers
  // -----------------------------------------------------------------------

  const handleToggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => {
      if (prev) {
        deselectAll();
      }
      return !prev;
    });
  }, [deselectAll]);

  const handleSelectAll = useCallback(() => {
    const allIds = transactions.map((t) => t.id);
    selectAll(allIds);
  }, [selectAll, transactions]);

  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id));

  const handleSelectAllToggle = useCallback(() => {
    if (allSelected) {
      deselectAll();
    } else {
      handleSelectAll();
    }
  }, [allSelected, deselectAll, handleSelectAll]);

  const handleBulkDelete = useCallback(() => {
    for (const id of selectedIds) {
      deleteTransaction(id);
    }
    deselectAll();
    refreshTransactions();
  }, [deleteTransaction, deselectAll, refreshTransactions, selectedIds]);

  const handleBulkCategorize = useCallback(
    (categoryId: string) => {
      for (const id of selectedIds) {
        updateTransaction(id, { categoryId });
      }
      deselectAll();
      refreshTransactions();
    },
    [deselectAll, refreshTransactions, selectedIds, updateTransaction],
  );

  const handleBulkExport = useCallback(() => {
    const selected = transactions.filter((t) => selectedIds.has(t.id));
    const header = 'Date,Payee,Amount,Type,Category,Account,Note';
    const rows = selected.map((t) => {
      const payee = (t.payee ?? '').replace(/"/g, '""');
      const note = (t.note ?? '').replace(/"/g, '""');
      const categoryName =
        t.categoryId !== null
          ? (categoryNames.get(t.categoryId) ?? 'Uncategorized')
          : 'Uncategorized';
      const accountName = accountNames.get(t.accountId) ?? 'Unknown';
      const amount = getTransactionDisplayAmount(t);

      return `${t.date},"${payee}",${amount},${t.type},"${categoryName}","${accountName}","${note}"`;
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'transactions-export.csv');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [transactions, selectedIds, categoryNames, accountNames]);

  const handleBulkDeselectAll = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

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
          className={`select-mode-toggle${isSelectMode ? ' select-mode-toggle--active' : ''}`}
          onClick={handleToggleSelectMode}
          aria-pressed={isSelectMode}
          aria-label={isSelectMode ? 'Exit select mode' : 'Enter select mode'}
        >
          <span aria-hidden="true">☑️</span> {isSelectMode ? 'Cancel' : 'Select'}
        </button>
        <button
          type="button"
          className="add-button"
          onClick={() => navigate('/import')}
          aria-label="Import transactions from CSV"
          style={{ marginRight: 'var(--spacing-2)' }}
        >
          <span aria-hidden="true">📥</span> Import CSV
        </button>
        <button
          type="button"
          className="add-button"
          onClick={handleOpenCreateForm}
          aria-label="Add new transaction"
        >
          <span aria-hidden="true">+</span> Add Transaction
        </button>
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

      {isSelectMode && selectedCount > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedCount}
          onCategorize={handleBulkCategorize}
          onDelete={handleBulkDelete}
          onExport={handleBulkExport}
          onDeselectAll={handleBulkDeselectAll}
          categories={categories}
        />
      )}

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
          {isSelectMode && (
            <div className="bulk-select-all-header">
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAllToggle}
                  aria-label="Select all transactions"
                />
                Select all
              </label>
            </div>
          )}
          {groupedTransactions.map((group) => (
            <section key={group.date} className="page-section" aria-label={group.label}>
              <h3 className="list-group__header">{group.label}</h3>
              <div className="card">
                <ul className="list-group" role="list">
                  {group.transactions.map((transaction) => {
                    const transactionLabel = getTransactionLabel(transaction);

                    return (
                      <li key={transaction.id} className="list-item" role="listitem">
                        {isSelectMode && (
                          <div className="transaction-select-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected(transaction.id)}
                              onChange={() => toggleSelection(transaction.id)}
                              aria-label={`Select transaction: ${transactionLabel}`}
                            />
                          </div>
                        )}
                        <div className="list-item__content">
                          <Link
                            to={`/transactions/${transaction.id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                            aria-label={`View details for ${transactionLabel}`}
                          >
                            <p className="list-item__primary">{transactionLabel}</p>
                          </Link>
                          <p className="list-item__secondary">
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
