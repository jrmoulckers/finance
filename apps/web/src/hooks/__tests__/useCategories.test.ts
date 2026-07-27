// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSqliteAsyncDb, type AsyncDb } from '../../db/async-db';
import type { Row, SqliteDb } from '../../db/sqlite-wasm';
import { resetCrossTabSyncForTesting } from '../../lib/sync/crossTab';
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

function createDatabase(rowsRef: { current: Row[] }): { sqlite: SqliteDb; db: AsyncDb } {
  const sqlite: SqliteDb = {
    exec: vi.fn(),
    selectAll: vi.fn(() => rowsRef.current),
    selectOne: vi.fn(() => ({ id: 'hh-1' })),
    close: vi.fn(async () => undefined),
  };
  return { sqlite, db: createSqliteAsyncDb(sqlite) };
}

describe('useCategories', () => {
  let rowsRef: { current: Row[] };
  let sqliteDb: SqliteDb;
  let mockDb: AsyncDb;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCrossTabSyncForTesting();
    rowsRef = { current: [] };
    const database = createDatabase(rowsRef);
    sqliteDb = database.sqlite;
    mockDb = database.db;
    testState.db = mockDb;
  });

  afterEach(() => {
    resetCrossTabSyncForTesting();
  });

  it('returns loading false and empty list when no categories exist', async () => {
    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.categories).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('returns categories from the database', async () => {
    rowsRef.current = [
      makeCategoryRow(),
      makeCategoryRow({ id: 'cat-income', name: 'Salary', is_income: 1 }),
    ];

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.categories).toHaveLength(2);
    });
    expect(result.current.categories[0]?.name).toBe('Food & Drink');
    expect(result.current.categories[1]?.isIncome).toBe(true);
  });

  it('includes both income and expense categories', async () => {
    rowsRef.current = [
      makeCategoryRow({ id: 'cat-expense', is_income: 0 }),
      makeCategoryRow({ id: 'cat-income', name: 'Salary', is_income: 1 }),
      makeCategoryRow({ id: 'cat-expense-2', name: 'Transport', is_income: 0 }),
    ];

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.categories).toHaveLength(3);
    });
    const incomeCategories = result.current.categories.filter((c) => c.isIncome);
    const expenseCategories = result.current.categories.filter((c) => !c.isIncome);

    expect(incomeCategories).toHaveLength(1);
    expect(expenseCategories).toHaveLength(2);
  });

  it('builds the Food & Meals template state from existing child categories', async () => {
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

    await waitFor(() => {
      expect(result.current.foodMealTemplate.parentCategory?.name).toBe('Food');
    });
    expect(result.current.foodMealTemplate.subcategories.map((category) => category.name)).toEqual([
      'Groceries',
      'Dining Out',
    ]);
    expect(result.current.foodMealTemplate.missingSubcategoryDefinitions).toHaveLength(3);
  });

  it('creates the missing Food & Meals categories under an existing parent', async () => {
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
      .mockResolvedValueOnce(
        makeCategory({
          id: 'cat-dining',
          name: 'Dining Out',
          parentId: 'cat-food',
          icon: '🍽️',
          sortOrder: 3,
        }),
      )
      .mockResolvedValueOnce(
        makeCategory({
          id: 'cat-delivery',
          name: 'Delivery & Takeout',
          parentId: 'cat-food',
          icon: '🥡',
          sortOrder: 4,
        }),
      )
      .mockResolvedValueOnce(
        makeCategory({
          id: 'cat-coffee',
          name: 'Coffee & Snacks',
          parentId: 'cat-food',
          icon: '☕',
          sortOrder: 5,
        }),
      )
      .mockResolvedValueOnce(
        makeCategory({
          id: 'cat-meal-prep',
          name: 'Meal Prep',
          parentId: 'cat-food',
          icon: '🥗',
          sortOrder: 6,
        }),
      );

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.categories).toHaveLength(2);
    });

    let templateState: ReturnType<typeof useCategories>['foodMealTemplate'] | null = null;
    await act(async () => {
      templateState = await result.current.ensureFoodMealCategories();
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

  it('captures errors and sets error state', async () => {
    vi.mocked(sqliteDb.selectAll).mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.error).toBe('DB read failed');
    });
    expect(result.current.categories).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', async () => {
    vi.mocked(sqliteDb.selectAll).mockImplementation(() => {
      throw 'string error';
    });

    const { result } = renderHook(() => useCategories());

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load categories.');
    });
  });

  it('creates a category and triggers refresh', async () => {
    const created = makeCategory({ id: 'cat-new', name: 'Entertainment' });
    testState.createCategory.mockResolvedValue(created);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    await act(async () => {
      returned = await result.current.createCategory({
        householdId: 'hh-1',
        name: 'Entertainment',
      });
    });

    expect(returned).toEqual(created);
    expect(testState.createCategory).toHaveBeenCalledOnce();
  });

  it('returns null and sets error when createCategory throws', async () => {
    testState.createCategory.mockRejectedValue(new Error('Insert failed'));

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    await act(async () => {
      returned = await result.current.createCategory({
        householdId: 'hh-1',
        name: 'Entertainment',
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Insert failed');
  });

  it('updates a category and triggers refresh', async () => {
    rowsRef.current = [makeCategoryRow()];
    const updated = makeCategory({ name: 'Groceries' });
    testState.updateCategory.mockResolvedValue(updated);

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    await act(async () => {
      returned = await result.current.updateCategory('cat-1', { name: 'Groceries' });
    });

    expect(returned).toEqual(updated);
    expect(testState.updateCategory).toHaveBeenCalledWith(mockDb, 'cat-1', { name: 'Groceries' });
  });

  it('does not refresh when updateCategory returns null', async () => {
    testState.updateCategory.mockResolvedValue(null);

    const { result } = renderHook(() => useCategories());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const callCountAfterMount = vi.mocked(sqliteDb.selectAll).mock.calls.length;

    await act(async () => {
      await result.current.updateCategory('nonexistent', { name: 'Nope' });
    });

    expect(vi.mocked(sqliteDb.selectAll).mock.calls.length).toBe(callCountAfterMount);
  });

  it('returns null and sets error when updateCategory throws', async () => {
    testState.updateCategory.mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useCategories());

    let returned: Category | null = null;
    await act(async () => {
      returned = await result.current.updateCategory('cat-1', { name: 'Nope' });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Update failed');
  });

  it('deletes a category and triggers refresh', async () => {
    rowsRef.current = [makeCategoryRow()];
    testState.deleteCategory.mockResolvedValue(true);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteCategory('cat-1');
    });

    expect(deleted).toBe(true);
    expect(testState.deleteCategory).toHaveBeenCalledWith(mockDb, 'cat-1');
  });

  it('returns false when deletion target is not found', async () => {
    testState.deleteCategory.mockResolvedValue(false);

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteCategory('nonexistent');
    });

    expect(deleted).toBe(false);
  });

  it('returns false and sets error when deleteCategory throws', async () => {
    testState.deleteCategory.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useCategories());

    let deleted = false;
    await act(async () => {
      deleted = await result.current.deleteCategory('cat-1');
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  it('re-fetches data when refresh is called', async () => {
    const { result } = renderHook(() => useCategories());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const callCountAfterMount = vi.mocked(sqliteDb.selectAll).mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(vi.mocked(sqliteDb.selectAll).mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });
});
