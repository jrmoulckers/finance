// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category, Transaction } from '../../kmp/bridge';
import {
  useSpendingWatchlist,
  classifyStatus,
  loadWatchlists,
  saveWatchlists,
} from '../useSpendingWatchlist';
import type { Watchlist } from '../useSpendingWatchlist';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllCategories = vi.fn<(...args: unknown[]) => Category[]>();

vi.mock('../../db/repositories/categories', () => ({
  getAllCategories: (...args: unknown[]) => mockGetAllCategories(...args),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const mockGetAllTransactions = vi.fn<(...args: unknown[]) => Transaction[]>();
const mockGetTransactionsByDateRange = vi.fn<(...args: unknown[]) => Transaction[]>();

vi.mock('../../db/repositories/transactions', () => ({
  getAllTransactions: (...args: unknown[]) => mockGetAllTransactions(...args),
  getTransactionsByAccount: vi.fn().mockReturnValue([]),
  getTransactionsByCategory: vi.fn().mockReturnValue([]),
  getTransactionsByDateRange: (...args: unknown[]) => mockGetTransactionsByDateRange(...args),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
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

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-groceries',
    householdId: 'hh-1',
    name: 'Groceries',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: 'cat-groceries',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 5000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date: new Date().toISOString().slice(0, 10),
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    ...syncMetadata,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSpendingWatchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetAllCategories.mockReturnValue([
      makeCategory(),
      makeCategory({ id: 'cat-dining', name: 'Dining' }),
    ]);
    mockGetTransactionsByDateRange.mockReturnValue([]);
    mockGetAllTransactions.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // classifyStatus helper
  // -----------------------------------------------------------------------

  describe('classifyStatus', () => {
    it('returns safe for percentages below 75', () => {
      expect(classifyStatus(0)).toBe('safe');
      expect(classifyStatus(50)).toBe('safe');
      expect(classifyStatus(74)).toBe('safe');
    });

    it('returns warning for percentages 75 to 100 inclusive', () => {
      expect(classifyStatus(75)).toBe('warning');
      expect(classifyStatus(90)).toBe('warning');
      expect(classifyStatus(100)).toBe('warning');
    });

    it('returns exceeded for percentages above 100', () => {
      expect(classifyStatus(101)).toBe('exceeded');
      expect(classifyStatus(200)).toBe('exceeded');
    });
  });

  // -----------------------------------------------------------------------
  // localStorage persistence
  // -----------------------------------------------------------------------

  describe('localStorage persistence', () => {
    it('loads empty array when no stored data', () => {
      expect(loadWatchlists()).toEqual([]);
    });

    it('round-trips watchlists through save/load', () => {
      const items: Watchlist[] = [
        {
          id: 'wl-1',
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          monthlyThreshold: 50000,
          isActive: true,
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];
      saveWatchlists(items);
      expect(loadWatchlists()).toEqual(items);
    });

    it('returns empty array for corrupt JSON', () => {
      localStorage.setItem('finance-spending-watchlists', '{bad json');
      expect(loadWatchlists()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // addWatchlist
  // -----------------------------------------------------------------------

  it('adds a watchlist and persists to localStorage', () => {
    const { result } = renderHook(() => useSpendingWatchlist());

    act(() => {
      result.current.addWatchlist('cat-groceries', 50000);
    });

    expect(result.current.watchlists).toHaveLength(1);
    expect(result.current.watchlists[0]!.watchlist.categoryId).toBe('cat-groceries');
    expect(result.current.watchlists[0]!.watchlist.categoryName).toBe('Groceries');
    expect(result.current.watchlists[0]!.watchlist.monthlyThreshold).toBe(50000);
    expect(result.current.watchlists[0]!.watchlist.isActive).toBe(true);

    // Persisted to localStorage
    const stored = loadWatchlists();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.categoryId).toBe('cat-groceries');
  });

  // -----------------------------------------------------------------------
  // Percentage calculation
  // -----------------------------------------------------------------------

  it('calculates correct percentage based on current spending', () => {
    // Pre-seed a watchlist
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 10000, // $100.00
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // Transactions totalling $50 (5000 cents) → 50%
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', amount: { amount: 3000 } }),
      makeTransaction({ id: 'txn-2', amount: { amount: 2000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists[0]!.currentSpending).toBe(5000);
    expect(result.current.watchlists[0]!.percentage).toBe(50);
    expect(result.current.watchlists[0]!.remaining).toBe(5000);
  });

  // -----------------------------------------------------------------------
  // Status classification (safe / warning / exceeded)
  // -----------------------------------------------------------------------

  it('returns safe status when spending is below 75%', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 10000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', amount: { amount: 5000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists[0]!.status).toBe('safe');
  });

  it('returns warning status when spending is between 75% and 100%', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 10000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // 8000 / 10000 = 80% → warning
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', amount: { amount: 8000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists[0]!.status).toBe('warning');
    expect(result.current.watchlists[0]!.percentage).toBe(80);
  });

  it('returns exceeded status when spending is above 100%', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 10000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // 12000 / 10000 = 120% → exceeded
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', amount: { amount: 12000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists[0]!.status).toBe('exceeded');
    expect(result.current.watchlists[0]!.percentage).toBe(120);
    expect(result.current.watchlists[0]!.remaining).toBe(-2000);
  });

  // -----------------------------------------------------------------------
  // Alerts filtering
  // -----------------------------------------------------------------------

  it('alerts only include warning and exceeded items', () => {
    saveWatchlists([
      {
        id: 'wl-safe',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 100000, // High limit
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'wl-warning',
        categoryId: 'cat-dining',
        categoryName: 'Dining',
        monthlyThreshold: 5000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // Groceries: 1000 / 100000 = 1% (safe)
    // Dining: 4000 / 5000 = 80% (warning)
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', categoryId: 'cat-groceries', amount: { amount: 1000 } }),
      makeTransaction({ id: 'txn-2', categoryId: 'cat-dining', amount: { amount: 4000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists).toHaveLength(2);
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]!.watchlist.id).toBe('wl-warning');
  });

  it('excludes inactive watchlists from alerts', () => {
    saveWatchlists([
      {
        id: 'wl-warning-inactive',
        categoryId: 'cat-dining',
        categoryName: 'Dining',
        monthlyThreshold: 5000,
        isActive: false, // Inactive
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // 4000 / 5000 = 80% (would be warning but inactive)
    mockGetTransactionsByDateRange.mockReturnValue([
      makeTransaction({ id: 'txn-1', categoryId: 'cat-dining', amount: { amount: 4000 } }),
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists).toHaveLength(1);
    expect(result.current.alerts).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // removeWatchlist
  // -----------------------------------------------------------------------

  it('removes a watchlist and persists to localStorage', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 50000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'wl-2',
        categoryId: 'cat-dining',
        categoryName: 'Dining',
        monthlyThreshold: 20000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists).toHaveLength(2);

    act(() => {
      result.current.removeWatchlist('wl-1');
    });

    expect(result.current.watchlists).toHaveLength(1);
    expect(result.current.watchlists[0]!.watchlist.id).toBe('wl-2');

    const stored = loadWatchlists();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).toBe('wl-2');
  });

  // -----------------------------------------------------------------------
  // toggleActive
  // -----------------------------------------------------------------------

  it('toggles active state and persists', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 50000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists[0]!.watchlist.isActive).toBe(true);

    act(() => {
      result.current.toggleActive('wl-1');
    });

    expect(result.current.watchlists[0]!.watchlist.isActive).toBe(false);

    // Toggle back
    act(() => {
      result.current.toggleActive('wl-1');
    });

    expect(result.current.watchlists[0]!.watchlist.isActive).toBe(true);

    const stored = loadWatchlists();
    expect(stored[0]!.isActive).toBe(true);
  });

  // -----------------------------------------------------------------------
  // updateThreshold
  // -----------------------------------------------------------------------

  it('updates threshold and persists', () => {
    saveWatchlists([
      {
        id: 'wl-1',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        monthlyThreshold: 50000,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { result } = renderHook(() => useSpendingWatchlist());

    act(() => {
      result.current.updateThreshold('wl-1', 75000);
    });

    expect(result.current.watchlists[0]!.watchlist.monthlyThreshold).toBe(75000);

    const stored = loadWatchlists();
    expect(stored[0]!.monthlyThreshold).toBe(75000);
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it('returns empty arrays when no watchlists exist', () => {
    const { result } = renderHook(() => useSpendingWatchlist());

    expect(result.current.watchlists).toEqual([]);
    expect(result.current.alerts).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
