// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '../../kmp/bridge';
import { useTransactions } from '../useTransactions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllTransactions = vi.fn<(...args: unknown[]) => Transaction[]>();
const mockGetTransactionsByAccount = vi.fn<(...args: unknown[]) => Transaction[]>();
const mockGetTransactionsByCategory = vi.fn<(...args: unknown[]) => Transaction[]>();
const mockGetTransactionsByDateRange = vi.fn<(...args: unknown[]) => Transaction[]>();
const mockCreateTransaction = vi.fn<(...args: unknown[]) => Transaction>();
const mockUpdateTransaction = vi.fn<(...args: unknown[]) => Transaction | null>();
const mockDeleteTransaction = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('../../db/repositories/transactions', () => ({
  getAllTransactions: (...args: unknown[]) => mockGetAllTransactions(...args),
  getTransactionsByAccount: (...args: unknown[]) => mockGetTransactionsByAccount(...args),
  getTransactionsByCategory: (...args: unknown[]) => mockGetTransactionsByCategory(...args),
  getTransactionsByDateRange: (...args: unknown[]) => mockGetTransactionsByDateRange(...args),
  createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
  updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
  deleteTransaction: (...args: unknown[]) => mockDeleteTransaction(...args),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTransactions.mockReturnValue([]);
    mockGetTransactionsByAccount.mockReturnValue([]);
    mockGetTransactionsByCategory.mockReturnValue([]);
    mockGetTransactionsByDateRange.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false and empty list when no transactions exist', () => {
    const { result } = renderHook(() => useTransactions());

    expect(result.current.loading).toBe(false);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns transactions from the database', () => {
    const txns = [makeTransaction(), makeTransaction({ id: 'txn-2', payee: 'Coffee Shop' })];
    mockGetAllTransactions.mockReturnValue(txns);

    const { result } = renderHook(() => useTransactions());

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions[0]?.payee).toBe('Grocery Store');
    expect(result.current.transactions[1]?.payee).toBe('Coffee Shop');
    expect(result.current.loading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllTransactions.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useTransactions());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.transactions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllTransactions.mockImplementation(() => {
      throw 'unknown failure';
    });

    const { result } = renderHook(() => useTransactions());

    expect(result.current.error).toBe('Failed to load transactions.');
  });

  // -----------------------------------------------------------------------
  // Filtering — accountId primary query
  // -----------------------------------------------------------------------

  it('uses getTransactionsByAccount when accountId filter is provided', () => {
    const txn = makeTransaction({ accountId: 'acct-1' });
    mockGetTransactionsByAccount.mockReturnValue([txn]);

    const { result } = renderHook(() => useTransactions({ accountId: 'acct-1' }));

    expect(mockGetTransactionsByAccount).toHaveBeenCalledWith(mockDb, 'acct-1', expect.any(Object));
    expect(result.current.transactions).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Filtering — categoryId primary query
  // -----------------------------------------------------------------------

  it('uses getTransactionsByCategory when categoryId filter is provided', () => {
    const txn = makeTransaction({ categoryId: 'cat-food' });
    mockGetTransactionsByCategory.mockReturnValue([txn]);

    const { result } = renderHook(() => useTransactions({ categoryId: 'cat-food' }));

    expect(mockGetTransactionsByCategory).toHaveBeenCalledWith(
      mockDb,
      'cat-food',
      expect.any(Object),
    );
    expect(result.current.transactions).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Filtering — date range
  // -----------------------------------------------------------------------

  it('uses getTransactionsByDateRange when both dates are provided', () => {
    const txn = makeTransaction({ date: '2025-03-05' });
    mockGetTransactionsByDateRange.mockReturnValue([txn]);

    const { result } = renderHook(() =>
      useTransactions({ startDate: '2025-03-01', endDate: '2025-03-31' }),
    );

    expect(mockGetTransactionsByDateRange).toHaveBeenCalledWith(
      mockDb,
      '2025-03-01',
      '2025-03-31',
      expect.any(Object),
    );
    expect(result.current.transactions).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Filtering — startDate only (post-filter)
  // -----------------------------------------------------------------------

  it('post-filters by startDate when only startDate is provided', () => {
    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', date: '2025-02-28' }),
      makeTransaction({ id: 'txn-2', date: '2025-03-01' }),
      makeTransaction({ id: 'txn-3', date: '2025-03-15' }),
    ]);

    const { result } = renderHook(() => useTransactions({ startDate: '2025-03-01' }));

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions.map((t) => t.id)).toEqual(['txn-2', 'txn-3']);
  });

  // -----------------------------------------------------------------------
  // Filtering — endDate only (post-filter)
  // -----------------------------------------------------------------------

  it('post-filters by endDate when only endDate is provided', () => {
    mockGetAllTransactions.mockReturnValue([
      makeTransaction({ id: 'txn-1', date: '2025-02-28' }),
      makeTransaction({ id: 'txn-2', date: '2025-03-01' }),
      makeTransaction({ id: 'txn-3', date: '2025-03-15' }),
    ]);

    const { result } = renderHook(() => useTransactions({ endDate: '2025-03-01' }));

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions.map((t) => t.id)).toEqual(['txn-1', 'txn-2']);
  });

  // -----------------------------------------------------------------------
  // Filtering — accountId + categoryId (local post-filter)
  // -----------------------------------------------------------------------

  it('post-filters by categoryId when both accountId and categoryId are provided', () => {
    mockGetTransactionsByAccount.mockReturnValue([
      makeTransaction({ id: 'txn-1', categoryId: 'cat-food' }),
      makeTransaction({ id: 'txn-2', categoryId: 'cat-transport' }),
    ]);

    const { result } = renderHook(() =>
      useTransactions({ accountId: 'acct-1', categoryId: 'cat-food' }),
    );

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]?.categoryId).toBe('cat-food');
  });

  // -----------------------------------------------------------------------
  // Filtering — limit
  // -----------------------------------------------------------------------

  it('applies limit via local slice when local post-filtering is needed', () => {
    mockGetTransactionsByAccount.mockReturnValue([
      makeTransaction({ id: 'txn-1', categoryId: 'cat-food' }),
      makeTransaction({ id: 'txn-2', categoryId: 'cat-food' }),
      makeTransaction({ id: 'txn-3', categoryId: 'cat-food' }),
    ]);

    const { result } = renderHook(() =>
      useTransactions({ accountId: 'acct-1', categoryId: 'cat-food', limit: 2 }),
    );

    expect(result.current.transactions).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Filtering — searchTerm and type passed to repository
  // -----------------------------------------------------------------------

  it('passes searchTerm and type filters to the repository', () => {
    mockGetAllTransactions.mockReturnValue([]);

    renderHook(() => useTransactions({ searchTerm: 'coffee', type: 'EXPENSE' }));

    expect(mockGetAllTransactions).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ searchTerm: 'coffee', type: 'EXPENSE' }),
    );
  });

  // -----------------------------------------------------------------------
  // CRUD — createTransaction
  // -----------------------------------------------------------------------

  it('creates a transaction and triggers refresh', () => {
    mockGetAllTransactions.mockReturnValue([]);
    const created = makeTransaction({ id: 'txn-new' });
    mockCreateTransaction.mockReturnValue(created);

    const { result } = renderHook(() => useTransactions());

    let returned: Transaction | null = null;
    act(() => {
      returned = result.current.createTransaction({
        householdId: 'hh-1',
        accountId: 'acct-1',
        type: 'EXPENSE',
        amount: { amount: 5000 },
        date: '2025-03-06',
      });
    });

    expect(returned).toEqual(created);
    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createTransaction throws', () => {
    mockGetAllTransactions.mockReturnValue([]);
    mockCreateTransaction.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useTransactions());

    let returned: Transaction | null = null;
    act(() => {
      returned = result.current.createTransaction({
        householdId: 'hh-1',
        accountId: 'acct-1',
        type: 'EXPENSE',
        amount: { amount: 5000 },
        date: '2025-03-06',
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — updateTransaction
  // -----------------------------------------------------------------------

  it('updates a transaction and triggers refresh', () => {
    const original = makeTransaction();
    mockGetAllTransactions.mockReturnValue([original]);
    const updated = makeTransaction({ payee: 'Updated Store' });
    mockUpdateTransaction.mockReturnValue(updated);

    const { result } = renderHook(() => useTransactions());

    let returned: Transaction | null = null;
    act(() => {
      returned = result.current.updateTransaction('txn-1', { payee: 'Updated Store' });
    });

    expect(returned).toEqual(updated);
    expect(mockUpdateTransaction).toHaveBeenCalledWith(mockDb, 'txn-1', {
      payee: 'Updated Store',
    });
  });

  it('does not refresh when updateTransaction returns null (not found)', () => {
    mockGetAllTransactions.mockReturnValue([]);
    mockUpdateTransaction.mockReturnValue(null);

    const { result } = renderHook(() => useTransactions());

    const initialCallCount = mockGetAllTransactions.mock.calls.length;

    act(() => {
      result.current.updateTransaction('nonexistent', { payee: 'Nope' });
    });

    // getAllTransactions should not have been called again after the update
    // returned null (no refresh triggered). The only calls are from the
    // initial mount + re-render, not from a refresh.
    expect(mockUpdateTransaction).toHaveBeenCalledOnce();
    // Since update returned null, refresh should NOT have been triggered,
    // so callCount should stay at initialCallCount (no extra call).
    expect(mockGetAllTransactions.mock.calls.length).toBe(initialCallCount);
  });

  it('returns null and sets error when updateTransaction throws', () => {
    mockGetAllTransactions.mockReturnValue([]);
    mockUpdateTransaction.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useTransactions());

    let returned: Transaction | null = null;
    act(() => {
      returned = result.current.updateTransaction('txn-1', { payee: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteTransaction
  // -----------------------------------------------------------------------

  it('deletes a transaction and triggers refresh', () => {
    const txn = makeTransaction();
    mockGetAllTransactions.mockReturnValue([txn]);
    mockDeleteTransaction.mockReturnValue(true);

    const { result } = renderHook(() => useTransactions());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteTransaction('txn-1');
    });

    expect(deleted).toBe(true);
    expect(mockDeleteTransaction).toHaveBeenCalledWith(mockDb, 'txn-1');
  });

  it('returns false when deletion fails (not found)', () => {
    mockGetAllTransactions.mockReturnValue([]);
    mockDeleteTransaction.mockReturnValue(false);

    const { result } = renderHook(() => useTransactions());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteTransaction('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteTransaction throws', () => {
    mockGetAllTransactions.mockReturnValue([]);
    mockDeleteTransaction.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useTransactions());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteTransaction('txn-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllTransactions.mockReturnValue([]);

    const { result } = renderHook(() => useTransactions());

    const callCountAfterMount = mockGetAllTransactions.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllTransactions.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
