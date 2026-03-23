// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Goal } from '../../kmp/bridge';
import { useGoals } from '../useGoals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllGoals = vi.fn<(...args: unknown[]) => Goal[]>();
const mockCreateGoal = vi.fn<(...args: unknown[]) => Goal>();
const mockUpdateGoal = vi.fn<(...args: unknown[]) => Goal | null>();
const mockDeleteGoal = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('../../db/repositories/goals', () => ({
  getAllGoals: (...args: unknown[]) => mockGetAllGoals(...args),
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
  updateGoal: (...args: unknown[]) => mockUpdateGoal(...args),
  deleteGoal: (...args: unknown[]) => mockDeleteGoal(...args),
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

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    householdId: 'hh-1',
    name: 'Emergency Fund',
    targetAmount: { amount: 1000000 },
    currentAmount: { amount: 250000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: '2025-12-31',
    status: 'ACTIVE',
    icon: 'piggy-bank',
    color: '#059669',
    accountId: 'acct-1',
    ...syncMetadata,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllGoals.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false and empty list when no goals exist', () => {
    const { result } = renderHook(() => useGoals());

    expect(result.current.loading).toBe(false);
    expect(result.current.goals).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns goals from the database', () => {
    const goals = [makeGoal(), makeGoal({ id: 'goal-2', name: 'Vacation Fund', status: 'ACTIVE' })];
    mockGetAllGoals.mockReturnValue(goals);

    const { result } = renderHook(() => useGoals());

    expect(result.current.goals).toHaveLength(2);
    expect(result.current.goals[0]?.name).toBe('Emergency Fund');
    expect(result.current.goals[1]?.name).toBe('Vacation Fund');
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllGoals.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useGoals());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.goals).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllGoals.mockImplementation(() => {
      throw undefined;
    });

    const { result } = renderHook(() => useGoals());

    expect(result.current.error).toBe('Failed to load goals.');
  });

  // -----------------------------------------------------------------------
  // CRUD — createGoal
  // -----------------------------------------------------------------------

  it('creates a goal and triggers refresh', () => {
    mockGetAllGoals.mockReturnValue([]);
    const created = makeGoal({ id: 'goal-new', name: 'New Car' });
    mockCreateGoal.mockReturnValue(created);

    const { result } = renderHook(() => useGoals());

    let returned: Goal | null = null;
    act(() => {
      returned = result.current.createGoal({
        householdId: 'hh-1',
        name: 'New Car',
        targetAmount: { amount: 2500000 },
      });
    });

    expect(returned).toEqual(created);
    expect(mockCreateGoal).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createGoal throws', () => {
    mockGetAllGoals.mockReturnValue([]);
    mockCreateGoal.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useGoals());

    let returned: Goal | null = null;
    act(() => {
      returned = result.current.createGoal({
        householdId: 'hh-1',
        name: 'New Car',
        targetAmount: { amount: 2500000 },
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — updateGoal (progress updates)
  // -----------------------------------------------------------------------

  it('updates a goal and triggers refresh', () => {
    mockGetAllGoals.mockReturnValue([makeGoal()]);
    const updated = makeGoal({ currentAmount: { amount: 500000 } });
    mockUpdateGoal.mockReturnValue(updated);

    const { result } = renderHook(() => useGoals());

    let returned: Goal | null = null;
    act(() => {
      returned = result.current.updateGoal('goal-1', { currentAmount: { amount: 500000 } });
    });

    expect(returned).toEqual(updated);
    expect(mockUpdateGoal).toHaveBeenCalledWith(mockDb, 'goal-1', {
      currentAmount: { amount: 500000 },
    });
  });

  it('does not refresh when updateGoal returns null', () => {
    mockGetAllGoals.mockReturnValue([]);
    mockUpdateGoal.mockReturnValue(null);

    const { result } = renderHook(() => useGoals());

    const callCountAfterMount = mockGetAllGoals.mock.calls.length;

    act(() => {
      result.current.updateGoal('nonexistent', { name: 'Nope' });
    });

    expect(mockGetAllGoals.mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateGoal throws', () => {
    mockGetAllGoals.mockReturnValue([]);
    mockUpdateGoal.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useGoals());

    let returned: Goal | null = null;
    act(() => {
      returned = result.current.updateGoal('goal-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteGoal
  // -----------------------------------------------------------------------

  it('deletes a goal and triggers refresh', () => {
    mockGetAllGoals.mockReturnValue([makeGoal()]);
    mockDeleteGoal.mockReturnValue(true);

    const { result } = renderHook(() => useGoals());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteGoal('goal-1');
    });

    expect(deleted).toBe(true);
    expect(mockDeleteGoal).toHaveBeenCalledWith(mockDb, 'goal-1');
  });

  it('returns false when deletion target is not found', () => {
    mockGetAllGoals.mockReturnValue([]);
    mockDeleteGoal.mockReturnValue(false);

    const { result } = renderHook(() => useGoals());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteGoal('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteGoal throws', () => {
    mockGetAllGoals.mockReturnValue([]);
    mockDeleteGoal.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useGoals());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteGoal('goal-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllGoals.mockReturnValue([]);

    const { result } = renderHook(() => useGoals());

    const callCountAfterMount = mockGetAllGoals.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllGoals.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
