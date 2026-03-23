// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Account } from '../../kmp/bridge';
import { useAccounts } from '../useAccounts';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllAccounts = vi.fn<(...args: unknown[]) => Account[]>();
const mockCreateAccount = vi.fn<(...args: unknown[]) => Account>();
const mockUpdateAccount = vi.fn<(...args: unknown[]) => Account | null>();
const mockDeleteAccount = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('../../db/repositories/accounts', () => ({
  getAllAccounts: (...args: unknown[]) => mockGetAllAccounts(...args),
  createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  updateAccount: (...args: unknown[]) => mockUpdateAccount(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
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
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllAccounts.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false and empty list when no accounts exist', () => {
    const { result } = renderHook(() => useAccounts());

    expect(result.current.loading).toBe(false);
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns accounts from the database', () => {
    const accounts = [
      makeAccount(),
      makeAccount({ id: 'acct-2', name: 'Savings', type: 'SAVINGS' }),
    ];
    mockGetAllAccounts.mockReturnValue(accounts);

    const { result } = renderHook(() => useAccounts());

    expect(result.current.accounts).toHaveLength(2);
    expect(result.current.accounts[0]?.name).toBe('Checking');
    expect(result.current.accounts[1]?.name).toBe('Savings');
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllAccounts.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useAccounts());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.accounts).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllAccounts.mockImplementation(() => {
      throw 42;
    });

    const { result } = renderHook(() => useAccounts());

    expect(result.current.error).toBe('Failed to load accounts.');
  });

  // -----------------------------------------------------------------------
  // CRUD — createAccount
  // -----------------------------------------------------------------------

  it('creates an account and triggers refresh', () => {
    mockGetAllAccounts.mockReturnValue([]);
    const created = makeAccount({ id: 'acct-new', name: 'New Account' });
    mockCreateAccount.mockReturnValue(created);

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    act(() => {
      returned = result.current.createAccount({
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currentBalance: { amount: 0 },
      });
    });

    expect(returned).toEqual(created);
    expect(mockCreateAccount).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createAccount throws', () => {
    mockGetAllAccounts.mockReturnValue([]);
    mockCreateAccount.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    act(() => {
      returned = result.current.createAccount({
        householdId: 'hh-1',
        name: 'New Account',
        type: 'CHECKING',
        currentBalance: { amount: 0 },
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — updateAccount
  // -----------------------------------------------------------------------

  it('updates an account and triggers refresh', () => {
    const original = makeAccount();
    mockGetAllAccounts.mockReturnValue([original]);
    const updated = makeAccount({ name: 'Updated Checking' });
    mockUpdateAccount.mockReturnValue(updated);

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    act(() => {
      returned = result.current.updateAccount('acct-1', { name: 'Updated Checking' });
    });

    expect(returned).toEqual(updated);
    expect(mockUpdateAccount).toHaveBeenCalledWith(mockDb, 'acct-1', {
      name: 'Updated Checking',
    });
  });

  it('does not refresh when updateAccount returns null', () => {
    mockGetAllAccounts.mockReturnValue([]);
    mockUpdateAccount.mockReturnValue(null);

    const { result } = renderHook(() => useAccounts());

    const callCountAfterMount = mockGetAllAccounts.mock.calls.length;

    act(() => {
      result.current.updateAccount('nonexistent', { name: 'Nope' });
    });

    expect(mockGetAllAccounts.mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateAccount throws', () => {
    mockGetAllAccounts.mockReturnValue([]);
    mockUpdateAccount.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useAccounts());

    let returned: Account | null = null;
    act(() => {
      returned = result.current.updateAccount('acct-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteAccount
  // -----------------------------------------------------------------------

  it('deletes an account and triggers refresh', () => {
    const acct = makeAccount();
    mockGetAllAccounts.mockReturnValue([acct]);
    mockDeleteAccount.mockReturnValue(true);

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteAccount('acct-1');
    });

    expect(deleted).toBe(true);
    expect(mockDeleteAccount).toHaveBeenCalledWith(mockDb, 'acct-1');
  });

  it('returns false when deletion target is not found', () => {
    mockGetAllAccounts.mockReturnValue([]);
    mockDeleteAccount.mockReturnValue(false);

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteAccount('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteAccount throws', () => {
    mockGetAllAccounts.mockReturnValue([]);
    mockDeleteAccount.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useAccounts());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteAccount('acct-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllAccounts.mockReturnValue([]);

    const { result } = renderHook(() => useAccounts());

    const callCountAfterMount = mockGetAllAccounts.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllAccounts.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
