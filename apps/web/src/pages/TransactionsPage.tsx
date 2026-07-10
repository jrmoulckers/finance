// SPDX-License-Identifier: BUSL-1.1

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentLocale } from '../lib/i18n';
import { AppIcon } from '../components/icons';

import { AccountPurposeFilterControl } from '../components/accounts';
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
  NoResultsEmptyState,
  ReadAloudButton,
  SyncIndicator,
  useToast,
  Button,
} from '../components/common';
import { SkipLink } from '../components/common/SkipLink';
import { SwipeableRow } from '../components/common/SwipeableRow';
import { Checkbox } from '../components/common/Checkbox';
import { CategoryConfirmation } from '../components/categorization';
import { TransactionForm } from '../components/forms';
import { OfflineBanner } from '../components/OfflineBanner';
import { VoiceEntrySheet } from '../components/voice';
import {
  BusinessExpenseTag,
  DeductionSummary,
  ExpenseReport,
  MileageDashboard,
  TripEntry,
} from '../components/mileage';
// Imported directly (not via the mileage barrel) so the shift tracker only
// loads on this route and does not inflate other route bundles (#2137).
import { ShiftTracker } from '../components/mileage/ShiftTracker';
import {
  TransactionFilters,
  TransactionSort,
  TransactionEditPanel,
  TransactionsSummaryBar,
  TransactionShortcutsLegend,
  LazyReceiptImage,
  DEFAULT_SORT,
} from '../components/transactions';
import { ReturnWindowBadge } from '../components/warranty';
import type { AdvancedFilters } from '../components/transactions';
import type { SortConfig, SortField } from '../components/transactions';
import { TransactionBulkActionsToolbar } from '../components/transactions/TransactionBulkActionsToolbar';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts } from '../hooks/useAccounts';
import { useAccessibility } from '../hooks/useAccessibility';
import { useAutoCategorize } from '../hooks/useAutoCategorize';
import { useBulkTransactions } from '../hooks/useBulkTransactions';
import { useCategories } from '../hooks/useCategories';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import { prefersCoarsePointer } from '../hooks/useCoarsePointer';
import { useFontScale } from '../hooks/useFontScale';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { recordPwaMeaningfulAction } from '../hooks/useInstallPrompt';
import { useTransactions } from '../hooks/useTransactions';
import { useVirtualList } from '../hooks/useVirtualList';
import {
  createMileageTrip,
  deleteMileageTrip,
  generateTaxReadyExpenseReport,
  loadMileageTrips,
  MILEAGE_TRIPS_CHANGED_EVENT,
  updateMileageTrip,
} from '../lib/mileage';
import type {
  ExpenseTransactionInput,
  TripEntry as MileageTripRecord,
  TripEntryDraft as MileageTripDraft,
} from '../lib/mileage';
import type { Transaction } from '../kmp/bridge';
import {
  filterAccountsByPurpose,
  filterTransactionsByAccountPurpose,
  type AccountPurposeFilter,
} from '../lib/accountPurpose';
import { chooseLargeTextReflow } from '../lib/a11y/large-text-reflow';
import { getTransactionLocalDay } from '../lib/transactions/local-timestamp';
import {
  applyAdvancedFilters,
  matchesTransactionQuery,
  sortTransactions,
} from '../lib/transactions/filter-sort';
import { summarizeTransactions, type TransactionSummary } from '../lib/transactions/summary';

// Lazy-loaded so the quick-add affordance (dialog, presets, persistence helper)
// lands in its own async chunk and stays out of the saturated ledger route chunk.
const QuickAddTransaction = lazy(() => import('../components/transactions/QuickAddTransaction'));

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

/**
 * Renders the net subtotal for a group of transactions (e.g. a single day),
 * shown to the right of the date header. Currency-aware: each currency is
 * listed separately so unlike currencies are never summed. Renders nothing
 * when the group has no net-contributing transactions (transfers only).
 */
function DaySubtotal({ summary }: { summary: TransactionSummary }): React.ReactElement | null {
  if (summary.totalsByCurrency.length === 0) {
    return null;
  }
  return (
    <span className="list-group__header-subtotal">
      {summary.totalsByCurrency.map((total) => (
        <CurrencyDisplay
          key={total.currency}
          className="list-group__header-amount"
          amount={total.net}
          currency={total.currency}
          colorize
          showSign
          context="daily net total"
        />
      ))}
    </span>
  );
}

