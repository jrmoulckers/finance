// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon } from '../components/icons';

import { AccountPurposeFilterControl } from '../components/accounts';
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
  LazyReceiptImage,
  DEFAULT_SORT,
} from '../components/transactions';
import type { AdvancedFilters } from '../components/transactions';
import type { SortConfig, SortField } from '../components/transactions';
import { TransactionBulkActionsToolbar } from '../components/transactions/TransactionBulkActionsToolbar';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts } from '../hooks/useAccounts';
import { useBulkTransactions } from '../hooks/useBulkTransactions';
import { useCategories } from '../hooks/useCategories';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { recordPwaMeaningfulAction } from '../hooks/useInstallPrompt';
import { useFontScale } from '../hooks/useFontScale';
import { useTransactions } from '../hooks/useTransactions';
import { useVirtualList } from '../hooks/useVirtualList';
import type { Transaction } from '../kmp/bridge';
import {
  filterAccountsByPurpose,
  filterTransactionsByAccountPurpose,
  type AccountPurposeFilter,
} from '../lib/accountPurpose';
import { chooseLargeTextReflow } from '../lib/a11y/large-text-reflow';

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

const VIRTUAL_REGISTER_THRESHOLD = 200;
const VIRTUAL_REGISTER_ROW_HEIGHT = 76;
const VIRTUAL_REGISTER_OVERSCAN = 16;

interface TransactionRegisterHeaderRow {
  readonly kind: 'header';
  readonly id: string;
  readonly label: string;
}

interface TransactionRegisterTransactionRow {
  readonly kind: 'transaction';
  readonly id: string;
  readonly transaction: Transaction;
  readonly transactionPosition: number;
}

type TransactionRegisterRow = TransactionRegisterHeaderRow | TransactionRegisterTransactionRow;

function getRegisterViewportHeight(): number {
  if (typeof window === 'undefined') return 640;
  return Math.min(720, Math.max(360, window.innerHeight - 280));
}

