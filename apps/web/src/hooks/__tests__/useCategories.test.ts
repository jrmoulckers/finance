// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '../../kmp/bridge';
import { useCategories } from '../useCategories';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../../db/DatabaseProvider').useDatabase>;

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

const mockGetAllCategories = vi.fn<(...args: unknown[]) => Category[]>();
const mockCreateCategory = vi.fn<(...args: unknown[]) => Category>();
const mockUpdateCategory = vi.fn<(...args: unknown[]) => Category | null>();
const mockDeleteCategory = vi.fn<(...args: unknown[]) => boolean>();

vi.mock('../../db/repositories/categories', () => ({
  getAllCategories: (...args: unknown[]) => mockGetAllCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
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
    id: 'cat-1',
    householdId: 'hh-1',
    name: 'Food & Drink',
    icon: 'utensils',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllCategories.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Loading / success state
  // -----------------------------------------------------------------------

  it('returns loading false and empty list when no categories exist', () => {
    const { result } = renderHook(() => useCategories());

    expect(result.current.loading).toBe(false);
    expect(result.current.categories).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns categories from the database', () => {
    const categories = [
      makeCategory(),
      makeCategory({ id: 'cat-income', name: 'Salary', isIncome: true }),
    ];
    mockGetAllCategories.mockReturnValue(categories);

    const { result } = renderHook(() => useCategories());

    expect(result.current.categories).toHaveLength(2);
    expect(result.current.categories[0]?.name).toBe('Food & Drink');
    expect(result.current.categories[1]?.isIncome).toBe(true);
  });

  it('includes both income and expense categories', () => {
    const categories = [
      makeCategory({ id: 'cat-expense', isIncome: false }),
      makeCategory({ id: 'cat-income', name: 'Salary', isIncome: true }),
      makeCategory({ id: 'cat-expense-2', name: 'Transport', isIncome: false }),
    ];
    mockGetAllCategories.mockReturnValue(categories);

    const { result } = renderHook(() => useCategories());

    const incomeCategories = result.current.categories.filter((c) => c.isIncome);
    const expenseCategories = result.current.categories.filter((c) => !c.isIncome);

    expect(incomeCategories).toHaveLength(1);
    expect(expenseCategories).toHaveLength(2);
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('captures errors and sets error state', () => {
    mockGetAllCategories.mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useCategories());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.categories).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    mockGetAllCategories.mockImplementation(() => {
      throw 'string error';
    });

    const { result } = renderHook(() => useCategories());

    expect(result.current.error).toBe('Failed to load categories.');
  });

  // -----------------------------------------------------------------------
  // CRUD — createCategory
  // -----------------------------------------------------------------------

  it('creates a category and triggers refresh', () => {
    mockGetAllCategories.mockReturnValue([]);
    const created = makeCategory({ id: 'cat-new', name: 'Entertainment' });
    mockCreateCategory.mockReturnValue(created);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.createCategory({
        householdId: 'hh-1',
        name: 'Entertainment',
      });
    });

    expect(returned).toEqual(created);
    expect(mockCreateCategory).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createCategory throws', () => {
    mockGetAllCategories.mockReturnValue([]);
    mockCreateCategory.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.createCategory({
        householdId: 'hh-1',
        name: 'Entertainment',
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — updateCategory
  // -----------------------------------------------------------------------

  it('updates a category and triggers refresh', () => {
    mockGetAllCategories.mockReturnValue([makeCategory()]);
    const updated = makeCategory({ name: 'Groceries' });
    mockUpdateCategory.mockReturnValue(updated);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.updateCategory('cat-1', { name: 'Groceries' });
    });

    expect(returned).toEqual(updated);
    expect(mockUpdateCategory).toHaveBeenCalledWith(mockDb, 'cat-1', {
      name: 'Groceries',
    });
  });

  it('does not refresh when updateCategory returns null', () => {
    mockGetAllCategories.mockReturnValue([]);
    mockUpdateCategory.mockReturnValue(null);

    const { result } = renderHook(() => useCategories());

    const callCountAfterMount = mockGetAllCategories.mock.calls.length;

    act(() => {
      result.current.updateCategory('nonexistent', { name: 'Nope' });
    });

    expect(mockGetAllCategories.mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateCategory throws', () => {
    mockGetAllCategories.mockReturnValue([]);
    mockUpdateCategory.mockImplementation(() => {
      throw new Error('Update failed');
    });

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.updateCategory('cat-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  // -----------------------------------------------------------------------
  // CRUD — deleteCategory
  // -----------------------------------------------------------------------

  it('deletes a category and triggers refresh', () => {
    mockGetAllCategories.mockReturnValue([makeCategory()]);
    mockDeleteCategory.mockReturnValue(true);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteCategory('cat-1');
    });

    expect(deleted).toBe(true);
    expect(mockDeleteCategory).toHaveBeenCalledWith(mockDb, 'cat-1');
  });

  it('returns false when deletion target is not found', () => {
    mockGetAllCategories.mockReturnValue([]);
    mockDeleteCategory.mockReturnValue(false);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteCategory('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteCategory throws', () => {
    mockGetAllCategories.mockReturnValue([]);
    mockDeleteCategory.mockImplementation(() => {
      throw new Error('Delete failed');
    });

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteCategory('cat-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('re-fetches data when refresh is called', () => {
    mockGetAllCategories.mockReturnValue([]);

    const { result } = renderHook(() => useCategories());

    const callCountAfterMount = mockGetAllCategories.mock.calls.length;

    act(() => {
      result.current.refresh();
    });

    expect(mockGetAllCategories.mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
