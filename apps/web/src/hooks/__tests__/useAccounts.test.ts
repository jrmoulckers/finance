// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Row, SqliteDb } from '../../db/sqlite-wasm';
import { createSqliteAsyncDb, type AsyncDb } from '../../db/async-db';
import type { Account } from '../../kmp/bridge';
import { useAccounts } from '../useAccounts';

const testState = vi.hoisted(() => ({
  db: null as unknown,
  createAccount: vi.fn<(...args: unknown[]) => unknown>(),
  updateAccount: vi.fn<(...args: unknown[]) => unknown>(),
  deleteAccount: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => testState.db,
}));

vi.mock('../../db/repositories/accounts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/repositories/accounts')>();
  return {
    ...actual,
    createAccount: (...args: unknown[]) => testState.createAccount(...args),
    updateAccount: (...args: unknown[]) => testState.updateAccount(...args),
    deleteAccount: (...args: unknown[]) => testState.deleteAccount(...args),
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

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    householdId: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    purpose: 'personal',
    retirementAccountType: null,
    retirementTaxTreatment: null,
    hsaCoverageLevel: null,
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
    ...overrides,
  };
}

function makeAccountRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'acct-1',
    household_id: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    purpose: 'personal',
    retirement_account_type: null,
    retirement_tax_treatment: null,
    hsa_coverage_level: null,
    currency: 'USD',
    current_balance: 100000,
    is_archived: 0,
    sort_order: 1,
    icon: 'bank',
    color: '#2563EB',
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

describe('useAccounts', () => {
  let rowsRef: { current: Row[] };
  let mockSqlite: SqliteDb;
  let mockDb: AsyncDb;

  beforeEach(() => {
    vi.clearAllMocks();
    rowsRef = { current: [] };
    mockSqlite = createDatabase(rowsRef);
    mockDb = createSqliteAsyncDb(mockSqlite);
    testState.db = mockDb;
  });

  it('returns loading false and empty list when no accounts exist', async () => {
    const { result } = renderHook(() => useAccounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns accounts from the database', async () => {
    rowsRef.current = [
      makeAccountRow(),
      makeAccountRow({ id: 'acct-2', name: 'Savings', type: 'SAVINGS' }),
    ];

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => expect(result.current.accounts).toHaveLength(2));
    expect(result.current.accounts[0]?.name).toBe('Checking');
    expect(result.current.accounts[1]?.name).toBe('Savings');
  });

  it('filters accounts by purpose and includes shared accounts in scoped views', async () => {
    rowsRef.current = [
      makeAccountRow({ id: 'acct-personal', purpose: 'personal' }),
      makeAccountRow({ id: 'acct-business', name: 'Business Checking', purpose: 'business' }),
      makeAccountRow({ id: 'acct-both', name: 'Shared Reserve', purpose: 'both' }),
    ];

    const { result } = renderHook(() => useAccounts({ purpose: 'business' }));

    await waitFor(() =>
      expect(result.current.accounts.map((account) => account.name)).toEqual([
        'Business Checking',
        'Shared Reserve',
      ]),
    );
  });

  it('captures errors and sets error state', async () => {
    vi.mocked(mockSqlite.selectAll).mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => expect(result.current.error).toBe('DB read failed'));
    expect(result.current.accounts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', async () => {
    vi.mocked(mockSqlite.selectAll).mockImplementation(() => {
      throw 42;
    });

    const { result } = renderHook(() => useAccounts());

    await waitFor(() => expect(result.current.error).toBe('Failed to load accounts.'));
  });

  it('creates an account and triggers refresh', async () => {
    const created = makeAccount({ id: 'acct-new', name: 'New Account' });
    testState.createAccount.mockReturnValue(created);

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    await act(async () => {
      returned = await result.current.createAccount({
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currentBalance: { amount: 0 },
      });
    });

    expect(returned).toEqual(created);
    expect(testState.createAccount).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createAccount throws', async () => {
    testState.createAccount.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    await act(async () => {
      returned = await result.current.createAccount({
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currentBalance: { amount: 0 },
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  it('updates an account and triggers refresh', async () => {
    rowsRef.current = [makeAccountRow()];
    const updated = makeAccount({ name: 'Updated Checking' });
    testState.updateAccount.mockReturnValue(updated);

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    await act(async () => {
      returned = await result.current.updateAccount('acct-1', { name: 'Updated Checking' });
    });

    expect(returned).toEqual(updated);
    expect(testState.updateAccount).toHaveBeenCalledWith(mockDb, 'acct-1', {
      name: 'Updated Checking',
    });
  });

  it('does not refresh when updateAccount returns null', async () => {
    testState.updateAccount.mockReturnValue(null);

    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callCountAfterMount = vi.mocked(mockSqlite.selectAll).mock.calls.length;

    await act(async () => {
      await result.current.updateAccount('nonexistent', { name: 'Nope' });
    });

    expect(vi.mocked(mockSqlite.selectAll).mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateAccount throws', async () => {
    testState.updateAccount.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    await act(async () => {
      returned = await result.current.updateAccount('acct-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  it('deletes an account and triggers refresh', async () => {
    rowsRef.current = [makeAccountRow()];
    testState.deleteAccount.mockReturnValue(true);

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteAccount('acct-1');
    });

    expect(deleted).toBe(true);
    expect(testState.deleteAccount).toHaveBeenCalledWith(mockDb, 'acct-1');
  });

  it('returns false when deletion target is not found', async () => {
    testState.deleteAccount.mockReturnValue(false);

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteAccount('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteAccount throws', async () => {
    testState.deleteAccount.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteAccount('acct-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  it('re-fetches data when refresh is called', async () => {
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callCountAfterMount = vi.mocked(mockSqlite.selectAll).mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(vi.mocked(mockSqlite.selectAll).mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