const VIRTUAL_REGISTER_THRESHOLD = 200;
const VIRTUAL_REGISTER_ROW_HEIGHT = 76;
const VIRTUAL_REGISTER_OVERSCAN = 16;

interface TransactionRegisterHeaderRow {
  readonly kind: 'header';
  readonly id: string;
  readonly label: string;
  readonly summary: TransactionSummary;
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
  groups: Array<{
    date: string;
    label: string;
    transactions: Transaction[];
    summary: TransactionSummary;
  }>,
): TransactionRegisterRow[] {
  let transactionPosition = 0;
  return groups.flatMap((group) => [
    {
      kind: 'header' as const,
      id: `header-${group.date}`,
      label: group.label,
      summary: group.summary,
    },
    ...group.transactions.map((transaction) => ({
      kind: 'transaction' as const,
      id: transaction.id,
      transaction,
      transactionPosition: ++transactionPosition,
    })),
  ]);
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

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentYearStartIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export const TransactionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isSimplified } = useAccessibility();
  const [searchParams, setSearchParams] = useSearchParams();
  // Free-text search: the raw `query` drives the input (updates immediately),
  // while `debouncedQuery` (300ms) drives the client-side filter/sort in the
  // `transactions` memo below so large registers are not re-filtered and
  // re-sorted on every keystroke (#3798).
  const {
    searchTerm: query,
    debouncedTerm: debouncedQuery,
    setSearchTerm: setQuery,
    clearSearch,
  } = useDebouncedSearch();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editPanelTransaction, setEditPanelTransaction] = useState<Transaction | null>(null);
  const [selectedPurposeFilter, setSelectedPurposeFilter] = useState<AccountPurposeFilter>('all');
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [editingMileageTrip, setEditingMileageTrip] = useState<MileageTripRecord | null>(null);
  const [tripEntries, setTripEntries] = useState<MileageTripRecord[]>(() => loadMileageTrips());
  const [reportStartDate, setReportStartDate] = useState(() => getCurrentYearStartIsoDate());
  const [reportEndDate, setReportEndDate] = useState(() => getTodayIsoDate());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [dismissedAutoCategoryIds, setDismissedAutoCategoryIds] = useState<string[]>([]);
  const [isVoiceEntryOpen, setIsVoiceEntryOpen] = useState(false);
  const { scale: inAppTextScale } = useFontScale();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  const addMenuRef = useRef<HTMLDivElement>(null);
  const transactionRowRefs = useRef(new Map<string, HTMLElement>());

  // Get filters/sort from URL params
  const advancedFilters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const sortConfig = useMemo(() => sortFromParams(searchParams), [searchParams]);

  // Build hook filters from the URL date params. Free-text search is applied
  // client-side in the `transactions` memo below (alongside the purpose filter,
  // advanced filters, and sort) so the register narrows live as the user types.
  // The underlying live-query hook does not re-run when only the search term
  // changes, so keeping search out of the DB query is what makes it work (#3200).
  const hookFilters = useMemo(
    () => ({
      startDate: advancedFilters.startDate || undefined,
      endDate: advancedFilters.endDate || undefined,
    }),
    [advancedFilters.startDate, advancedFilters.endDate],
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
  const reportFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
      startDate: reportStartDate || undefined,
      endDate: reportEndDate || undefined,
    }),
    [reportEndDate, reportStartDate],
  );
  const {
    transactions: reportTransactions,
    loading: reportLoading,
    error: reportError,
    refresh: refreshReportTransactions,
  } = useTransactions(reportFilters);
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
  // Free-text search context so matches can resolve category and account names,
  // mirroring the repository's SQL search fields (#3200 / #3155).
  const searchContext = useMemo(
    () => ({ categoryNames, accountNames }),
    [categoryNames, accountNames],
  );
  const visibleFilterAccounts = useMemo(
    () => filterAccountsByPurpose(accounts, selectedPurposeFilter),
    [accounts, selectedPurposeFilter],
  );
  const { suggestForTransaction, autoCategorizeInput, learnFromFeedback } =
    useAutoCategorize(categories);
  const toast = useOptionalToast();

  const learnCategoryChoice = useCallback(
    (
      transactionLike: {
        payee?: string | null;
        note?: string | null;
        counterpartyName?: string | null;
        amount?: { amount: number } | null;
      },
      categoryId: string | null,
    ) => {
      if (!categoryId) {
        return;
      }

      const description =
        transactionLike.payee?.trim() ||
        transactionLike.note?.trim() ||
        transactionLike.counterpartyName?.trim() ||
        '';
      if (!description) {
        return;
      }

      learnFromFeedback({
        description,
        amountCents: transactionLike.amount ? Math.abs(transactionLike.amount.amount) : undefined,
        categoryId,
        categoryName: categoryNames.get(categoryId) ?? null,
      });
    },
    [categoryNames, learnFromFeedback],
  );

  // Apply the purpose filter, free-text search, advanced local filters, then
  // sort. All narrowing happens client-side here so the register updates live
  // as the user types in the search box or adjusts controls (#3200).
  const transactions = useMemo(() => {
    const purposeFiltered = filterTransactionsByAccountPurpose(
      rawTransactions,
      accounts,
      selectedPurposeFilter,
    );
    const searched = purposeFiltered.filter((transaction) =>
      matchesTransactionQuery(transaction, debouncedQuery, searchContext),
    );
    const filtered = applyAdvancedFilters(searched, advancedFilters);
    return sortTransactions(filtered, sortConfig, categoryNames);
  }, [
    rawTransactions,
    accounts,
    selectedPurposeFilter,
    debouncedQuery,
    searchContext,
    advancedFilters,
    sortConfig,
    categoryNames,
  ]);

  const bulkTransactions = useBulkTransactions(transactions, refreshTransactions);
  const { selectedIds, selectionCount, clearSelection, isSelected, bulkUpdate } = bulkTransactions;

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

  const transactionLookup = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );
  const reportExpenseTransactions = useMemo<ExpenseTransactionInput[]>(
    () =>
      reportTransactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        payee: transaction.payee,
        note: transaction.note,
        amountCents: transaction.amount.amount,
        type: transaction.type,
        tags: transaction.tags,
        customFields: transaction.customFields,
        categoryName:
          transaction.categoryId !== null
            ? (categoryNames.get(transaction.categoryId) ?? null)
            : null,
      })),
    [categoryNames, reportTransactions],
  );
  const taxReport = useMemo(
    () =>
      generateTaxReadyExpenseReport({
        trips: tripEntries,
        transactions: reportExpenseTransactions,
        startDate: reportStartDate || null,
        endDate: reportEndDate || null,
      }),
    [reportEndDate, reportExpenseTransactions, reportStartDate, tripEntries],
  );

  useEffect(() => {
    const syncTrips = () => {
      setTripEntries(loadMileageTrips());
    };

    syncTrips();
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener(MILEAGE_TRIPS_CHANGED_EVENT, syncTrips);
    return () => window.removeEventListener(MILEAGE_TRIPS_CHANGED_EVENT, syncTrips);
  }, []);

  useEffect(() => {
    if (transactions.length === 0 || toast === null || typeof window === 'undefined') {
      return;
    }

    // Swipe gestures only exist on touch devices, so the swipe tip is
    // irrelevant (and confusing) for mouse + keyboard users. Gate it behind a
    // coarse/touch pointer check (#3143).
    if (!prefersCoarsePointer()) {
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

  // Group by date for display. Uses the captured LOCAL purchase day where
  // available (issue #2206) so daily-spend grouping stays correct across time
  // zones; falls back to the legacy calendar date otherwise.
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();

    for (const transaction of transactions) {
      const groupDay = getTransactionLocalDay(transaction);
      const existingTransactions = groups.get(groupDay);
      if (existingTransactions) {
        existingTransactions.push(transaction);
      } else {
        groups.set(groupDay, [transaction]);
      }
    }

    return Array.from(groups, ([date, datedTransactions]) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString(getCurrentLocale(), {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      transactions: datedTransactions,
      summary: summarizeTransactions(datedTransactions),
    }));
  }, [transactions]);

  // Overall summary (count + net total) for the visible/filtered set, shown in
  // the summary bar above the ledger (#3772).
  const transactionsSummary = useMemo(() => summarizeTransactions(transactions), [transactions]);

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

  // Running balance (#3659): a register/ledger balance after each transaction
  // only makes sense when the visible set is scoped to a single account and
  // ordered by date. It is accumulated from that account's full loaded history
  // (rawTransactions) in chronological order so each row reflects the true
  // balance even when a date/amount filter hides earlier rows. When the view
  // mixes accounts the balance is meaningless, so it is hidden entirely.
  const runningBalanceAccountId = useMemo(() => {
    if (transactions.length === 0) return null;
    let accountId: string | null = null;
    for (const transaction of transactions) {
      if (accountId === null) {
        accountId = transaction.accountId;
      } else if (accountId !== transaction.accountId) {
        return null;
      }
    }
    return accountId;
  }, [transactions]);

  const showRunningBalance = sortConfig.field === 'date' && runningBalanceAccountId !== null;

  const runningBalanceById = useMemo(() => {
    const balances = new Map<string, number>();
    if (runningBalanceAccountId === null) return balances;

    const accountHistory = rawTransactions
      .filter((transaction) => transaction.accountId === runningBalanceAccountId)
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return a.createdAt.localeCompare(b.createdAt);
      });

    let runningTotal = 0;
    for (const transaction of accountHistory) {
      runningTotal += getTransactionDisplayAmount(transaction);
      balances.set(transaction.id, runningTotal);
    }
    return balances;
  }, [rawTransactions, runningBalanceAccountId]);

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

  // Reset all narrowing controls (search, purpose, advanced filters) while
  // preserving the current sort. Used by the empty-state "Clear filters" CTA
  // (#3772).
  const handleClearAllFilters = useCallback(() => {
    clearSearch();
    setSelectedPurposeFilter('all');
    const params: Record<string, string> = {};
    if (sortConfig.field !== DEFAULT_SORT.field) params.sortField = sortConfig.field;
    if (sortConfig.direction !== DEFAULT_SORT.direction) params.sortDir = sortConfig.direction;
    setSearchParams(params, { replace: true });
  }, [clearSearch, sortConfig, setSearchParams]);

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

  const handleOpenVoiceEntry = useCallback(() => {
    setAddMenuOpen(false);
    setIsVoiceEntryOpen(true);
  }, []);

  const handleCloseVoiceEntry = useCallback(() => {
    setIsVoiceEntryOpen(false);
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
    async (data: CreateTransactionInput, options?: { addAnother?: boolean }): Promise<void> => {
      if (editingTransaction !== null) {
        const result = updateTransaction(editingTransaction.id, data);
        if (result === null) {
          throw new Error('Failed to update transaction. Please try again.');
        }
      } else {
        const result = createTransaction({
          ...data,
          categoryId: autoCategorizeInput(data),
        });
        if (result === null) {
          throw new Error('Failed to create transaction. Please try again.');
        }
      }

      recordPwaMeaningfulAction();
      // "Save and add another" keeps the dialog open for the next entry (#3650);
      // a regular save closes it as before.
      if (!options?.addAnother) {
        handleFormCancel();
      }
      refreshTransactions();
    },
    [
      autoCategorizeInput,
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
      if (editPanelTransaction?.categoryId !== result.categoryId) {
        learnCategoryChoice(result, result.categoryId);
      }
      setEditPanelTransaction(null);
      refreshTransactions();
    },
    [editPanelTransaction, learnCategoryChoice, refreshTransactions, updateTransaction],
  );

  const handleVoiceTransactionSubmit = useCallback(
    async (data: CreateTransactionInput): Promise<void> => {
      const result = createTransaction(data);
      if (result === null) {
        throw new Error('Failed to create transaction. Please try again.');
      }

      setIsVoiceEntryOpen(false);
      refreshTransactions();
      toast?.showToast({
        type: 'success',
        message: 'Voice transaction saved.',
      });
    },
    [createTransaction, refreshTransactions, toast],
  );

  const handleEditPanelClose = useCallback(() => {
    setEditPanelTransaction(null);
  }, []);

  const handleQuickAddCreate = useCallback(
    async (data: CreateTransactionInput): Promise<void> => {
      const result = createTransaction({
        ...data,
        categoryId: autoCategorizeInput(data),
      });
      if (result === null) {
        throw new Error('Failed to create transaction. Please try again.');
      }

      recordPwaMeaningfulAction();
      refreshTransactions();
    },
    [autoCategorizeInput, createTransaction, refreshTransactions],
  );

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

  const handleMileageTripSubmit = useCallback(
    async (trip: MileageTripDraft): Promise<void> => {
      if (editingMileageTrip !== null) {
        const updatedTrip = updateMileageTrip(editingMileageTrip.id, trip);
        if (updatedTrip === null) {
          throw new Error('Could not update the mileage trip.');
        }

        setEditingMileageTrip(null);
        toast?.showToast({
          type: 'success',
          message: 'Updated mileage trip.',
        });
        return;
      }

      createMileageTrip(trip);
      toast?.showToast({
        type: 'success',
        message: 'Logged mileage trip.',
      });
    },
    [editingMileageTrip, toast],
  );

  const handleDeleteMileageTrip = useCallback(
    (tripId: string) => {
      const deleted = deleteMileageTrip(tripId);
      if (!deleted) {
        toast?.showToast({
          type: 'error',
          message: 'Could not delete the mileage trip.',
        });
        return;
      }

      if (editingMileageTrip?.id === tripId) {
        setEditingMileageTrip(null);
      }

      toast?.showToast({
        type: 'success',
        message: 'Deleted mileage trip.',
      });
    },
    [editingMileageTrip?.id, toast],
  );

  const handleSaveBusinessExpense = useCallback(
    (
      transaction: Transaction,
      update: { tags: string[]; customFields: Record<string, string> | null },
    ) => {
      const result = updateTransaction(transaction.id, {
        tags: update.tags,
        customFields: update.customFields,
      });
      if (result === null) {
        toast?.showToast({
          type: 'error',
          message: `Could not update business deduction metadata for ${getTransactionLabel(transaction)}.`,
        });
        return;
      }

      refreshTransactions();
      refreshReportTransactions();
      toast?.showToast({
        type: 'success',
        message: `Updated tax tagging for ${getTransactionLabel(transaction)}.`,
      });
    },
    [refreshReportTransactions, refreshTransactions, toast, updateTransaction],
  );

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

      learnCategoryChoice(result, result.categoryId);
      setDismissedAutoCategoryIds((currentIds) => currentIds.filter((id) => id !== transaction.id));
      refreshTransactions();
      toast?.showToast({
        type: 'success',
        message: `Categorized ${getTransactionLabel(transaction)} as ${categoryName}.`,
      });
    },
    [learnCategoryChoice, refreshTransactions, toast, updateTransaction],
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

        transactionsNeedingChange.forEach((transaction) => {
          learnCategoryChoice(transaction, categoryId);
        });
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

      learnCategoryChoice(result, result.categoryId);
      if (selectedIds.has(transaction.id)) {
        clearSelection();
      }

      toast?.showToast({
        type: 'success',
        message: `Categorized ${getTransactionLabel(transaction)} as ${categoryName}.`,
      });
      return true;
    },
    [
      bulkUpdate,
      clearSelection,
      learnCategoryChoice,
      selectedIds,
      toast,
      transactionLookup,
      updateTransaction,
    ],
  );

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
            if ((event.target as HTMLElement).closest('a,button,input,label,select,textarea')) {
              return;
            }
            setActiveTransactionId(transaction.id);
          }}
        >
          <div className="transaction-register__checkbox-cell">
            <Checkbox
              checked={isSelected}
              readOnly
              aria-label={`Select ${transactionLabel}`}
              onClick={(event) =>
                handleTransactionSelection(transaction, event.currentTarget.checked, event.shiftKey)
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
            {showRunningBalance && runningBalanceById.has(transaction.id) ? (
              <div className="transaction-list-item__running-balance">
                <span className="transaction-list-item__running-balance-label" aria-hidden="true">
                  Balance
                </span>
                <CurrencyDisplay
                  amount={runningBalanceById.get(transaction.id)!}
                  currency={transaction.currency.code}
                  context={`running balance after ${transactionLabel}`}
                />
              </div>
            ) : null}
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
      showRunningBalance,
      runningBalanceById,
    ],
  );

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
                        onClick={handleOpenVoiceEntry}
                      >
                        <AppIcon name="mic" /> Voice Entry
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
              <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
                <button type="button" className="add-button" onClick={handleOpenCreateForm}>
                  <PlusIcon />
                  Add income or expense
                </button>
                <button type="button" className="add-button" onClick={handleOpenVoiceEntry}>
                  <AppIcon name="mic" />
                  Voice entry
                </button>
              </div>
            )}
          </div>

          <SkipLink targetId="transaction-results" label="Skip to transaction results" />

          <AccountPurposeFilterControl
            value={selectedPurposeFilter}
            onChange={setSelectedPurposeFilter}
            label="Filter transactions by account purpose"
          />

          <div className="search-bar" role="search">
            <input
              type="search"
              className="search-bar__input"
              placeholder="Search payee, category, amount, tag…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search transactions"
            />
            {query.trim() !== '' && (
              <button
                type="button"
                className="search-bar__clear"
                onClick={() => clearSearch()}
                aria-label="Clear search"
              >
                <span aria-hidden="true">✕</span>
              </button>
            )}
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
                    accounts={visibleFilterAccounts}
                  />
                </div>
                <TransactionSort sort={sortConfig} onChange={handleSortChange} />
              </div>

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
              <CategoryDropZone
                categories={categories}
                onDropTransactions={handleDropRecategorize}
              />
            </>
          ) : null}

          <section className="page-section" aria-labelledby="tax-deductions-heading">
            <div className="page-header">
              <div>
                <h3 id="tax-deductions-heading" className="page-heading">
                  Mileage & business deductions
                </h3>
                <p className="page-summary">
                  Track mileage by work shift with one-tap route presets, apply 2024 IRS rates, and
                  tag deductible transactions locally on this device.
                </p>
              </div>
            </div>
            <div className="mileage-grid mileage-grid--columns">
              <MileageDashboard report={taxReport} />
              <DeductionSummary report={taxReport} />
            </div>
            <div className="mileage-grid" style={{ marginTop: 'var(--spacing-4)' }}>
              <ShiftTracker />
            </div>
            <div
              className="mileage-grid mileage-grid--columns"
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <TripEntry
                trip={editingMileageTrip}
                onSubmit={handleMileageTripSubmit}
                onCancel={() => setEditingMileageTrip(null)}
              />
              {reportError ? (
                <ErrorBanner message={reportError} onRetry={refreshReportTransactions} />
              ) : (
                <ExpenseReport
                  report={taxReport}
                  startDate={reportStartDate}
                  endDate={reportEndDate}
                  onStartDateChange={setReportStartDate}
                  onEndDateChange={setReportEndDate}
                  onEditTrip={setEditingMileageTrip}
                  onDeleteTrip={handleDeleteMileageTrip}
                  isLoading={reportLoading}
                />
              )}
            </div>
          </section>

          <div className="transaction-results-header">
            <h2 id="transaction-results" className="transaction-results-header__title">
              Transaction results
            </h2>
            {!isLoading && !resolvedError && (transactions.length > 0 || hasActiveFilters) ? (
              <p className="transaction-results-header__count" role="status" aria-live="polite">
                {transactions.length === 1
                  ? '1 transaction'
                  : `${transactions.length.toLocaleString()} transactions`}
                {hasActiveFilters ? ' match your filters' : ''}
              </p>
            ) : null}
            {!isSimplified && <TransactionShortcutsLegend />}
          </div>

          {!isLoading && !resolvedError && transactions.length > 0 && (
            <TransactionsSummaryBar summary={transactionsSummary} />
          )}

          {isLoading ? (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}
            >
              <LoadingSpinner label="Loading transactions" />
            </div>
          ) : resolvedError ? (
            <ErrorBanner message={resolvedError} onRetry={handleRetry} />
          ) : transactions.length === 0 ? (
            hasActiveFilters ? (
              <NoResultsEmptyState
                title="No transactions found"
                onClearFilters={handleClearAllFilters}
              />
            ) : (
              <EmptyState
                title="No transactions yet"
                description="Transactions you add will appear here."
                action={
                  <Button variant="primary" onClick={handleOpenCreateForm}>
                    Add transaction
                  </Button>
                }
              />
            )
          ) : useCardRegister ? (
            <div className="card transaction-card-list-fallback">
              <p className="sr-only" role="status">
                Showing {transactions.length} transactions as cards for large text.{' '}
                {largeTextReflow.reasons.join(' ')}
              </p>
              {groupedTransactions.map((group) => (
                <section
                  key={group.date}
                  className="page-section"
                  aria-label={`${group.label} transaction cards`}
                >
                  <h3 className="list-group__header">
                    <span>{group.label}</span>
                    <DaySubtotal summary={group.summary} />
                  </h3>
                  <ul
                    className="list-group transaction-card-list"
                    role="list"
                    aria-label="Large text transaction card list"
                  >
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
                          <span>{item.label}</span>
                          <DaySubtotal summary={item.summary} />
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
            <div>
              <p className="sr-only" role="status" aria-live="polite">
                {bulkTransactions.selectionCount === 0
                  ? 'No transactions selected'
                  : `${bulkTransactions.selectionCount} transaction${
                      bulkTransactions.selectionCount === 1 ? '' : 's'
                    } selected`}
              </p>
              <Checkbox
                className="transaction-register__select-all"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={(event) => {
                  if (event.currentTarget.checked) {
                    bulkTransactions.selectAll();
                  } else {
                    bulkTransactions.clearSelection();
                  }
                }}
                aria-label="Select all visible transactions"
                label="Select all visible transactions"
              />
              {groupedTransactions.map((group) => (
                <section key={group.date} className="page-section" aria-label={group.label}>
                  <h3 className="list-group__header">
                    <span>{group.label}</span>
                    <DaySubtotal summary={group.summary} />
                  </h3>
                  <div className="card">
                    <ul className="list-group" role="list">
                      {group.transactions.map((transaction) => {
                        const transactionLabel = getTransactionLabel(transaction);
                        const autoCategory = suggestForTransaction(transaction);
                        const canQuickCategorize =
                          autoCategory !== null &&
                          autoCategory.categoryId !== transaction.categoryId;
                        const showCategoryConfirmation =
                          canQuickCategorize && !dismissedAutoCategoryIds.includes(transaction.id);
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
                                <Checkbox
                                  checked={isSelected(transaction.id)}
                                  onChange={(event) =>
                                    handleTransactionSelection(
                                      transaction,
                                      event.currentTarget.checked,
                                      event.nativeEvent instanceof MouseEvent
                                        ? event.nativeEvent.shiftKey
                                        : false,
                                    )
                                  }
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
                              <ReturnWindowBadge transaction={transaction} />
                              {isSimplified ? (
                                <p className="transaction-list-item__support">
                                  Account:{' '}
                                  {accountNames.get(transaction.accountId) ?? 'Unknown account'}
                                </p>
                              ) : null}
                              <BusinessExpenseTag
                                transaction={transaction}
                                categoryName={
                                  transaction.categoryId !== null
                                    ? (categoryNames.get(transaction.categoryId) ?? null)
                                    : null
                                }
                                onSave={(update) => handleSaveBusinessExpense(transaction, update)}
                              />
                              {showCategoryConfirmation && autoCategory !== null ? (
                                <CategoryConfirmation
                                  suggestion={autoCategory}
                                  onAccept={() =>
                                    handleQuickCategorize(
                                      transaction,
                                      autoCategory.categoryId,
                                      autoCategory.categoryName,
                                    )
                                  }
                                  onReject={() =>
                                    setDismissedAutoCategoryIds((currentIds) =>
                                      currentIds.includes(transaction.id)
                                        ? currentIds
                                        : [...currentIds, transaction.id],
                                    )
                                  }
                                />
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
                              <ReadAloudButton
                                amount={getTransactionDisplayAmount(transaction)}
                                currency={transaction.currency.code}
                                context={`${transactionLabel} transaction amount`}
                                label="Read amount"
                              />
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

        <VoiceEntrySheet
          isOpen={isVoiceEntryOpen}
          accounts={accounts}
          categories={categories}
          onSubmit={handleVoiceTransactionSubmit}
          onClose={handleCloseVoiceEntry}
          onRequestManualEntry={() => {
            handleCloseVoiceEntry();
            handleOpenCreateForm();
          }}
        />

        <TransactionEditPanel
          transaction={editPanelTransaction}
          accounts={accounts}
          categories={categories}
          onSave={handleEditPanelSave}
          onClose={handleEditPanelClose}
        />

        {!isSimplified && (
          <Suspense fallback={null}>
            <QuickAddTransaction
              accounts={accounts}
              categories={categories}
              onCreate={handleQuickAddCreate}
            />
          </Suspense>
        )}

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
    </DragDropProvider>
  );
};

export default TransactionsPage;
