// SPDX-License-Identifier: BUSL-1.1

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction, Category } from '../../kmp/bridge';
import { useInsights } from '../useInsights';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllTransactions = vi.fn<(...args: unknown[]) => Transaction[]>();

vi.mock('../../db/repositories/transactions', () => ({
  getAllTransactions: (...args: unknown[]) => mockGetAllTransactions(...args),
  getTransactionsByAccount: () => [],
  getTransactionsByCategory: () => [],
  getTransactionsByDateRange: () => [],
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

const mockGetAllCategories = vi.fn<(...args: unknown[]) => Category[]>();

vi.mock('../../db/repositories/categories', () => ({
  getAllCategories: (...args: unknown[]) => mockGetAllCategories(...args),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
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

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: 'cat-1',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 5000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery Store',
    note: null,
    date: '2025-03-06',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    ...syncMetadata,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    householdId: 'hh-1',
    name: 'Groceries',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    ...syncMetadata,
    ...overrides,
  };
}

/**
 * Create a date string N months before "now" (uses the system clock in the
 * hook, so we just need dates that fall within the lookback window).
 */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(15); // mid-month to safely land in the target month
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTransactions.mockReturnValue([]);
    mockGetAllCategories.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it('returns zeroes when there are no transactions', () => {
    const { result } = renderHook(() => useInsights());

    expect(result.current.averageDailySpend).toBe(0);
    expect(result.current.savingsRate).toBe(0);
    expect(result.current.topPayees).toEqual([]);
    expect(result.current.categoryBreakdown).toEqual([]);
    // monthlyBreakdown should still contain empty month entries
    expect(result.current.monthlyBreakdown.length).toBeGreaterThan(0);
    result.current.monthlyBreakdown.forEach((m) => {
      expect(m.income).toBe(0);
      expect(m.expenses).toBe(0);
      expect(m.net).toBe(0);
      expect(m.transactionCount).toBe(0);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Monthly breakdown
  // -----------------------------------------------------------------------

  it('correctly groups transactions by month', () => {
    const month1Date = monthsAgo(1);
    const month2Date = monthsAgo(2);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'EXPENSE', amount: { amount: 1000 }, date: month1Date }),
      makeTransaction({ id: 'txn-2', type: 'EXPENSE', amount: { amount: 2000 }, date: month1Date }),
      makeTransaction({ id: 'txn-3', type: 'INCOME', amount: { amount: 5000 }, date: month2Date }),
      makeTransaction({ id: 'txn-4', type: 'EXPENSE', amount: { amount: 500 }, date: month2Date }),
    ]);

    const { result } = renderHook(() => useInsights());

    const month1Key = month1Date.slice(0, 7);
    const month2Key = month2Date.slice(0, 7);

    const m1 = result.current.monthlyBreakdown.find((m) => m.month === month1Key);
    const m2 = result.current.monthlyBreakdown.find((m) => m.month === month2Key);

    expect(m1).toBeDefined();
    expect(m1!.expenses).toBe(3000);
    expect(m1!.income).toBe(0);
    expect(m1!.net).toBe(-3000);
    expect(m1!.transactionCount).toBe(2);

    expect(m2).toBeDefined();
    expect(m2!.income).toBe(5000);
    expect(m2!.expenses).toBe(500);
    expect(m2!.net).toBe(4500);
    expect(m2!.transactionCount).toBe(2);
  });

  // -----------------------------------------------------------------------
  // Category breakdown
  // -----------------------------------------------------------------------

  it('computes category percentages correctly', () => {
    const date = monthsAgo(1);

    mockGetAllCategories.mockReturnValue([
      makeCategory({ id: 'cat-food', name: 'Food' }),
      makeCategory({ id: 'cat-transport', name: 'Transport' }),
    ]);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({
        id: 'txn-1',
        type: 'EXPENSE',
        amount: { amount: 7500 },
        categoryId: 'cat-food',
        date,
      }),
      makeTransaction({
        id: 'txn-2',
        type: 'EXPENSE',
        amount: { amount: 2500 },
        categoryId: 'cat-transport',
        date,
      }),
    ]);

    const { result } = renderHook(() => useInsights());

    expect(result.current.categoryBreakdown).toHaveLength(2);

    const food = result.current.categoryBreakdown.find((c) => c.categoryId === 'cat-food');
    const transport = result.current.categoryBreakdown.find(
      (c) => c.categoryId === 'cat-transport',
    );

    expect(food).toBeDefined();
    expect(food!.total).toBe(7500);
    expect(food!.percentage).toBeCloseTo(75, 0);
    expect(food!.categoryName).toBe('Food');

    expect(transport).toBeDefined();
    expect(transport!.total).toBe(2500);
    expect(transport!.percentage).toBeCloseTo(25, 0);
    expect(transport!.categoryName).toBe('Transport');
  });

  it('groups uncategorized transactions correctly', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({
        id: 'txn-1',
        type: 'EXPENSE',
        amount: { amount: 3000 },
        categoryId: null,
        date,
      }),
    ]);

    const { result } = renderHook(() => useInsights());

    expect(result.current.categoryBreakdown).toHaveLength(1);
    expect(result.current.categoryBreakdown[0].categoryName).toBe('Uncategorized');
    expect(result.current.categoryBreakdown[0].categoryId).toBeNull();
    expect(result.current.categoryBreakdown[0].percentage).toBeCloseTo(100, 0);
  });

  // -----------------------------------------------------------------------
  // Top payees
  // -----------------------------------------------------------------------

  it('returns top payees sorted by total descending', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({
        id: 'txn-1',
        type: 'EXPENSE',
        amount: { amount: 1000 },
        payee: 'Coffee Shop',
        date,
      }),
      makeTransaction({
        id: 'txn-2',
        type: 'EXPENSE',
        amount: { amount: 5000 },
        payee: 'Grocery Store',
        date,
      }),
      makeTransaction({
        id: 'txn-3',
        type: 'EXPENSE',
        amount: { amount: 2000 },
        payee: 'Coffee Shop',
        date,
      }),
      makeTransaction({
        id: 'txn-4',
        type: 'EXPENSE',
        amount: { amount: 500 },
        payee: 'Gas Station',
        date,
      }),
    ]);

    const { result } = renderHook(() => useInsights());

    expect(result.current.topPayees).toHaveLength(3);
    expect(result.current.topPayees[0].name).toBe('Grocery Store');
    expect(result.current.topPayees[0].total).toBe(5000);
    expect(result.current.topPayees[0].transactionCount).toBe(1);

    expect(result.current.topPayees[1].name).toBe('Coffee Shop');
    expect(result.current.topPayees[1].total).toBe(3000);
    expect(result.current.topPayees[1].transactionCount).toBe(2);

    expect(result.current.topPayees[2].name).toBe('Gas Station');
    expect(result.current.topPayees[2].total).toBe(500);
  });

  it('limits top payees to 10', () => {
    const date = monthsAgo(1);

    const transactions = Array.from({ length: 15 }, (_, i) =>
      makeTransaction({
        id: `txn-${i}`,
        type: 'EXPENSE',
        amount: { amount: (i + 1) * 100 },
        payee: `Payee ${i}`,
        date,
      }),
    );

    mockGetAllTransactions.mockReturnValue(transactions);

    const { result } = renderHook(() => useInsights());

    expect(result.current.topPayees).toHaveLength(10);
    // First entry should be the payee with the highest amount
    expect(result.current.topPayees[0].name).toBe('Payee 14');
    expect(result.current.topPayees[0].total).toBe(1500);
  });

  // -----------------------------------------------------------------------
  // Savings rate
  // -----------------------------------------------------------------------

  it('calculates savings rate as (income - expenses) / income', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'INCOME', amount: { amount: 10000 }, date }),
      makeTransaction({ id: 'txn-2', type: 'EXPENSE', amount: { amount: 7000 }, date }),
    ]);

    const { result } = renderHook(() => useInsights());

    // (10000 - 7000) / 10000 = 30%
    expect(result.current.savingsRate).toBe(30);
  });

  it('returns 0 savings rate when there is no income', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'EXPENSE', amount: { amount: 5000 }, date }),
    ]);

    const { result } = renderHook(() => useInsights());

    expect(result.current.savingsRate).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Average daily spend
  // -----------------------------------------------------------------------

  it('calculates average daily spend as total expenses / days in period', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'EXPENSE', amount: { amount: 6000 }, date }),
      makeTransaction({ id: 'txn-2', type: 'EXPENSE', amount: { amount: 4000 }, date }),
    ]);

    const { result } = renderHook(() => useInsights());

    // Total expenses = 10000 cents, divided by ~183 days (6 months default)
    // We just verify it's a reasonable positive number
    expect(result.current.averageDailySpend).toBeGreaterThan(0);
    expect(result.current.averageDailySpend).toBeLessThan(10000);
  });

  it('returns 0 average daily spend when there are no expenses', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'INCOME', amount: { amount: 5000 }, date }),
    ]);

    const { result } = renderHook(() => useInsights());

    expect(result.current.averageDailySpend).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Period selection
  // -----------------------------------------------------------------------

  it('defaults to 6-month period', () => {
    const { result } = renderHook(() => useInsights());

    expect(result.current.selectedPeriod).toBe(6);
  });

  it('changes results when period is updated', () => {
    // Place one transaction at 4 months ago — visible in 6-month but not 3-month
    const fourMonthsAgo = monthsAgo(4);
    const oneMonthAgo = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({
        id: 'txn-1',
        type: 'EXPENSE',
        amount: { amount: 1000 },
        date: fourMonthsAgo,
      }),
      makeTransaction({
        id: 'txn-2',
        type: 'EXPENSE',
        amount: { amount: 2000 },
        date: oneMonthAgo,
      }),
    ]);

    const { result } = renderHook(() => useInsights());

    // With 6-month default, both should be included
    const totalExpenses6m = result.current.monthlyBreakdown.reduce((sum, m) => sum + m.expenses, 0);
    expect(totalExpenses6m).toBe(3000);

    // Switch to 3 months — only the 1-month-ago transaction should count
    act(() => {
      result.current.setSelectedPeriod(3);
    });

    expect(result.current.selectedPeriod).toBe(3);
    const totalExpenses3m = result.current.monthlyBreakdown.reduce((sum, m) => sum + m.expenses, 0);
    expect(totalExpenses3m).toBe(2000);
  });

  // -----------------------------------------------------------------------
  // Transfer transactions
  // -----------------------------------------------------------------------

  it('excludes transfer transactions from income and expense totals', () => {
    const date = monthsAgo(1);

    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', type: 'INCOME', amount: { amount: 5000 }, date }),
      makeTransaction({ id: 'txn-2', type: 'EXPENSE', amount: { amount: 3000 }, date }),
      makeTransaction({ id: 'txn-3', type: 'TRANSFER', amount: { amount: 2000 }, date }),
    ]);

    const { result } = renderHook(() => useInsights());

    const monthKey = date.slice(0, 7);
    const month = result.current.monthlyBreakdown.find((m) => m.month === monthKey);

    expect(month).toBeDefined();
    expect(month!.income).toBe(5000);
    expect(month!.expenses).toBe(3000);
    // Transfer should still count in transactionCount
    expect(month!.transactionCount).toBe(3);
  });
});
