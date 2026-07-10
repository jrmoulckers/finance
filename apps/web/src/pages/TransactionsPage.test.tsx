// SPDX-License-Identifier: BUSL-1.1

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { Transaction } from '../kmp/bridge';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useTransactions } from '../hooks/useTransactions';
import { PrivacyModeProvider } from '../contexts/PrivacyModeContext';
import { evaluatePrivacyScreenCoverage } from '../lib/security/privacy-screen';
import { auditPrivacySurfaceCoverage, privacySurface } from '../lib/security/privacy-coverage';

import { TransactionsPage } from './TransactionsPage';

const repositoryMocks = vi.hoisted(() => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  fontScale: { value: 1 },
}));

// Mock each hook file individually — the page imports from the individual
// paths, not the barrel, so the barrel mock would not intercept them.
vi.mock('../hooks/useTransactions', () => ({ useTransactions: vi.fn() }));
vi.mock('../hooks/useCategories', () => ({ useCategories: vi.fn() }));
vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useFontScale', () => ({
  useFontScale: () => ({ scale: repositoryMocks.fontScale.value }),
}));
vi.mock('../db/DatabaseProvider', () => ({ useDatabase: () => ({}) }));
vi.mock('../db/repositories/transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/repositories/transactions')>();
  return {
    ...actual,
    updateTransaction: repositoryMocks.updateTransaction,
    deleteTransaction: repositoryMocks.deleteTransaction,
  };
});

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
  Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  ReadAloudButton: () => null,
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
  EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
    <div>
      {title}
      {action}
    </div>
  ),
  NoResultsEmptyState: ({
    title,
    onClearFilters,
  }: {
    title?: string;
    onClearFilters?: () => void;
  }) => (
    <div>
      {title ?? 'No matches found'}
      {onClearFilters && (
        <button type="button" onClick={onClearFilters}>
          Clear filters
        </button>
      )}
    </div>
  ),
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
  LazyReceiptImage: () => null,
  TransactionsSummaryBar: ({
    summary,
  }: {
    summary: { count: number; totalsByCurrency: { currency: string; net: number }[] };
  }) => (
    <div data-testid="transactions-summary">
      <span>{summary.count} transactions</span>
      {summary.totalsByCurrency.map((total) => (
        <span key={total.currency} data-testid="summary-net">
          {total.currency} {total.net}
        </span>
      ))}
    </div>
  ),
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
  TransactionShortcutsLegend: () => <div data-testid="transaction-shortcuts-legend" />,
}));

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseAccounts = vi.mocked(useAccounts);
const refreshTransactionsMock = vi.fn();
const createTransactionMock = vi.fn();
const updateTransactionMock = vi.fn();
const deleteTransactionMock = vi.fn();
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(index: number): Transaction {
  return {
    id: `transaction-${index}`,
    householdId: 'household-1',
    accountId: index % 2 === 0 ? 'account-2' : 'account-1',
    categoryId: index % 2 === 0 ? 'category-income' : 'category-food',
    type: index % 2 === 0 ? 'INCOME' : 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1000 + index },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: `Transaction ${index}`,
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
  };
}

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
    localStorage.clear();
    refreshTransactionsMock.mockReset();
    createTransactionMock.mockReset();
    updateTransactionMock.mockReset();
    deleteTransactionMock.mockReset();
    repositoryMocks.updateTransaction.mockReset();
    repositoryMocks.deleteTransaction.mockReset();
    repositoryMocks.fontScale.value = 1;
    deleteTransactionMock.mockReturnValue(true);
    repositoryMocks.updateTransaction.mockReturnValue({ id: 'updated-transaction' });
    repositoryMocks.deleteTransaction.mockReturnValue(true);

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
          tags: ['groceries'],
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
          accountId: 'account-2',
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
      foodMealTemplate: {
        parentCategory: null,
        subcategories: [],
        missingSubcategoryDefinitions: [],
      },
      ensureFoodMealCategories: vi.fn(),
    });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          purpose: 'personal',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 520000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
        {
          id: 'account-2',
          householdId: 'household-1',
          name: 'Business Checking',
          type: 'CHECKING',
          purpose: 'business',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 320000 },
          isArchived: false,
          sortOrder: 2,
          icon: 'briefcase',
          color: '#059669',
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
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Transactions')).toBeInTheDocument();
  });

  it('shows a results summary with count and net total for the visible ledger', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    const summary = screen.getByTestId('transactions-summary');
    // 3 transactions: +450000 income, -6742 and -12400 expenses = net 430858.
    expect(within(summary).getByText('3 transactions')).toBeInTheDocument();
    expect(within(summary).getByText('USD 430858')).toBeInTheDocument();
  });

  it('offers a Clear filters action when a search yields no results', async () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Search transactions'), {
      target: { value: 'zzz-no-such-transaction' },
    });
    // The free-text filter is debounced (#3798), so wait for the register to
    // reflect the search before asserting the empty state.
    await waitFor(() => expect(screen.getByText('No transactions found')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    // Results return and the summary reflects the full set again.
    expect(
      within(screen.getByTestId('transactions-summary')).getByText('3 transactions'),
    ).toBeInTheDocument();
  });

  it('offers an Add transaction action from the empty state when there are no transactions', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: createTransactionMock,
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(screen.getByRole('dialog', { name: 'Transaction form' })).toBeInTheDocument();
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

  it('offers a bypass-block skip link that targets the transaction results region (#3348)', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    const skipLink = screen.getByRole('link', { name: /skip to transaction results/i });
    expect(skipLink).toHaveAttribute('href', '#transaction-results');

    const resultsTarget = screen.getByRole('heading', { name: /transaction results/i });
    expect(resultsTarget).toHaveAttribute('id', 'transaction-results');
  });

  it('shows a visible, live result count near the results region (#3634)', () => {
    const { container } = render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    // Default fixture renders 3 transactions; the count is visible (not sr-only)
    // and exposed to assistive tech via role="status" + aria-live.
    const count = container.querySelector('.transaction-results-header__count');
    expect(count).not.toBeNull();
    expect(count?.textContent).toBe('3 transactions');
    expect(count).not.toHaveClass('sr-only');
    expect(count).toHaveAttribute('role', 'status');
    expect(count).toHaveAttribute('aria-live', 'polite');
  });

  it('uses singular wording for a single matching transaction (#3634)', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: [makeTransaction(1)],
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: createTransactionMock,
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    const { container } = render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    const count = container.querySelector('.transaction-results-header__count');
    expect(count?.textContent).toBe('1 transaction');
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

  it('filters transactions by account purpose', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '💼 Business' }));

    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();
    expect(screen.queryByText('Electric Bill')).not.toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
  });

  it('filters the register by debounced free-text search and restores on clear (#3200, #3798)', async () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    // All transactions are visible before searching.
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();

    const searchBox = screen.getByRole('searchbox', { name: /search transactions/i });

    // Typing a payee substring narrows the rendered register after the search
    // debounce settles (#3798), even though the mocked data hook returns every
    // row regardless of its filters.
    fireEvent.change(searchBox, { target: { value: 'Grocery' } });

    await waitFor(() => expect(screen.queryByText('Monthly Salary')).not.toBeInTheDocument());
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.queryByText('Electric Bill')).not.toBeInTheDocument();

    // Clearing the search restores the full list.
    fireEvent.change(searchBox, { target: { value: '' } });

    await waitFor(() => expect(screen.getByText('Monthly Salary')).toBeInTheDocument());
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
  });

  it('matches free-text search against transaction tags (#3200)', async () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    // "groceries" is only present as a tag on the Grocery Store transaction.
    fireEvent.change(screen.getByRole('searchbox', { name: /search transactions/i }), {
      target: { value: 'groceries' },
    });

    await waitFor(() => expect(screen.queryByText('Monthly Salary')).not.toBeInTheDocument());
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.queryByText('Electric Bill')).not.toBeInTheDocument();
  });

  it('composes free-text search with the account-purpose filter (#3200)', async () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    // Scope to business accounts: only the salary (account-2) remains.
    fireEvent.click(screen.getByRole('button', { name: '💼 Business' }));
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();

    const searchBox = screen.getByRole('searchbox', { name: /search transactions/i });

    // A search matching only a personal-account transaction yields no rows,
    // proving purpose + search compose with AND semantics.
    fireEvent.change(searchBox, { target: { value: 'Grocery' } });
    await waitFor(() => expect(screen.queryByText('Monthly Salary')).not.toBeInTheDocument());
    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();

    // A search matching the in-scope transaction keeps it visible.
    fireEvent.change(searchBox, { target: { value: 'Salary' } });
    await waitFor(() => expect(screen.getByText('Monthly Salary')).toBeInTheDocument());
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

  it('selects individual transactions and exposes the bulk toolbar count', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));

    expect(screen.getByRole('checkbox', { name: /select grocery store/i })).toBeChecked();
    expect(screen.getByRole('toolbar', { name: /bulk transaction actions/i })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selects all visible transactions from the register header checkbox', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select all visible transactions/i }));

    expect(screen.getByRole('checkbox', { name: /select grocery store/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select monthly salary/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select electric bill/i })).toBeChecked();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('supports shift-click range selection between transaction checkboxes', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select electric bill/i }), {
      shiftKey: true,
    });

    expect(screen.getByRole('checkbox', { name: /select grocery store/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select monthly salary/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select electric bill/i })).toBeChecked();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('bulk categorizes selected transactions through the toolbar', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));
    fireEvent.click(screen.getByRole('button', { name: /change category/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Utilities' }));

    expect(repositoryMocks.updateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'transaction-1',
      expect.objectContaining({ categoryId: 'category-utilities' }),
    );
    expect(refreshTransactionsMock).toHaveBeenCalled();
  });

  it('bulk adds tags while preserving existing transaction tags', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));
    fireEvent.click(screen.getByRole('button', { name: /add or remove tags/i }));
    fireEvent.change(screen.getByLabelText(/add tag/i), { target: { value: 'tax' } });
    fireEvent.click(screen.getByRole('button', { name: /^add tag$/i }));

    expect(repositoryMocks.updateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'transaction-1',
      expect.objectContaining({ tags: ['groceries', 'tax'] }),
    );
  });

  it('opens bulk delete confirmation and deletes selected transactions', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete 1 selected transactions/i }));

    const dialog = screen.getByRole('alertdialog', { name: /delete selected transactions/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(repositoryMocks.deleteTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'transaction-1',
    );
    expect(refreshTransactionsMock).toHaveBeenCalled();
  });

  it('uses keyboard shortcuts to move focus and toggle row selection', () => {
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByRole('checkbox', { name: /select grocery store/i })).toBeChecked();

    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'x' });

    expect(screen.getByRole('checkbox', { name: /select monthly salary/i })).toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('renders transaction cards instead of dense rows at huge text scale', () => {
    repositoryMocks.fontScale.value = 2;

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/showing 3 transactions as cards for large text/i)).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: /large text transaction card list/i })).toHaveLength(
      2,
    );
  });

  it('virtualizes large transaction registers instead of rendering every row', () => {
    mockedUseTransactions.mockReturnValue({
      transactions: Array.from({ length: 500 }, (_, index) => makeTransaction(index + 1)),
      loading: false,
      error: null,
      refresh: refreshTransactionsMock,
      createTransaction: createTransactionMock,
      updateTransaction: updateTransactionMock,
      deleteTransaction: deleteTransactionMock,
    });

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('list', { name: /virtualized transaction register/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/showing 500 transactions with virtual scrolling/i),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^edit /i }).length).toBeLessThan(100);
  });

  it('covers transaction amounts when privacy screen is active and reveals them when inactive', () => {
    const renderTransactions = (initialValue: boolean) =>
      render(
        <PrivacyModeProvider initialValue={initialValue}>
          <MemoryRouter>
            <TransactionsPage />
          </MemoryRouter>
        </PrivacyModeProvider>,
      );

    const active = renderTransactions(true);
    const activeText = document.body.textContent ?? '';
    const screenCoverage = evaluatePrivacyScreenCoverage([
      {
        id: 'transactions.register-amounts',
        categories: ['amount'],
        masked:
          !activeText.includes('$67.42') &&
          !activeText.includes('$4,500.00') &&
          !activeText.includes('$124.00'),
      },
    ]);
    const manifestCoverage = auditPrivacySurfaceCoverage(
      [privacySurface('transactions.register-amounts', 'detail', ['amount'], 'masked')],
      ['detail'],
    );

    expect(screenCoverage.safe).toBe(true);
    expect(manifestCoverage.complete).toBe(true);

    active.unmount();
    window.localStorage.clear();

    renderTransactions(false);
    expect(document.body).toHaveTextContent('-6742');
    expect(document.body).toHaveTextContent('450000');
    expect(document.body).toHaveTextContent('-12400');
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
    fireEvent.drop(
      screen.getByText('Utilities').closest('[data-drop-target-id="category-utilities"]')!,
      { dataTransfer },
    );

    expect(updateTransactionMock).toHaveBeenCalledWith('transaction-1', {
      categoryId: 'category-utilities',
    });
  });

  it('drops selected transactions as a batch and uses bulk recategorization', () => {
    const dataTransfer = createMockDataTransfer();
    repositoryMocks.updateTransaction.mockImplementation(
      (_db: unknown, transactionId: string, updates: { categoryId: string }) => ({
        id: transactionId,
        categoryId: updates.categoryId,
      }),
    );

    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /select grocery store/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /select monthly salary/i }));
    fireEvent.dragStart(screen.getByRole('group', { name: /actions for grocery store/i }), {
      dataTransfer,
    });
    fireEvent.drop(
      screen.getByText('Utilities').closest('[data-drop-target-id="category-utilities"]')!,
      { dataTransfer },
    );

    expect(repositoryMocks.updateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'transaction-1',
      { categoryId: 'category-utilities' },
    );
    expect(repositoryMocks.updateTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'transaction-2',
      { categoryId: 'category-utilities' },
    );
  });
});
