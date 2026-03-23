// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Budget } from '../../kmp/bridge';
import type { BudgetWithSpending } from '../../db/repositories/budgets';
import { useBudgets } from '../useBudgets';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllBudgets = vi.fn<(...args: unknown[]) => Budget[]>();
const mockGetBudgetWithSpending = vi.fn<(...args: unknown[]) => BudgetWithSpending | null>();
const mockCreateBudget = vi.fn<(...args: unknown[]) => Budget>();
const mockUpdateBudget = vi.fn<(...args: unknown[]) => Budget | null>();
const mockDeleteBudget = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('../../db/repositories/budgets', () => ({
  getAllBudgets: (...args: unknown[]) => mockGetAllBudgets(...args),
  getBudgetWithSpending: (...args: unknown[]) => mockGetBudgetWithSpending(...args),
  createBudget: (...args: unknown[]) => mockCreateBudget(...args),
  updateBudget: (...args: unknown[]) => mockUpdateBudget(...args),
  deleteBudget: (...args: unknown[]) => mockDeleteBudget(...args),
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

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    householdId: 'hh-1',
    categoryId: 'cat-food',
    name: 'Groceries',
    amount: { amount: 50000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    period: 'MONTHLY',
    startDate: '2025-03-01',
    endDate: '2025-03-31',
    isRollover: false,
    ...syncMetadata,
    ...overrides,
  };
}

function makeBudgetWithSpending(
  overrides: Partial<Budget> = {},
  spent = 20000,
): BudgetWithSpending {
  const budget = makeBudget(overrides);
  return {
    ...budget,
    spentAmount: { amount: spent },
    remainingAmount: { amount: budget.amount.amount - spent },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBudgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllBudgets.mockReturnValue([]);
    mockGetBudgetWithSpending.mockReturnValue(null);
  });

  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false and empty list when no budgets exist', () => {
    const { result } = renderHook(() => useBudgets());

    expect(result.current.loading).toBe(false);
    expect(result.current.budgets).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns budgets enriched with spending data', () => {
    const budget = makeBudget();
    const enriched = makeBudgetWithSpending({}, 15000);
    mockGetAllBudgets.mockReturnValue([budget]);
    mockGetBudgetWithSpending.mockReturnValue(enriched);

    const { result } = renderHook(() => useBudgets());

    expect(result.current.budgets).toHaveLength(1);
    expect(result.current.budgets[0]?.spentAmount.amount).toBe(15000);
    expect(result.current.budgets[0]?.remainingAmount.amount).toBe(35000);
  });

  it('falls back to zero spending when getBudgetWithSpending returns null', () => {
    const budget = makeBudget({ amount: { amount: 50000 } });
    mockGetAllBudgets.mockReturnValue([budget]);
    mockGetBudgetWithSpending.mockReturnValue(null);

    const { result } = renderHook(() => useBudgets());

    expect(result.current.budgets).toHaveLength(1);
    expect(result.current.budgets[0]?.spentAmount.amount).toBe(0);
    expect(result.current.budgets[0]?.remainingAmount.amount).toBe(50000);
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllBudgets.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useBudgets());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.budgets).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllBudgets.mockImplementation(() => {
      throw null;
    });

    const { result } = renderHook(() => useBudgets());

    expect(result.current.error).toBe('Failed to load budgets.');
  });

  // -----------------------------------------------------------------------
  // CRUD — createBudget
  // -----------------------------------------------------------------------

  it('creates a budget and triggers refresh', () => {
    mockGetAllBudgets.mockReturnValue([]);
    const created = makeBudget({ id: 'budget-new', name: 'Dining Out' });
    mockCreateBudget.mockReturnValue(created);

    const { result } = renderHook(() => useBudgets());

    let returned: Budget | null = null;
    act(() => {
      returned = result.current.createBudget({
        householdId: 'hh-1',
        categoryId: 'cat-dining',
        name: 'Dining Out',
        amount: { amount: 30000 },
        period: 'MONTHLY',
        startDate: '2025-04-01',
      });
    });

    expect(returned).toEqual(created);
    expect(mockCreateBudget).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createBudget throws', () => {
    mockGetAllBudgets.mockReturnValue([]);
    mockCreateBudget.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useBudgets());

    let returned: Budget | null = null;
    act(() => {
      returned = result.current.createBudget({
        householdId: 'hh-1',
        categoryId: 'cat-dining',
        name: 'Dining Out',
        amount: { amount: 30000 },
        period: 'MONTHLY',
        startDate: '2025-04-01',
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — updateBudget
  // -----------------------------------------------------------------------

  it('updates a budget and triggers refresh', () => {
    mockGetAllBudgets.mockReturnValue([]);
    const updated = makeBudget({ name: 'Updated Budget' });
    mockUpdateBudget.mockReturnValue(updated);

    const { result } = renderHook(() => useBudgets());

    let returned: Budget | null = null;
    act(() => {
      returned = result.current.updateBudget('budget-1', { name: 'Updated Budget' });
    });

    expect(returned).toEqual(updated);
    expect(mockUpdateBudget).toHaveBeenCalledWith(mockDb, 'budget-1', {
      name: 'Updated Budget',
    });
  });

  it('does not refresh when updateBudget returns null', () => {
    mockGetAllBudgets.mockReturnValue([]);
    mockUpdateBudget.mockReturnValue(null);

    const { result } = renderHook(() => useBudgets());

    const callCountAfterMount = mockGetAllBudgets.mock.calls.length;

    act(() => {
      result.current.updateBudget('nonexistent', { name: 'Nope' });
    });

    expect(mockGetAllBudgets.mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateBudget throws', () => {
    mockGetAllBudgets.mockReturnValue([]);
    mockUpdateBudget.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useBudgets());

    let returned: Budget | null = null;
    act(() => {
      returned = result.current.updateBudget('budget-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteBudget
  // -----------------------------------------------------------------------

  it('deletes a budget and triggers refresh', () => {
    mockGetAllBudgets.mockReturnValue([makeBudget()]);
    mockGetBudgetWithSpending.mockReturnValue(makeBudgetWithSpending());
    mockDeleteBudget.mockReturnValue(true);

    const { result } = renderHook(() => useBudgets());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteBudget('budget-1');
    });

    expect(deleted).toBe(true);
    expect(mockDeleteBudget).toHaveBeenCalledWith(mockDb, 'budget-1');
  });

  it('returns false when deletion target is not found', () => {
    mockGetAllBudgets.mockReturnValue([]);
    mockDeleteBudget.mockReturnValue(false);

    const { result } = renderHook(() => useBudgets());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteBudget('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteBudget throws', () => {
    mockGetAllBudgets.mockReturnValue([]);
    mockDeleteBudget.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useBudgets());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteBudget('budget-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllBudgets.mockReturnValue([]);

    const { result } = renderHook(() => useBudgets());

    const callCountAfterMount = mockGetAllBudgets.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllBudgets.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
