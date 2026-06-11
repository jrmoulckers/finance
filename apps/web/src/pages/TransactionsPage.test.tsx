// SPDX-License-Identifier: BUSL-1.1

import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useAccounts } from '../hooks/useAccounts';
import { useBulkTransactions } from '../hooks/useBulkTransactions';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';

import { TransactionsPage } from './TransactionsPage';

// Mock each hook file individually — the page imports from the individual
// paths, not the barrel, so the barrel mock would not intercept them.
vi.mock('../hooks/useTransactions', () => ({ useTransactions: vi.fn() }));
vi.mock('../hooks/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useBulkTransactions', () => ({ useBulkTransactions: vi.fn() }));

vi.mock('../components/common', () => ({
  CategoryDropZone: ({
    categories,
    onDropTransactions,
  }: {
    categories: Array<{ id: string; name: string }>;
    onDropTransactions: (
      transactionIds: readonly string[],
      categoryId: string | null,
      categoryName: string,
    ) => boolean;
  }) => (
    <div>
      {categories.map((category) => (
        <div
          key={category.id}
          data-drop-target-id={category.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const payload =
              event.dataTransfer?.getData('application/x-finance-transaction-ids') ?? '';
            const ids = payload ? (JSON.parse(payload) as string[]) : [];
            onDropTransactions(ids, category.id, category.name);
          }}
        >
          {category.name}
        </div>
      ))}
    </div>
  ),
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    onConfirm,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <div role="alertdialog" aria-label={title}>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>
          Delete
        </button>
      </div>
    ) : null,
  CurrencyDisplay: ({ amount }: { amount: number }) => <span>{amount}</span>,
  DragDropProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  DraggableTransaction: ({
    children,
    dragTransactionIds,
    label,
  }: {
    children: ReactNode;
    dragTransactionIds: readonly string[];
    label: string;
  }) => (
    <div
      role="group"
      aria-label={`Actions for ${label}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer?.setData(
          'application/x-finance-transaction-ids',
          JSON.stringify(dragTransactionIds),
        );
      }}
    >
      {children}
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  ErrorBanner: ({ message }: { message: string }) => <div>{message}</div>,
  ExplainThis: () => null,
  LoadingSpinner: ({ label }: { label: string }) => <div>{label}</div>,
  SyncIndicator: () => null,
  useToast: () => null,
}));
vi.mock('../components/common/SwipeableRow', () => ({
  SwipeableRow: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

// TransactionForm renders unconditionally and calls useDatabase internally.
// Stub it out so the test has no provider dependency while still allowing
// the page to surface the open state in interaction tests.
vi.mock('../components/forms', () => ({
  TransactionForm: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Transaction form">
        Transaction form
      </div>
    ) : null,
  BulkEditToolbar: ({ selectionCount }: { selectionCount: number }) =>
    selectionCount > 0 ? (
      <div data-testid="bulk-edit-toolbar">{selectionCount} selected</div>
    ) : null,
}));

vi.mock('../components/voice', () => ({
  VoiceEntrySheet: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? (
      <div role="dialog" aria-label="Voice transaction entry">
        Voice transaction entry
      </div>
    ) : null,
}));

// Mock the transactions sub-components to avoid complex internal dependencies.
vi.mock('../components/transactions', () => ({
  TransactionFilters: () => <div data-testid="transaction-filters">Filters</div>,
  TransactionSort: () => <div data-testid="transaction-sort">Sort</div>,
  TransactionEditPanel: ({ transaction }: { transaction: { payee: string } | null }) =>
    transaction ? (
      <div role="dialog" aria-label="Edit panel">
        Edit: {transaction.payee}
      </div>
    ) : null,
  EMPTY_FILTERS: {
    startDate: '',
    endDate: '',
    categoryIds: [],
    accountIds: [],
    amountMin: '',
    amountMax: '',
    types: [],
    statuses: [],
  },
  DEFAULT_SORT: { field: 'date', direction: 'desc' },
}));

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseBulkTransactions = vi.mocked(useBulkTransactions);
const refreshTransactionsMock = vi.fn();
const createTransactionMock = vi.fn();
const updateTransactionMock = vi.fn();
const deleteTransactionMock = vi.fn();
const bulkUpdateMock = vi.fn();
const bulkDeleteMock = vi.fn();
const toggleSelectionMock = vi.fn();
const selectAllMock = vi.fn();
const clearSelectionMock = vi.fn();
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function createMockDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
    getData: vi.fn((type: string) => data.get(type) ?? ''),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    refreshTransactionsMock.mockReset();
    createTransactionMock.mockReset();
    updateTransactionMock.mockReset();
    deleteTransactionMock.mockReset();
    bulkUpdateMock.mockReset();
    bulkDeleteMock.mockReset();
    toggleSelectionMock.mockReset();
    selectAllMock.mockReset();
    clearSelectionMock.mockReset();

    deleteTransactionMock.mockReturnValue(true);
    bulkUpdateMock.mockReturnValue({ successCount: 2, failureCount: 0, errors: [] });
    bulkDeleteMock.mockReturnValue({ successCount: 1, failureCount: 0, errors: [] });

    mockedUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'transaction-1',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-food',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 6742 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Grocery Store',
          note: null,
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          merchantAddress: null,
          merchantCity: null,
          merchantState: null,
          merchantZip: null,
          merchantCountry: null,
          externalReferenceId: null,
          statementDescription: null,
          customFields: null,
          extraNotes: null,
          counterpartyName: null,
          counterpartyAccountId: null,
          ...syncMetadata,
        },
        {
          id: 'transaction-2',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-income',
          type: 'INCOME',
          status: 'CLEARED',
          amount: { amount: 450000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Monthly Salary',
          note: null,
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          merchantAddress: null,
          merchantCity: null,
          merchantState: null,
          merchantZip: null,
          merchantCountry: null,
          externalReferenceId: null,
          statementDescription: null,
          customFields: null,
          extraNotes: null,
          counterpartyName: null,
          counterpartyAccountId: null,
          ...syncMetadata,
        },
        {
          id: 'transaction-3',
          householdId: 'household-1',
          accountId: 'account-1',
          categoryId: 'category-utilities',
          type: 'EXPENSE',
          status: 'CLEARED',
          amount: { amount: 12400 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Electric Bill',
          note: null,
          date: '2025-03-05',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          merchantAddress: null,
          merchantCity: null,
          merchantState: null,
          merchantZip: null,
          merchantCountry: null,
          externalReferenceId: null,
          statementDescription: null,
          customFields: null,
          extraNotes: null,
          counterpartyName: null,
          counterpartyAccountId: null,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: createTransactionMock,
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });
    mockedUseCategories.mockReturnValue({
      categories: [
        {
          id: 'category-food',
          householdId: 'household-1',
          name: 'Food',
          icon: 'utensils',
          color: '#16A34A',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 1,
          ...syncMetadata,
        },
        {
          id: 'category-income',
          householdId: 'household-1',
          name: 'Income',
          icon: 'wallet',
          color: '#059669',
          parentId: null,
          isIncome: true,
          isSystem: true,
          sortOrder: 2,
          ...syncMetadata,
        },
        {
          id: 'category-utilities',
          householdId: 'household-1',
          name: 'Utilities',
          icon: 'bolt',
          color: '#7C3AED',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 3,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 520000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });
    mockedUseBulkTransactions.mockReturnValue({
      selectedIds: new Set(),
      selectionCount: 0,
      isBulkMode: false,
      toggleSelection: toggleSelectionMock,
      selectAll: selectAllMock,
      clearSelection: clearSelectionMock,
      isSelected: () => false,
      bulkUpdate: bulkUpdateMock,
      bulkDelete: bulkDeleteMock,
    });
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('opens the default add transaction action from the split button primary action', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

    expect(screen.getByRole('dialog', { name: 'Transaction form' })).toBeInTheDocument();
  });

  it('displays Add Transaction split-button menu with Manual Entry, Voice Entry, and Import options', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole('button', { name: /open transaction options/i });
    expect(menuButton).toBeInTheDocument();
    expect(menuButton).toHaveAttribute('aria-haspopup', 'menu');
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: /manual entry/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /voice entry/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /import from file/i })).toBeInTheDocument();
  });

  it('opens the voice entry sheet from the split-button menu', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /open transaction options/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /voice entry/i }));

    expect(screen.getByRole('dialog', { name: /voice transaction entry/i })).toBeInTheDocument();
  });

  it('displays the search input', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('searchbox', { name: /search transactions/i })).toBeInTheDocument();
  });

  it('displays filter and sort controls', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('transaction-filters')).toBeInTheDocument();
    expect(screen.getByTestId('transaction-sort')).toBeInTheDocument();
  });

  it('displays transaction descriptions', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
  });

  it('displays edit and delete actions for each transaction', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Edit Grocery Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Grocery Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Monthly Salary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Electric Bill' })).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each transaction', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button', { name: /^edit /i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^delete /i })).toHaveLength(3);
  });

  it('clicking edit opens the edit panel', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /edit grocery store/i }));

    expect(screen.getByRole('dialog', { name: /edit panel/i })).toBeInTheDocument();
  });

  it('clicking delete opens ConfirmDialog', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    expect(screen.getByRole('alertdialog', { name: /delete transaction/i })).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to delete\s+"?grocery store"?/i),
    ).toBeInTheDocument();
  });

  it('confirming delete calls deleteTransaction', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /delete grocery store/i }));

    const dialog = screen.getByRole('alertdialog', { name: /delete transaction/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteTransactionMock).toHaveBeenCalledWith('transaction-1');
  });

  it('shows the bulk edit toolbar when transactions are selected', () => {
    mockedUseBulkTransactions.mockReturnValue({
      selectedIds: new Set(['transaction-1']),
      selectionCount: 1,
      isBulkMode: true,
      toggleSelection: toggleSelectionMock,
      selectAll: selectAllMock,
      clearSelection: clearSelectionMock,
      isSelected: (transactionId: string) => transactionId === 'transaction-1',
      bulkUpdate: bulkUpdateMock,
      bulkDelete: bulkDeleteMock,
    });

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('bulk-edit-toolbar')).toHaveTextContent('1 selected');
  });

  it('drops a single transaction onto a category and updates that transaction', () => {
    const dataTransfer = createMockDataTransfer();
    updateTransactionMock.mockImplementation(
      (transactionId: string, updates: { categoryId: string }) => ({
        id: transactionId,
        categoryId: updates.categoryId,
      }),
    );

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.dragStart(screen.getByRole('group', { name: /actions for grocery store/i }), {
      dataTransfer,
    });
    fireEvent.dragOver(
      screen.getByText('Utilities').closest('[data-drop-target-id="category-utilities"]')!,
      {
        dataTransfer,
      },
    );
    fireEvent.drop(
      screen.getByText('Utilities').closest('[data-drop-target-id="category-utilities"]')!,
      {
        dataTransfer,
      },
    );

    expect(updateTransactionMock).toHaveBeenCalledWith('transaction-1', {
      categoryId: 'category-utilities',
    });
  });

  it('drops selected transactions as a batch and uses bulk recategorization', () => {
    const dataTransfer = createMockDataTransfer();
    mockedUseBulkTransactions.mockReturnValue({
      selectedIds: new Set(['transaction-1', 'transaction-2']),
      selectionCount: 2,
      isBulkMode: true,
      toggleSelection: toggleSelectionMock,
      selectAll: selectAllMock,
      clearSelection: clearSelectionMock,
      isSelected: (transactionId: string) =>
        transactionId === 'transaction-1' || transactionId === 'transaction-2',
      bulkUpdate: bulkUpdateMock,
      bulkDelete: bulkDeleteMock,
    });

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.dragStart(screen.getByRole('group', { name: /actions for grocery store/i }), {
      dataTransfer,
    });
    fireEvent.drop(
      screen.getByText('Utilities').closest('[data-drop-target-id="category-utilities"]')!,
      {
        dataTransfer,
      },
    );

    expect(bulkUpdateMock).toHaveBeenCalledWith({ categoryId: 'category-utilities' });
    expect(updateTransactionMock).not.toHaveBeenCalledWith('transaction-1', {
      categoryId: 'category-utilities',
    });
  });
});
