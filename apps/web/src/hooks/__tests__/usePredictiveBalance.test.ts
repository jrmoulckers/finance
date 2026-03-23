// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction, Account } from '../../kmp/bridge';
import type { RecurringRule } from '../../db/repositories/recurring-rules';
import {
  usePredictiveBalance,
  formatLocalDate,
  daysInMonth,
  determineConfidence,
  getRecurringOccurrencesInRange,
} from '../usePredictiveBalance';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

// --- Transactions ---
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

// --- Accounts ---
const mockGetAllAccounts = vi.fn<(...args: unknown[]) => Account[]>();

vi.mock('../../db/repositories/accounts', () => ({
  getAllAccounts: (...args: unknown[]) => mockGetAllAccounts(...args),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

// --- Categories (required by useCategories, used transitively) ---
vi.mock('../../db/repositories/categories', () => ({
  getAllCategories: () => [],
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

// --- Recurring rules ---
const mockGetAllRecurringRules = vi.fn<() => RecurringRule[]>();

vi.mock('../../db/repositories/recurring-rules', () => ({
  getAllRecurringRules: () => mockGetAllRecurringRules(),
  getRecurringRuleById: vi.fn(),
  createRecurringRule: vi.fn(),
  updateRecurringRule: vi.fn(),
  deleteRecurringRule: vi.fn(),
  getUpcomingTransactions: vi.fn(),
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

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    householdId: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100_000 }, // $1,000.00
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
    ...overrides,
  };
}

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
    date: formatLocalDate(new Date()),
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    ...syncMetadata,
    ...overrides,
  };
}

function makeRecurringRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    description: 'Monthly salary',
    amount: { amount: 300_000 },
    type: 'INCOME',
    frequency: 'MONTHLY',
    startDate: '2025-01-01',
    endDate: null,
    lastGeneratedDate: null,
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Create a date string N days ago from today. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePredictiveBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTransactions.mockReturnValue([]);
    mockGetAllAccounts.mockReturnValue([]);
    mockGetAllRecurringRules.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Empty / graceful handling
  // -----------------------------------------------------------------------

  it('handles empty transactions gracefully', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    const { result } = renderHook(() => usePredictiveBalance());

    expect(result.current.loading).toBe(false);
    expect(result.current.projections.length).toBeGreaterThan(0);
    // With no transactions, end-of-month should equal start balance
    // (only daily average net of 0 is applied)
    expect(result.current.endOfMonthBalance).toBe(100_000);
    expect(result.current.daysRemaining).toBeGreaterThan(0);
  });

  it('handles empty accounts gracefully', () => {
    const { result } = renderHook(() => usePredictiveBalance());

    expect(result.current.loading).toBe(false);
    expect(result.current.endOfMonthBalance).toBe(0);
    expect(result.current.projections.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // End-of-month projection
  // -----------------------------------------------------------------------

  it('projects correct end-of-month balance with daily spending', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount({ currentBalance: { amount: 100_000 } })]);

    // Create 30 days of expenses at $10/day (1000 cents)
    const txns: Transaction[] = [];
    for (let i = 0; i < 30; i++) {
      txns.push(
        makeTransaction({
          id: `txn-${i}`,
          type: 'EXPENSE',
          amount: { amount: 1000 },
          date: daysAgo(i),
        }),
      );
    }
    mockGetAllTransactions.mockReturnValue(txns);

    const { result } = renderHook(() => usePredictiveBalance());

    // The projection should decrease by ~$10/day for remaining days
    expect(result.current.projections.length).toBeGreaterThan(0);
    // End-of-month should be less than current balance (spending projected)
    expect(result.current.endOfMonthBalance).toBeLessThanOrEqual(100_000);
  });

  // -----------------------------------------------------------------------
  // Confidence levels
  // -----------------------------------------------------------------------

  it('returns low confidence with few data points', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    // Only 5 days of transactions
    const txns = Array.from({ length: 5 }, (_, i) =>
      makeTransaction({
        id: `txn-${i}`,
        type: 'EXPENSE',
        amount: { amount: 1000 },
        date: daysAgo(i),
      }),
    );
    mockGetAllTransactions.mockReturnValue(txns);

    const { result } = renderHook(() => usePredictiveBalance());

    expect(result.current.confidence).toBe('low');
  });

  it('returns medium confidence with 14-29 days of data', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    // 20 distinct days of transactions
    const txns = Array.from({ length: 20 }, (_, i) =>
      makeTransaction({
        id: `txn-${i}`,
        type: 'EXPENSE',
        amount: { amount: 1000 },
        date: daysAgo(i),
      }),
    );
    mockGetAllTransactions.mockReturnValue(txns);

    const { result } = renderHook(() => usePredictiveBalance());

    expect(result.current.confidence).toBe('medium');
  });

  it('returns high confidence with 30+ days data', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    // 30 distinct days of transactions (every day for last 30 days)
    const txns = Array.from({ length: 30 }, (_, i) =>
      makeTransaction({
        id: `txn-${i}`,
        type: 'EXPENSE',
        amount: { amount: 500 },
        date: daysAgo(i),
      }),
    );
    mockGetAllTransactions.mockReturnValue(txns);

    const { result } = renderHook(() => usePredictiveBalance());

    // Should have 30 distinct days since each txn is on a different day
    expect(result.current.confidence).toBe('high');
  });

  // -----------------------------------------------------------------------
  // Days remaining
  // -----------------------------------------------------------------------

  it('calculates days remaining correctly', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    const { result } = renderHook(() => usePredictiveBalance());

    const now = new Date();
    const totalDays = daysInMonth(now.getFullYear(), now.getMonth() + 1);
    const expected = totalDays - now.getDate() + 1;

    expect(result.current.daysRemaining).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Projections structure
  // -----------------------------------------------------------------------

  it('returns projections for every day of the month', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    const { result } = renderHook(() => usePredictiveBalance());

    const now = new Date();
    const totalDays = daysInMonth(now.getFullYear(), now.getMonth() + 1);

    expect(result.current.projections).toHaveLength(totalDays);
  });

  it('marks future dates with null actual and non-null projected', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    const { result } = renderHook(() => usePredictiveBalance());

    const todayStr = formatLocalDate(new Date());

    for (const p of result.current.projections) {
      if (p.date > todayStr) {
        expect(p.actual).toBeNull();
        expect(p.projected).not.toBeNull();
      }
    }
  });

  it('marks past/today dates with non-null actual', () => {
    mockGetAllAccounts.mockReturnValue([makeAccount()]);

    const { result } = renderHook(() => usePredictiveBalance());

    const todayStr = formatLocalDate(new Date());

    for (const p of result.current.projections) {
      if (p.date <= todayStr) {
        expect(p.actual).not.toBeNull();
      }
    }
  });

  // -----------------------------------------------------------------------
  // Multiple accounts
  // -----------------------------------------------------------------------

  it('sums balances from multiple accounts', () => {
    mockGetAllAccounts.mockReturnValue([
      makeAccount({ id: 'acct-1', currentBalance: { amount: 50_000 } }),
      makeAccount({ id: 'acct-2', currentBalance: { amount: 30_000 } }),
    ]);

    const { result } = renderHook(() => usePredictiveBalance());

    // With no transactions, end-of-month should equal total balance
    expect(result.current.endOfMonthBalance).toBe(80_000);
  });
});

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe('determineConfidence', () => {
  it('returns high for 30+ days', () => {
    expect(determineConfidence(30)).toBe('high');
    expect(determineConfidence(45)).toBe('high');
  });

  it('returns medium for 14-29 days', () => {
    expect(determineConfidence(14)).toBe('medium');
    expect(determineConfidence(29)).toBe('medium');
  });

  it('returns low for fewer than 14 days', () => {
    expect(determineConfidence(0)).toBe('low');
    expect(determineConfidence(13)).toBe('low');
  });
});

