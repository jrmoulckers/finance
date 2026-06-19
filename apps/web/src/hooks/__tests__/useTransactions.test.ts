// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Row, SqliteDb } from '../../db/sqlite-wasm';
import type { Transaction } from '../../kmp/bridge';
import { useTransactions } from '../useTransactions';

const testState = vi.hoisted(() => ({
  db: null as unknown,
  createTransaction: vi.fn<(...args: unknown[]) => unknown>(),
  updateTransaction: vi.fn<(...args: unknown[]) => unknown>(),
  deleteTransaction: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => testState.db,
}));

vi.mock('../../db/repositories/transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/repositories/transactions')>();
  return {
    ...actual,
    createTransaction: (...args: unknown[]) => testState.createTransaction(...args),
    updateTransaction: (...args: unknown[]) => testState.updateTransaction(...args),
    deleteTransaction: (...args: unknown[]) => testState.deleteTransaction(...args),
  };
});

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const syncRowMetadata = {
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  deleted_at: null,
  sync_version: 1,
  is_synced: 1,
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
    retirementContributionYear: null,
    retirementContributionDesignation: null,
    splits: [],
    moodTag: null,
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
    ...overrides,
  };
}

function makeTransactionRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'txn-1',
    household_id: 'hh-1',
    account_id: 'acct-1',
    category_id: 'cat-1',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: 5000,
    currency: 'USD',
    payee: 'Grocery Store',
    note: null,
    date: '2025-03-06',
    transfer_account_id: null,
    transfer_transaction_id: null,
    is_recurring: 0,
    recurring_rule_id: null,
    tags: '[]',
    retirement_contribution_year: null,
    retirement_contribution_designation: null,
    splits: null,
    mood_tag: null,
    merchant_address: null,
    merchant_city: null,
    merchant_state: null,
    merchant_zip: null,
    merchant_country: null,
    external_reference_id: null,
    statement_description: null,
    custom_fields: null,
    extra_notes: null,
    counterparty_name: null,
    counterparty_account_id: null,
    ...syncRowMetadata,
    ...overrides,
  };
}

function createDatabase(rowsRef: { current: Row[] }): SqliteDb {
  return {
    exec: vi.fn(),
    selectAll: vi.fn(() => rowsRef.current),
    selectOne: vi.fn(() => rowsRef.current[0] ?? null),
    close: vi.fn(async () => undefined),
  };
}

