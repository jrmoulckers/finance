// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Row, SqliteDb } from '../../db/sqlite-wasm';
import type { Category } from '../../kmp/bridge';
import { useCategories } from '../useCategories';

const testState = vi.hoisted(() => ({
  db: null as unknown,
  createCategory: vi.fn<(...args: unknown[]) => unknown>(),
  updateCategory: vi.fn<(...args: unknown[]) => unknown>(),
  deleteCategory: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => testState.db,
}));

vi.mock('../../db/repositories/categories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/repositories/categories')>();
  return {
    ...actual,
    createCategory: (...args: unknown[]) => testState.createCategory(...args),
    updateCategory: (...args: unknown[]) => testState.updateCategory(...args),
    deleteCategory: (...args: unknown[]) => testState.deleteCategory(...args),
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
    isBiometricProtected: false,
    ...syncMetadata,
    ...overrides,
  };
}

function makeCategoryRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'cat-1',
    household_id: 'hh-1',
    name: 'Food & Drink',
    icon: 'utensils',
    color: '#16A34A',
    parent_id: null,
    is_income: 0,
    is_system: 0,
    sort_order: 1,
    is_biometric_protected: 0,
    ...syncRowMetadata,
    ...overrides,
  };
}

function createDatabase(rowsRef: { current: Row[] }): SqliteDb {
  return {
    exec: vi.fn(),
    selectAll: vi.fn(() => rowsRef.current),
    selectOne: vi.fn(() => ({ id: 'hh-1' })),
    close: vi.fn(async () => undefined),
  };
}

