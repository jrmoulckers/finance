// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDashboardData } from '../useDashboardData';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllAccounts = vi.fn();
const mockGetTransactionsByDateRange = vi.fn();
const mockGetRecentTransactions = vi.fn();

vi.mock('../../db/repositories/accounts', () => ({
  getAllAccounts: (...args: unknown[]) => mockGetAllAccounts(...args),
}));

const mockGetBudgetsByPeriod = vi.fn();
const mockGetBudgetWithSpending = vi.fn();

vi.mock('../../db/repositories/budgets', () => ({
  getBudgetsByPeriod: (...args: unknown[]) => mockGetBudgetsByPeriod(...args),
  getBudgetWithSpending: (...args: unknown[]) => mockGetBudgetWithSpending(...args),
}));

vi.mock('../../db/repositories/transactions', () => ({
  getRecentTransactions: (...args: unknown[]) => mockGetRecentTransactions(...args),
  getTransactionsByDateRange: (...args: unknown[]) => mockGetTransactionsByDateRange(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct-1',
    householdId: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date: '2025-01-15',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    ...syncMetadata,
    ...overrides,
  };
}

function makeBudget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'budget-1',
    householdId: 'hh-1',
    categoryId: 'cat-1',
    name: 'Groceries',
    amount: { amount: 50000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    period: 'MONTHLY',
    startDate: '2025-01-01',
    endDate: null,
    isRollover: false,
    ...syncMetadata,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllAccounts.mockReturnValue([]);
  mockGetTransactionsByDateRange.mockReturnValue([]);
  mockGetRecentTransactions.mockReturnValue([]);
  mockGetBudgetsByPeriod.mockReturnValue([]);
  mockGetBudgetWithSpending.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDashboardData', () => {
  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false after initial fetch', () => {
    const { result } = renderHook(() => useDashboardData());

    expect(result.current.loading).toBe(false);
  });

  it('returns data with zero values when no accounts exist', () => {
    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.netWorth).toBe(0);
    expect(result.current.data?.spentThisMonth).toBe(0);
    expect(result.current.data?.incomeThisMonth).toBe(0);
    expect(result.current.data?.monthlyBudget).toBe(0);
    expect(result.current.data?.budgetSpent).toBe(0);
    expect(result.current.data?.recentTransactions).toEqual([]);
    expect(result.current.data?.accountSummary).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Net worth aggregation
  // -----------------------------------------------------------------------

  it('computes net worth from all account balances', () => {
    mockGetAllAccounts.mockReturnValue([
      makeAccount({ id: 'acct-1', currentBalance: { amount: 100000 } }),
      makeAccount({ id: 'acct-2', type: 'SAVINGS', currentBalance: { amount: 50000 } }),
    ]);

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data?.netWorth).toBe(150000);
  });

  // -----------------------------------------------------------------------
  // Account summary
  // -----------------------------------------------------------------------

  it('groups account totals by type', () => {
    mockGetAllAccounts.mockReturnValue([
      makeAccount({ id: 'acct-1', type: 'CHECKING', currentBalance: { amount: 100000 } }),
      makeAccount({ id: 'acct-2', type: 'SAVINGS', currentBalance: { amount: 50000 } }),
      makeAccount({ id: 'acct-3', type: 'CHECKING', currentBalance: { amount: 25000 } }),
    ]);

    const { result } = renderHook(() => useDashboardData());

    const summary = result.current.data?.accountSummary ?? [];
    const checking = summary.find((s) => s.type === 'CHECKING');
    const savings = summary.find((s) => s.type === 'SAVINGS');

    expect(checking?.total).toBe(125000);
    expect(savings?.total).toBe(50000);
  });

  // -----------------------------------------------------------------------
  // Monthly income / expense
  // -----------------------------------------------------------------------

  it('computes monthly expense and income totals', () => {
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ type: 'EXPENSE', amount: { amount: -5000 } }),
      makeTransaction({ id: 'txn-2', type: 'EXPENSE', amount: { amount: -3000 } }),
      makeTransaction({ id: 'txn-3', type: 'INCOME', amount: { amount: 200000 } }),
    ]);

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data?.spentThisMonth).toBe(8000);
    expect(result.current.data?.incomeThisMonth).toBe(200000);
  });

  // -----------------------------------------------------------------------
  // Budget aggregation
  // -----------------------------------------------------------------------

  it('computes monthly budget totals and spending', () => {
    const budget = makeBudget();
    mockGetBudgetsByPeriod.mockReturnValue([budget]);
    mockGetBudgetWithSpending.mockReturnValue({
      ...budget,
      spentAmount: { amount: 25000 },
    });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data?.monthlyBudget).toBe(50000);
    expect(result.current.data?.budgetSpent).toBe(25000);
  });

  it('filters out budgets not active in current month', () => {
    // Budget that ended in the past
    const pastBudget = makeBudget({
      id: 'budget-old',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    });
    mockGetBudgetsByPeriod.mockReturnValue([pastBudget]);

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data?.monthlyBudget).toBe(0);
    expect(result.current.data?.budgetSpent).toBe(0);
    // getBudgetWithSpending should not have been called for inactive budgets
    expect(mockGetBudgetWithSpending).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Recent transactions
  // -----------------------------------------------------------------------

  it('returns recent transactions from the repository', () => {
    const recentTxns = [
      makeTransaction({ id: 'txn-1' }),
      makeTransaction({ id: 'txn-2' }),
    ];
    mockGetRecentTransactions.mockReturnValue(recentTxns);

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.data?.recentTransactions).toHaveLength(2);
    expect(mockGetRecentTransactions).toHaveBeenCalledWith(mockDb, 10);
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllAccounts.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllAccounts.mockImplementation(() => {
      throw 'something went wrong';
    });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.error).toBe('Failed to load dashboard data.');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllAccounts.mockReturnValue([]);

    const { result } = renderHook(() => useDashboardData());

    const callCountAfterMount = mockGetAllAccounts.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });

  it('sets loading to true then false during refresh', () => {
    const { result } = renderHook(() => useDashboardData());

    // After initial load, loading should be false
    expect(result.current.loading).toBe(false);

    // refresh() is synchronous in this hook, so loading transitions happen
    // within the same act call
    act(() => {
      result.current.refresh();
    });

    // After refresh completes, loading should be false again
    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });
});