function flattenTransactionGroups(
  groups: Array<{ date: string; label: string; transactions: Transaction[] }>,
): TransactionRegisterRow[] {
  let transactionPosition = 0;
  return groups.flatMap((group) => [
    { kind: 'header' as const, id: `header-${group.date}`, label: group.label },
    ...group.transactions.map((transaction) => ({
      kind: 'transaction' as const,
      id: transaction.id,
      transaction,
      transactionPosition: ++transactionPosition,
    })),
  ]);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editPanelTransaction, setEditPanelTransaction] = useState<Transaction | null>(null);
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState<AccountPurposeFilter>('all');
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const { scale: inAppTextScale } = useFontScale();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  const addMenuRef = useRef<HTMLDivElement>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const transactionRowRefs = useRef(new Map<string, HTMLElement>());

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
  const visibleFilterAccounts = useMemo(
    () => filterAccountsByPurpose(accounts, selectedPurposeFilter),
    [accounts, selectedPurposeFilter],
  );

  // Apply purpose filter, advanced local filters, then sort
  const transactions = useMemo(() => {
    const purposeFiltered = filterTransactionsByAccountPurpose(
      rawTransactions,
      accounts,
      selectedPurposeFilter,
    );
    const filtered = applyAdvancedFilters(purposeFiltered, advancedFilters);
    return sortTransactions(filtered, sortConfig, categoryNames);
  }, [
    rawTransactions,
    accounts,
    selectedPurposeFilter,
    advancedFilters,
    sortConfig,
    categoryNames,
  ]);

  const bulkTransactions = useBulkTransactions(transactions, refreshTransactions);

  const selectedTransactionTags = useMemo(() => {
    const tags = new Set<string>();
    for (const transaction of bulkTransactions.selectedTransactions) {
      for (const tag of transaction.tags ?? []) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }, [bulkTransactions.selectedTransactions]);

  const allVisibleSelected =
    transactions.length > 0 && bulkTransactions.selectionCount === transactions.length;
  const someVisibleSelected = bulkTransactions.selectionCount > 0 && !allVisibleSelected;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

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

  const transactionRegisterRows = useMemo(
    () => flattenTransactionGroups(groupedTransactions),
    [groupedTransactions],
  );
  const [registerViewportHeight, setRegisterViewportHeight] = useState(getRegisterViewportHeight);
  useEffect(() => {
    const handleResize = () => setRegisterViewportHeight(getRegisterViewportHeight());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const virtualRegister = useVirtualList({
    items: transactionRegisterRows,
    itemHeight: VIRTUAL_REGISTER_ROW_HEIGHT,
    containerHeight: registerViewportHeight,
    overscan: VIRTUAL_REGISTER_OVERSCAN,
  });
  const largeTextReflow = useMemo(
    () =>
      chooseLargeTextReflow({
        viewportWidth,
        browserZoomPercent: 100,
        inAppScale: inAppTextScale,
        hasDenseData: true,
      }),
    [inAppTextScale, viewportWidth],
  );
  const useCardRegister = largeTextReflow.mode === 'card-alternative';
  const useVirtualRegister =
    !useCardRegister && transactionRegisterRows.length > VIRTUAL_REGISTER_THRESHOLD;
  const virtualRowIndexByTransactionId = useMemo(() => {
    const indexes = new Map<string, number>();
    transactionRegisterRows.forEach((row, index) => {
      if (row.kind === 'transaction') indexes.set(row.transaction.id, index);
    });
    return indexes;
  }, [transactionRegisterRows]);
  const transactionPositionById = useMemo(
    () => new Map(transactions.map((transaction, index) => [transaction.id, index + 1])),
    [transactions],
  );

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

  useEffect(() => {
    if (searchParams.get('new') !== 'transaction') return;

    handleOpenCreateForm();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('new');
    setSearchParams(nextParams, { replace: true });
  }, [handleOpenCreateForm, searchParams, setSearchParams]);

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

      recordPwaMeaningfulAction();
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
      recordPwaMeaningfulAction();
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
      recordPwaMeaningfulAction();
      setDeletingTransaction(null);
      refreshTransactions();
    }
  }, [deleteTransaction, deletingTransaction, refreshTransactions]);

  const handleBulkDeleteConfirm = useCallback(() => {
    bulkTransactions.bulkDelete();
    recordPwaMeaningfulAction();
    setBulkDeleteDialogOpen(false);
  }, [bulkTransactions]);

  const handleTransactionSelection = useCallback(
    (transaction: Transaction, selected: boolean, shiftKey: boolean) => {
      setActiveTransactionId(transaction.id);
      if (shiftKey) {
        bulkTransactions.selectRange(transaction.id, selected);
      } else {
        bulkTransactions.setSelection(transaction.id, selected);
      }
    },
    [bulkTransactions],
  );

  const focusTransactionRow = useCallback(
    (transactionId: string) => {
      const focusRow = () => transactionRowRefs.current.get(transactionId)?.focus();
      if (useVirtualRegister && !transactionRowRefs.current.has(transactionId)) {
        const virtualIndex = virtualRowIndexByTransactionId.get(transactionId);
        if (virtualIndex !== undefined) {
          virtualRegister.scrollToIndex(virtualIndex, 'center');
        }
      }
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(focusRow);
      } else {
        focusRow();
      }
    },
    [useVirtualRegister, virtualRegister, virtualRowIndexByTransactionId],
  );

  const handleListNavigate = useCallback(
    (direction: -1 | 1) => {
      if (transactions.length === 0) return;

      const currentIndex = activeTransactionId
        ? transactions.findIndex((transaction) => transaction.id === activeTransactionId)
        : -1;
      const nextIndex = Math.min(
        transactions.length - 1,
        Math.max(0, (currentIndex === -1 ? 0 : currentIndex) + direction),
      );
      const nextTransactionId = transactions[nextIndex].id;
      setActiveTransactionId(nextTransactionId);
      focusTransactionRow(nextTransactionId);
    },
    [activeTransactionId, focusTransactionRow, transactions],
  );

  const getKeyboardTargetTransaction = useCallback(() => {
    if (transactions.length === 0) return null;
    return (
      transactions.find((transaction) => transaction.id === activeTransactionId) ?? transactions[0]
    );
  }, [activeTransactionId, transactions]);

  const handleToggleActiveSelection = useCallback(() => {
    const transaction = getKeyboardTargetTransaction();
    if (!transaction) return;
    setActiveTransactionId(transaction.id);
    bulkTransactions.toggleSelection(transaction.id);
  }, [bulkTransactions, getKeyboardTargetTransaction]);

  const handleSelectAllVisible = useCallback(() => {
    bulkTransactions.selectAll();
    if (transactions[0]) {
      setActiveTransactionId(transactions[0].id);
    }
  }, [bulkTransactions, transactions]);

  const handleDeleteSelected = useCallback(() => {
    if (bulkTransactions.selectionCount > 0) {
      setBulkDeleteDialogOpen(true);
    }
  }, [bulkTransactions.selectionCount]);

  const handleEditActiveTransaction = useCallback(() => {
    const onlySelectedTransaction =
      bulkTransactions.selectionCount === 1 ? bulkTransactions.selectedTransactions[0] : null;
    const transaction = onlySelectedTransaction ?? getKeyboardTargetTransaction();
    if (transaction) {
      setActiveTransactionId(transaction.id);
      handleEditTransaction(transaction);
    }
  }, [
    bulkTransactions.selectedTransactions,
    bulkTransactions.selectionCount,
    getKeyboardTargetTransaction,
    handleEditTransaction,
  ]);

  const handleOpenActiveTransaction = useCallback(() => {
    const transaction = getKeyboardTargetTransaction();
    if (transaction) {
      navigate(`/transactions/${transaction.id}`);
    }
  }, [getKeyboardTargetTransaction, navigate]);

  useEffect(() => {
    if (transactions.length === 0) {
      setActiveTransactionId(null);
      return;
    }
    if (
      !activeTransactionId ||
      !transactions.some((transaction) => transaction.id === activeTransactionId)
    ) {
      setActiveTransactionId(transactions[0].id);
    }
  }, [activeTransactionId, transactions]);

  useKeyboardShortcuts({
    onListNavigate: handleListNavigate,
    onListSelect: handleOpenActiveTransaction,
    onListToggleSelection: handleToggleActiveSelection,
    onListSelectAll: handleSelectAllVisible,
    onListDeleteSelected: handleDeleteSelected,
    onListEditSelected: handleEditActiveTransaction,
  });

  const hasActiveFilters =
    selectedPurposeFilter !== 'all' ||
    query.trim() !== '' ||
    advancedFilters.startDate !== '' ||
    advancedFilters.endDate !== '' ||
    advancedFilters.categoryIds.length > 0 ||
    advancedFilters.accountIds.length > 0 ||
    advancedFilters.amountMin !== '' ||
    advancedFilters.amountMax !== '' ||
    advancedFilters.types.length > 0 ||
    advancedFilters.statuses.length > 0;

  const renderTransactionRow = useCallback(
    (transaction: Transaction, style?: React.CSSProperties, position?: number) => {
      const transactionLabel = getTransactionLabel(transaction);
      const isSelected = bulkTransactions.isSelected(transaction.id);
      const isActive = activeTransactionId === transaction.id;

      return (
        <li
          key={transaction.id}
          ref={(node) => {
            if (node) {
              transactionRowRefs.current.set(transaction.id, node);
            } else {
              transactionRowRefs.current.delete(transaction.id);
            }
          }}
          className={`list-item transaction-register__row${
            isSelected ? ' transaction-register__row--selected' : ''
          }${isActive ? ' transaction-register__row--active' : ''}`}
          role="listitem"
          aria-selected={isSelected}
          aria-posinset={position}
          aria-setsize={transactions.length}
          tabIndex={isActive ? 0 : -1}
          style={style}
          onFocus={() => setActiveTransactionId(transaction.id)}
          onClick={(event) => {
            if (
              (event.target as HTMLElement).closest('a,button,input,label,select,textarea')
            ) {
              return;
            }
            setActiveTransactionId(transaction.id);
          }}
        >
          <div className="transaction-register__checkbox-cell">
            <input
              type="checkbox"
              className="bulk-select-checkbox"
              checked={isSelected}
              readOnly
              aria-label={`Select ${transactionLabel}`}
              onClick={(event) =>
                handleTransactionSelection(
                  transaction,
                  event.currentTarget.checked,
                  event.shiftKey,
                )
              }
            />
          </div>
          <LazyReceiptImage transaction={transaction} className="receipt-thumb" />
          <div className="list-item__content">
            <Link
              to={`/transactions/${transaction.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
              aria-label={`View details for ${transactionLabel}`}
            >
              <p className="list-item__primary">{transactionLabel}</p>
            </Link>
            <p className="list-item__secondary">
              {transaction.counterpartyName ? `${transaction.counterpartyName} · ` : ''}
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
            <div className="transaction-item__actions" aria-label="Transaction actions">
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
            </div>
          </div>
        </li>
      );
    },
    [
      accountNames,
      activeTransactionId,
      bulkTransactions,
      categoryNames,
      handleEditTransaction,
      handleTransactionSelection,
      transactions.length,
    ],
  );

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
      </div>

      <AccountPurposeFilterControl
        value={selectedPurposeFilter}
        onChange={setSelectedPurposeFilter}
        label="Filter transactions by account purpose"
      />

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
            accounts={visibleFilterAccounts}
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
          <p className="sr-only" role="status" aria-live="polite">
            {bulkTransactions.selectionCount === 0
              ? 'No transactions selected'
              : `${bulkTransactions.selectionCount} transaction${
                  bulkTransactions.selectionCount === 1 ? '' : 's'
                } selected`}
          </p>
          <label className="transaction-register__select-all">
            <input
              ref={selectAllCheckboxRef}
              type="checkbox"
              className="bulk-select-checkbox"
              checked={allVisibleSelected}
              onChange={(event) => {
                if (event.currentTarget.checked) {
                  bulkTransactions.selectAll();
                } else {
                  bulkTransactions.clearSelection();
                }
              }}
              aria-label="Select all visible transactions"
            />
            Select all visible transactions
          </label>

          <TransactionBulkActionsToolbar
            selectionCount={bulkTransactions.selectionCount}
            totalCount={transactions.length}
            categories={categories}
            availableTags={selectedTransactionTags}
            onSelectAll={bulkTransactions.selectAll}
            onClearSelection={bulkTransactions.clearSelection}
            onBulkUpdate={bulkTransactions.bulkUpdate}
            onBulkAddTag={bulkTransactions.bulkAddTag}
            onBulkRemoveTag={bulkTransactions.bulkRemoveTag}
            onRequestBulkDelete={() => setBulkDeleteDialogOpen(true)}
          />

          {useCardRegister ? (
            <div className="card transaction-card-list-fallback">
              <p className="sr-only" role="status">
                Showing {transactions.length} transactions as cards for large text.{' '}
                {largeTextReflow.reasons.join(' ')}
              </p>
              {groupedTransactions.map((group) => (
                <section key={group.date} className="page-section" aria-label={`${group.label} transaction cards`}>
                  <h3 className="list-group__header">{group.label}</h3>
                  <ul className="list-group transaction-card-list" role="list" aria-label="Large text transaction card list">
                    {group.transactions.map((transaction) =>
                      renderTransactionRow(
                        transaction,
                        undefined,
                        transactionPositionById.get(transaction.id),
                      ),
                    )}
                  </ul>
                </section>
              ))}
            </div>
          ) : useVirtualRegister ? (
            <div className="card">
              <p className="sr-only" role="status">
                Showing {transactions.length} transactions with virtual scrolling
              </p>
              <div
                {...virtualRegister.containerProps}
                ref={virtualRegister.containerRef}
                className="transaction-register-virtual"
                role="list"
                aria-label="Virtualized transaction register"
                aria-setsize={transactions.length}
              >
                <ul
                  className="list-group"
                  role="presentation"
                  style={{
                    ...virtualRegister.contentProps.style,
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                  }}
                >
                  {virtualRegister.visibleItems.map(({ item, offsetTop }) => {
                    const rowStyle: React.CSSProperties = {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: VIRTUAL_REGISTER_ROW_HEIGHT,
                      transform: `translateY(${offsetTop}px)`,
                    };

                    if (item.kind === 'header') {
                      return (
                        <li
                          key={item.id}
                          className="list-group__header transaction-register-virtual__header"
                          role="presentation"
                          style={rowStyle}
                        >
                          {item.label}
                        </li>
                      );
                    }

                    return renderTransactionRow(
                      item.transaction,
                      rowStyle,
                      item.transactionPosition,
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : (
            groupedTransactions.map((group) => (
              <section key={group.date} className="page-section" aria-label={group.label}>
                <h3 className="list-group__header">{group.label}</h3>
                <div className="card">
                  <ul className="list-group" role="list">
                    {group.transactions.map((transaction) =>
                      renderTransactionRow(
                        transaction,
                        undefined,
                        transactionPositionById.get(transaction.id),
                      ),
                    )}
                  </ul>
                </div>
              </section>
            ))
          )}
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

      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        title="Delete Selected Transactions"
        message={`Are you sure you want to delete ${bulkTransactions.selectionCount} selected transaction${
          bulkTransactions.selectionCount === 1 ? '' : 's'
        }?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeleteDialogOpen(false)}
      />
    </>
  );
};

export default TransactionsPage;