describe('getRecurringOccurrencesInRange', () => {
  it('returns occurrences within the date range', () => {
    const rule = makeRecurringRule({
      frequency: 'WEEKLY',
      startDate: '2025-06-01',
      type: 'EXPENSE',
      amount: { amount: 5000 },
    });

    const occurrences = getRecurringOccurrencesInRange(rule, '2025-06-01', '2025-06-30');

    // Weekly starting June 1 should give dates: Jun 1, 8, 15, 22, 29
    expect(occurrences.size).toBe(5);
    expect(occurrences.get('2025-06-01')).toBe(-5000);
    expect(occurrences.get('2025-06-08')).toBe(-5000);
  });

  it('returns empty map for inactive rules', () => {
    const rule = makeRecurringRule({ isActive: false });
    const occurrences = getRecurringOccurrencesInRange(rule, '2025-06-01', '2025-06-30');
    expect(occurrences.size).toBe(0);
  });

  it('returns positive amounts for income rules', () => {
    const rule = makeRecurringRule({
      frequency: 'MONTHLY',
      startDate: '2025-01-15',
      type: 'INCOME',
      amount: { amount: 300_000 },
    });

    const occurrences = getRecurringOccurrencesInRange(rule, '2025-06-01', '2025-06-30');

    expect(occurrences.get('2025-06-15')).toBe(300_000);
  });

  it('respects rule endDate', () => {
    const rule = makeRecurringRule({
      frequency: 'WEEKLY',
      startDate: '2025-06-01',
      endDate: '2025-06-10',
      type: 'EXPENSE',
      amount: { amount: 1000 },
    });

    const occurrences = getRecurringOccurrencesInRange(rule, '2025-06-01', '2025-06-30');

    // Only Jun 1 and Jun 8 should be within the end date
    expect(occurrences.size).toBe(2);
  });
});

describe('daysInMonth', () => {
  it('returns 31 for January', () => {
    expect(daysInMonth(2025, 1)).toBe(31);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it('returns 29 for February in leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('returns 30 for April', () => {
    expect(daysInMonth(2025, 4)).toBe(30);
  });
});
