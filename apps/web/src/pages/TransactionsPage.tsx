// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon } from '../components/icons';

import {
  CategoryDropZone,
  ConfirmDialog,
  CurrencyDisplay,
  DragDropProvider,
  DraggableTransaction,
  EmptyState,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
  SyncIndicator,
  useToast,
} from '../components/common';
import { SwipeableRow } from '../components/common/SwipeableRow';
import { BulkEditToolbar, TransactionForm } from '../components/forms';
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
import { useAutoCategory } from '../hooks/useAutoCategory';
import { useCategories } from '../hooks/useCategories';
import { useBulkTransactions } from '../hooks/useBulkTransactions';
import { useAccessibility } from '../hooks/useAccessibility';
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

function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
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
  const { isSimplified, speakAmounts, speakAmount } = useAccessibility();
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
  const { suggestCategory } = useAutoCategory(categories);
  const toast = useOptionalToast();

  // Apply advanced local filters, then sort
  const transactions = useMemo(() => {
    const filtered = applyAdvancedFilters(rawTransactions, advancedFilters);
    return sortTransactions(filtered, sortConfig, categoryNames);
  }, [rawTransactions, advancedFilters, sortConfig, categoryNames]);
  const {
    selectedIds,
    selectionCount,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    bulkUpdate,
    bulkDelete,
  } = useBulkTransactions(transactions, refreshTransactions);
  const transactionLookup = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  useEffect(() => {
    if (transactions.length === 0 || toast === null || typeof window === 'undefined') {
      return;
    }

    const tipStorageKey = 'transactions-swipe-actions-tip-shown';
    if (window.localStorage.getItem(tipStorageKey) === 'true') {
      return;
    }

    toast.showToast({
      type: 'info',
      message: 'Tip: swipe right to triage quickly, or swipe left for more actions.',
      duration: 7000,
    });
    window.localStorage.setItem(tipStorageKey, 'true');
  }, [toast, transactions.length]);

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

  const handleQuickCategorize = useCallback(
    (transaction: Transaction, categoryId: string, categoryName: string) => {
      const result = updateTransaction(transaction.id, { categoryId });
      if (result === null) {
        toast?.showToast({
          type: 'error',
          message: `Could not categorize ${getTransactionLabel(transaction)}.`,
        });
        return;
      }

      refreshTransactions();
      toast?.showToast({
        type: 'success',
        message: `Categorized ${getTransactionLabel(transaction)} as ${categoryName}.`,
      });
    },
    [refreshTransactions, toast, updateTransaction],
  );

  const handleMarkReviewed = useCallback(
    (transaction: Transaction) => {
      const nextStatus = transaction.status === 'PENDING' ? 'CLEARED' : 'RECONCILED';
      if (nextStatus === transaction.status) {
        return;
      }

      const result = updateTransaction(transaction.id, { status: nextStatus });
      if (result === null) {
        toast?.showToast({
          type: 'error',
          message: `Could not mark ${getTransactionLabel(transaction)} as reviewed.`,
        });
        return;
      }

      refreshTransactions();
      toast?.showToast({
        type: 'success',
        message: `Marked ${getTransactionLabel(transaction)} as reviewed.`,
      });
    },
    [refreshTransactions, toast, updateTransaction],
  );

  const handleDropRecategorize = useCallback(
    (draggedTransactionIds: readonly string[], categoryId: string | null, categoryName: string) => {
      const uniqueIds = Array.from(new Set(draggedTransactionIds));
      if (uniqueIds.length === 0) {
        return false;
      }

      const existingTransactions = uniqueIds
        .map((transactionId) => transactionLookup.get(transactionId))
        .filter((transaction): transaction is Transaction => transaction !== undefined);
      if (existingTransactions.length === 0) {
        return false;
      }

      const transactionsNeedingChange = existingTransactions.filter(
        (transaction) => transaction.categoryId !== categoryId,
      );

      if (transactionsNeedingChange.length === 0) {
        toast?.showToast({
          type: 'info',
          message:
            uniqueIds.length > 1
              ? `Selected transactions are already in ${categoryName}.`
              : `${getTransactionLabel(existingTransactions[0])} is already in ${categoryName}.`,
        });
        return false;
      }

      if (uniqueIds.length > 1) {
        const result = bulkUpdate({ categoryId });
        if (result.successCount === 0) {
          toast?.showToast({
            type: 'error',
            message: `Could not move the selected transactions to ${categoryName}.`,
          });
          return false;
        }

        toast?.showToast({
          type: result.failureCount > 0 ? 'warning' : 'success',
          message:
            result.failureCount > 0
              ? `Moved ${result.successCount} of ${uniqueIds.length} transactions to ${categoryName}.`
              : `Moved ${result.successCount} transactions to ${categoryName}.`,
        });
        return true;
      }

      const transaction = existingTransactions[0];
      if (transaction === undefined) {
        return false;
      }

      const result = updateTransaction(transaction.id, { categoryId });
      if (result === null) {
        toast?.showToast({
          type: 'error',
          message: `Could not categorize ${getTransactionLabel(transaction)}.`,
        });
        return false;
      }

      if (selectedIds.has(transaction.id)) {
        clearSelection();
      }

      toast?.showToast({
        type: 'success',
        message: `Categorized ${getTransactionLabel(transaction)} as ${categoryName}.`,
      });
      return true;
    },
    [bulkUpdate, clearSelection, selectedIds, toast, transactionLookup, updateTransaction],
  );

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
    <DragDropProvider>
      <>
        <OfflineBanner />
        <div className={`transactions-page${isSimplified ? ' transactions-page--simplified' : ''}`}>
          <div className="transactions-page-header">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--type-scale-headline-font-size)',
                  fontWeight: 'var(--type-scale-headline-font-weight)',
                  margin: 0,
                }}
              >
                Transactions
              </h2>
              <ExplainThis
                tipKey="fixedVsVariableExpenses"
                buttonLabel="Explain fixed versus variable expenses"
              />
            </div>
            <SyncIndicator className="transactions-page-header__sync-indicator" />
            {!isSimplified ? (
              <>
                <button
                  type="button"
                  className="add-button"
                  onClick={() => exportTransactionsCsv(transactions, categoryNames, accountNames)}
                  aria-label="Export transactions as CSV"
                  disabled={transactions.length === 0}
                  style={{ marginRight: 'var(--spacing-2)' }}
                >
                  <AppIcon name="upload" /> Export CSV
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
                        <AppIcon name="edit" /> Manual Entry
                      </button>
                      <button
                        type="button"
                        className="add-transaction-dropdown__item"
                        role="menuitem"
                        onClick={handleImportFromFile}
                      >
                        <AppIcon name="download" /> Import from File
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button type="button" className="add-button" onClick={handleOpenCreateForm}>
                <PlusIcon />
                Add income or expense
              </button>
            )}
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
          {!isSimplified ? (
            <>
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

              <BulkEditToolbar
                selectionCount={selectionCount}
                totalCount={transactions.length}
                categories={categories}
                onSelectAll={selectAll}
                onClearSelection={clearSelection}
                onBulkUpdate={bulkUpdate}
                onBulkDelete={bulkDelete}
              />
              <CategoryDropZone
                categories={categories}
                onDropTransactions={handleDropRecategorize}
              />
            </>
          ) : null}

          {isLoading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}
            >
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
                        const autoCategory = suggestCategory(
                          transaction.payee?.trim() ||
                            transaction.note?.trim() ||
                            transaction.counterpartyName?.trim() ||
                            '',
                          Math.abs(transaction.amount.amount),
                        );
                        const canQuickCategorize =
                          autoCategory !== null &&
                          autoCategory.categoryId !== transaction.categoryId;
                        const leftSwipeActions = [
                          ...(canQuickCategorize && autoCategory !== null
                            ? [
                                {
                                  id: 'categorize',
                                  label: `Categorize`,
                                  icon: <AppIcon name="tag" />,
                                  variant: 'success' as const,
                                  onAction: () =>
                                    handleQuickCategorize(
                                      transaction,
                                      autoCategory.categoryId,
                                      autoCategory.categoryName,
                                    ),
                                },
                              ]
                            : []),
                          {
                            id: 'edit',
                            label: 'Edit',
                            icon: <AppIcon name="edit" />,
                            onAction: () => handleEditTransaction(transaction),
                          },
                          {
                            id: 'delete',
                            label: 'Delete',
                            icon: <AppIcon name="trash" />,
                            variant: 'danger' as const,
                            onAction: () => setDeletingTransaction(transaction),
                          },
                        ];
                        const rightSwipeActions =
                          canQuickCategorize && autoCategory !== null
                            ? [
                                {
                                  id: 'categorize',
                                  label: `Categorize`,
                                  icon: <AppIcon name="tag" />,
                                  variant: 'success' as const,
                                  quick: true,
                                  onAction: () =>
                                    handleQuickCategorize(
                                      transaction,
                                      autoCategory.categoryId,
                                      autoCategory.categoryName,
                                    ),
                                },
                              ]
                            : transaction.status !== 'RECONCILED'
                              ? [
                                  {
                                    id: 'review',
                                    label: 'Mark reviewed',
                                    icon: <AppIcon name="check-circle" />,
                                    variant: 'default' as const,
                                    quick: true,
                                    onAction: () => handleMarkReviewed(transaction),
                                  },
                                ]
                              : [];

                        const dragTransactionIds =
                          isSelected(transaction.id) && selectionCount > 1
                            ? Array.from(selectedIds)
                            : [transaction.id];

                        const transactionRow = (
                          <SwipeableRow
                            aria-label={`Actions for ${transactionLabel}`}
                            contentClassName={`list-item${!isSimplified && isSelected(transaction.id) ? ' transaction-list-item--selected' : ''}`}
                            leftActions={leftSwipeActions}
                            rightActions={rightSwipeActions}
                          >
                            {!isSimplified ? (
                              <div className="transaction-list-item__selection">
                                <input
                                  type="checkbox"
                                  className="bulk-select-checkbox"
                                  checked={isSelected(transaction.id)}
                                  onChange={() => toggleSelection(transaction.id)}
                                  aria-label={`Select ${transactionLabel}`}
                                />
                              </div>
                            ) : null}
                            <div className="list-item__content">
                              <Link
                                to={`/transactions/${transaction.id}`}
                                style={{ textDecoration: 'none', color: 'inherit' }}
                                aria-label={`View details for ${transactionLabel}`}
                              >
                                <p className="list-item__primary">{transactionLabel}</p>
                              </Link>
                              <p className="list-item__secondary">
                                {isSimplified
                                  ? transaction.categoryId !== null
                                    ? (categoryNames.get(transaction.categoryId) ?? 'Uncategorized')
                                    : 'Uncategorized'
                                  : `${transaction.counterpartyName ? `${transaction.counterpartyName} · ` : ''}${
                                      transaction.categoryId !== null
                                        ? (categoryNames.get(transaction.categoryId) ??
                                          'Uncategorized')
                                        : 'Uncategorized'
                                    } · ${accountNames.get(transaction.accountId) ?? 'Unknown account'}`}
                              </p>
                              {isSimplified ? (
                                <p className="transaction-list-item__support">
                                  Account:{' '}
                                  {accountNames.get(transaction.accountId) ?? 'Unknown account'}
                                </p>
                              ) : null}
                            </div>
                            <div className="list-item__trailing transaction-list-item__trailing">
                              <div className="transaction-list-item__amount">
                                <CurrencyDisplay
                                  amount={getTransactionDisplayAmount(transaction)}
                                  currency={transaction.currency.code}
                                  colorize
                                  showSign
                                  context={`${transactionLabel} transaction amount`}
                                />
                              </div>
                              {speakAmounts ? (
                                <button
                                  type="button"
                                  className="transaction-item__text-action transactions-page__speech-button"
                                  onClick={() =>
                                    speakAmount(
                                      getTransactionDisplayAmount(transaction),
                                      transaction.currency.code,
                                      `${transactionLabel} transaction amount`,
                                    )
                                  }
                                >
                                  Read amount
                                </button>
                              ) : null}
                              <div
                                className="transaction-item__actions"
                                aria-label="Transaction actions"
                              >
                                {isSimplified ? (
                                  <>
                                    <button
                                      type="button"
                                      className="transaction-item__text-action"
                                      onClick={() => handleEditTransaction(transaction)}
                                      aria-label={`Edit ${transactionLabel}`}
                                    >
                                      Edit details
                                    </button>
                                    <button
                                      type="button"
                                      className="transaction-item__text-action transaction-item__text-action--danger"
                                      onClick={() => setDeletingTransaction(transaction)}
                                      aria-label={`Delete ${transactionLabel}`}
                                    >
                                      Delete
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="icon-button transaction-item__action"
                                      onClick={() => handleEditTransaction(transaction)}
                                      aria-label={`Edit ${transactionLabel}`}
                                    >
                                      <AppIcon name="edit" />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-button transaction-item__action transaction-item__action--delete"
                                      onClick={() => setDeletingTransaction(transaction)}
                                      aria-label={`Delete ${transactionLabel}`}
                                    >
                                      <AppIcon name="trash" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </SwipeableRow>
                        );

                        return (
                          <li key={transaction.id} role="listitem">
                            {isSimplified ? (
                              transactionRow
                            ) : (
                              <DraggableTransaction
                                transactionId={transaction.id}
                                label={transactionLabel}
                                dragTransactionIds={dragTransactionIds}
                              >
                                {transactionRow}
                              </DraggableTransaction>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

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
    </DragDropProvider>
  );
};

export default TransactionsPage;