describe('useCategories', () => {
  let rowsRef: { current: Row[] };
  let mockDb: SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
    rowsRef = { current: [] };
    mockDb = createDatabase(rowsRef);
    testState.db = mockDb;
  });

  it('returns loading false and empty list when no categories exist', () => {
    const { result } = renderHook(() => useCategories());

    expect(result.current.loading).toBe(false);
    expect(result.current.categories).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns categories from the database', () => {
    rowsRef.current = [
      makeCategoryRow(),
      makeCategoryRow({ id: 'cat-income', name: 'Salary', is_income: 1 }),
    ];

    const { result } = renderHook(() => useCategories());

    expect(result.current.categories).toHaveLength(2);
    expect(result.current.categories[0]?.name).toBe('Food & Drink');
    expect(result.current.categories[1]?.isIncome).toBe(true);
  });

  it('includes both income and expense categories', () => {
    rowsRef.current = [
      makeCategoryRow({ id: 'cat-expense', is_income: 0 }),
      makeCategoryRow({ id: 'cat-income', name: 'Salary', is_income: 1 }),
      makeCategoryRow({ id: 'cat-expense-2', name: 'Transport', is_income: 0 }),
    ];

    const { result } = renderHook(() => useCategories());

    const incomeCategories = result.current.categories.filter((c) => c.isIncome);
    const expenseCategories = result.current.categories.filter((c) => !c.isIncome);

    expect(incomeCategories).toHaveLength(1);
    expect(expenseCategories).toHaveLength(2);
  });

  it('builds the Food & Meals template state from existing child categories', () => {
    rowsRef.current = [
      makeCategoryRow({ id: 'cat-food', name: 'Food', parent_id: null }),
      makeCategoryRow({
        id: 'cat-groceries',
        name: 'Groceries',
        parent_id: 'cat-food',
        icon: '🛒',
      }),
      makeCategoryRow({ id: 'cat-dining', name: 'Dining Out', parent_id: 'cat-food', icon: '🍽️' }),
    ];

    const { result } = renderHook(() => useCategories());

    expect(result.current.foodMealTemplate.parentCategory?.name).toBe('Food');
    expect(result.current.foodMealTemplate.subcategories.map((category) => category.name)).toEqual([
      'Groceries',
      'Dining Out',
    ]);
    expect(result.current.foodMealTemplate.missingSubcategoryDefinitions).toHaveLength(3);
  });

  it('creates the missing Food & Meals categories under an existing parent', () => {
    const existingFood = makeCategory({ id: 'cat-food', name: 'Food', parentId: null });
    const existingGroceries = makeCategory({
      id: 'cat-groceries',
      name: 'Groceries',
      parentId: 'cat-food',
      icon: '🛒',
      sortOrder: 2,
    });
    rowsRef.current = [
      makeCategoryRow({ id: 'cat-food', name: 'Food', parent_id: null }),
      makeCategoryRow({
        id: 'cat-groceries',
        name: 'Groceries',
        parent_id: 'cat-food',
        icon: '🛒',
        sort_order: 2,
      }),
    ];
    testState.createCategory
      .mockReturnValueOnce(
        makeCategory({
          id: 'cat-dining',
          name: 'Dining Out',
          parentId: 'cat-food',
          icon: '🍽️',
          sortOrder: 3,
        }),
      )
      .mockReturnValueOnce(
        makeCategory({
          id: 'cat-delivery',
          name: 'Delivery & Takeout',
          parentId: 'cat-food',
          icon: '🥡',
          sortOrder: 4,
        }),
      )
      .mockReturnValueOnce(
        makeCategory({
          id: 'cat-coffee',
          name: 'Coffee & Snacks',
          parentId: 'cat-food',
          icon: '☕',
          sortOrder: 5,
        }),
      )
      .mockReturnValueOnce(
        makeCategory({
          id: 'cat-meal-prep',
          name: 'Meal Prep',
          parentId: 'cat-food',
          icon: '🥗',
          sortOrder: 6,
        }),
      );

    const { result } = renderHook(() => useCategories());

    let templateState!: ReturnType<typeof useCategories>['foodMealTemplate'] | null;
    act(() => {
      templateState = result.current.ensureFoodMealCategories();
    });

    expect(testState.createCategory).toHaveBeenCalledTimes(4);
    expect(testState.createCategory).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ householdId: existingFood.householdId, parentId: existingFood.id }),
    );
    expect(templateState).not.toBeNull();
    expect(templateState!.subcategories.map((category: Category) => category.name)).toEqual([
      existingGroceries.name,
      'Dining Out',
      'Delivery & Takeout',
      'Coffee & Snacks',
      'Meal Prep',
    ]);
  });

  it('captures errors and sets error state', () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useCategories());

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.categories).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw 'string error';
    });

    const { result } = renderHook(() => useCategories());

    expect(result.current.error).toBe('Failed to load categories.');
  });

  it('creates a category and triggers refresh', () => {
    const created = makeCategory({ id: 'cat-new', name: 'Entertainment' });
    testState.createCategory.mockReturnValue(created);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.createCategory({ householdId: 'hh-1', name: 'Entertainment' });
    });

    expect(returned).toEqual(created);
    expect(testState.createCategory).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createCategory throws', () => {
    testState.createCategory.mockImplementation(() => {
      throw new Error('Insert failed');
    });

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.createCategory({ householdId: 'hh-1', name: 'Entertainment' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  it('updates a category and triggers refresh', () => {
    rowsRef.current = [makeCategoryRow()];
    const updated = makeCategory({ name: 'Groceries' });
    testState.updateCategory.mockReturnValue(updated);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    act(() => {
      returned = result.current.updateCategory('cat-1', { name: 'Groceries' });
    });

    expect(returned).toEqual(updated);
    expect(testState.updateCategory).toHaveBeenCalledWith(mockDb, 'cat-1', { name: 'Groceries' });
  });

  it('does not refresh when updateCategory returns null', () => {
    testState.updateCategory.mockReturnValue(null);

    const { result } = renderHook(() => useCategories());
    const callCountAfterMount = vi.mocked(mockDb.selectAll).mock.calls.length;

    act(() => {
      result.current.updateCategory('nonexistent', { name: 'Nope' });
    });

    expect(vi.mocked(mockDb.selectAll).mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateCategory throws', () => {
    testState.updateCategory.mockImplementation(() => {
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

  it('deletes a category and triggers refresh', () => {
    rowsRef.current = [makeCategoryRow()];
    testState.deleteCategory.mockReturnValue(true);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteCategory('cat-1');
    });

    expect(deleted).toBe(true);
    expect(testState.deleteCategory).toHaveBeenCalledWith(mockDb, 'cat-1');
  });

  it('returns false when deletion target is not found', () => {
    testState.deleteCategory.mockReturnValue(false);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    act(() => {
      deleted = result.current.deleteCategory('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteCategory throws', () => {
    testState.deleteCategory.mockImplementation(() => {
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

  it('re-fetches data when refresh is called', async () => {
    const { result } = renderHook(() => useCategories());
    const callCountAfterMount = vi.mocked(mockDb.selectAll).mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(vi.mocked(mockDb.selectAll).mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