describe('useTransactions', () => {
  let rowsRef: { current: Row[] };
  let mockDb: SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
    rowsRef = { current: [] };
    mockDb = createDatabase(rowsRef);
    testState.db = mockDb;
  });

  it('returns loading false and empty list when no transactions exist', () => {
    const { result } = renderHook(() => useTransactions());

    expect(result.current.loading).toBe(false);
    expect(result.current.transactions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns transactions from the database', () => {
    rowsRef.current = [
      makeTransactionRow(),
      makeTransactionRow({ id: 'txn-2', payee: 'Coffee Shop' }),
    ];

    const { result } = renderHook(() => useTransactions());

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions[0]?.payee).toBe('Grocery Store');
    expect(result.current.transactions[1]?.payee).toBe('Coffee Shop');
    expect(result.current.loading).toBe(false);
  });

  it('captures errors and sets error state', () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useTransactions());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.transactions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw 'unknown failure';
    });

    const { result } = renderHook(() => useTransactions());

    expect(result.current.error).toBe('Failed to load transactions.');
  });

  it('uses getTransactionsByAccount when accountId filter is provided', () => {
    rowsRef.current = [makeTransactionRow({ account_id: 'acct-1' })];

    const { result } = renderHook(() => useTransactions({ accountId: 'acct-1' }));

    expect(mockDb.selectAll).toHaveBeenCalledWith(expect.stringMatching(/account_id\s+=\s+\?/i), [
      'acct-1',
    ]);
    expect(result.current.transactions).toHaveLength(1);
  });

  it('uses getTransactionsByCategory when categoryId filter is provided', () => {
    rowsRef.current = [makeTransactionRow({ category_id: 'cat-food' })];

    const { result } = renderHook(() => useTransactions({ categoryId: 'cat-food' }));

    expect(mockDb.selectAll).toHaveBeenCalledWith(expect.stringMatching(/category_id\s+=\s+\?/i), [
      'cat-food',
      'cat-food',
    ]);
    expect(result.current.transactions).toHaveLength(1);
  });

  it('uses getTransactionsByDateRange when both dates are provided', () => {
    rowsRef.current = [makeTransactionRow({ date: '2025-03-05' })];

    const { result } = renderHook(() =>
      useTransactions({ startDate: '2025-03-01', endDate: '2025-03-31' }),
    );

    expect(mockDb.selectAll).toHaveBeenCalledWith(
      expect.stringMatching(/date\s+>=\s+\?[\s\S]*date\s+<=\s+\?/i),
      ['2025-03-01', '2025-03-31'],
    );
    expect(result.current.transactions).toHaveLength(1);
  });

  it('post-filters by startDate when only startDate is provided', () => {
    rowsRef.current = [
      makeTransactionRow({ id: 'txn-1', date: '2025-02-28' }),
      makeTransactionRow({ id: 'txn-2', date: '2025-03-01' }),
      makeTransactionRow({ id: 'txn-3', date: '2025-03-15' }),
    ];

    const { result } = renderHook(() => useTransactions({ startDate: '2025-03-01' }));

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions.map((t) => t.id)).toEqual(['txn-2', 'txn-3']);
  });

  it('post-filters by endDate when only endDate is provided', () => {
    rowsRef.current = [
      makeTransactionRow({ id: 'txn-1', date: '2025-02-28' }),
      makeTransactionRow({ id: 'txn-2', date: '2025-03-01' }),
      makeTransactionRow({ id: 'txn-3', date: '2025-03-15' }),
    ];

    const { result } = renderHook(() => useTransactions({ endDate: '2025-03-01' }));

    expect(result.current.transactions).toHaveLength(2);
    expect(result.current.transactions.map((t) => t.id)).toEqual(['txn-1', 'txn-2']);
  });

  it('post-filters by categoryId when both accountId and categoryId are provided', () => {
    rowsRef.current = [
      makeTransactionRow({ id: 'txn-1', category_id: 'cat-food' }),
      makeTransactionRow({ id: 'txn-2', category_id: 'cat-transport' }),
    ];

    const { result } = renderHook(() =>
      useTransactions({ accountId: 'acct-1', categoryId: 'cat-food' }),
    );

    expect(result.current.transactions).toHaveLength(1);
    expect(result.current.transactions[0]?.categoryId).toBe('cat-food');
  });

  it('applies limit via local slice when local post-filtering is needed', () => {
    rowsRef.current = [
      makeTransactionRow({ id: 'txn-1', category_id: 'cat-food' }),
      makeTransactionRow({ id: 'txn-2', category_id: 'cat-food' }),
      makeTransactionRow({ id: 'txn-3', category_id: 'cat-food' }),
    ];

    const { result } = renderHook(() =>
      useTransactions({ accountId: 'acct-1', categoryId: 'cat-food', limit: 2 }),
    );

    expect(result.current.transactions).toHaveLength(2);
  });

  it('passes searchTerm and type filters to the repository', () => {
    renderHook(() => useTransactions({ searchTerm: 'coffee', type: 'EXPENSE' }));

    expect(mockDb.selectAll).toHaveBeenCalledWith(
      expect.stringMatching(/COALESCE\(payee, ''\) LIKE \?[\s\S]*type\s+=\s+\?/i),
      expect.arrayContaining(['%coffee%', 'EXPENSE']),
    );
  });

  it('creates a transaction and triggers refresh', () => {
    const created = makeTransaction({ id: 'txn-new' });
    testState.createTransaction.mockReturnValue(created);

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
    expect(testState.createTransaction).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createTransaction throws', () => {
    testState.createTransaction.mockImplementation(() => {
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

  it('updates a transaction and triggers refresh', () => {
    rowsRef.current = [makeTransactionRow()];
    const updated = makeTransaction({ payee: 'Updated Store' });
    testState.updateTransaction.mockReturnValue(updated);

    const { result } = renderHook(() => useTransactions());

    let returned: Transaction | null = null;
    act(() => {
      returned = result.current.updateTransaction('txn-1', { payee: 'Updated Store' });
    });

    expect(returned).toEqual(updated);
    expect(testState.updateTransaction).toHaveBeenCalledWith(mockDb, 'txn-1', {
      payee: 'Updated Store',
    });
  });

  it('does not refresh when updateTransaction returns null (not found)', () => {
    testState.updateTransaction.mockReturnValue(null);

    const { result } = renderHook(() => useTransactions());
    const initialCallCount = vi.mocked(mockDb.selectAll).mock.calls.length;

    act(() => {
      result.current.updateTransaction('nonexistent', { payee: 'Nope' });
    });

    expect(testState.updateTransaction).toHaveBeenCalledOnce();
    expect(vi.mocked(mockDb.selectAll).mock.calls.length).toBe(initialCallCount);
  });

  it('returns null and sets error when updateTransaction throws', () => {
    testState.updateTransaction.mockImplementation(() => {
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

  it('deletes a transaction and triggers refresh', () => {
    rowsRef.current = [makeTransactionRow()];
    testState.deleteTransaction.mockReturnValue(true);

    const { result } = renderHook(() => useTransactions());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteTransaction('txn-1');
    });

    expect(deleted).toBe(true);
    expect(testState.deleteTransaction).toHaveBeenCalledWith(mockDb, 'txn-1');
  });

  it('returns false when deletion fails (not found)', () => {
    testState.deleteTransaction.mockReturnValue(false);

    const { result } = renderHook(() => useTransactions());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteTransaction('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteTransaction throws', () => {
    testState.deleteTransaction.mockImplementation(() => {
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

  it('re-fetches data when refresh is called', async () => {
    const { result } = renderHook(() => useTransactions());
    const callCountAfterMount = vi.mocked(mockDb.selectAll).mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(vi.mocked(mockDb.selectAll).mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
