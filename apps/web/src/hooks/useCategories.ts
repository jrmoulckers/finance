// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for accessing and mutating transaction category data.
 *
 * Reads from the local SQLite-WASM database via the categories repository.
 * All operations are synchronous against the local DB; errors are captured
 * in state rather than thrown so callers can render gracefully.
 *
 * Usage:
 * ```tsx
 * const { categories, loading, error, createCategory, refresh } = useCategories();
 * ```
 *
 * References: issue #443
 */

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createCategory as repoCreateCategory,
  deleteCategory as repoDeleteCategory,
  getAllCategories,
  updateCategory as repoUpdateCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../db/repositories/categories';
import type { Category, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useCategories}. */
export interface UseCategoriesResult {
  /**
   * All non-deleted categories ordered by sort order and name.
   * Includes both root and child categories.
   */
  categories: Category[];
  /** `true` while the initial or refresh load is in progress. */
  loading: boolean;
  /** Human-readable error message from the last failed operation, or `null`. */
  error: string | null;
  /** Trigger a re-fetch of all categories from the local database. */
  refresh: () => void;
  /**
   * Create a new category and automatically refresh the list.
   * @returns The created category, or `null` if creation failed.
   */
  createCategory: (input: CreateCategoryInput) => Category | null;
  /**
   * Update an existing category and automatically refresh the list.
   * @returns The updated category, or `null` if the category was not found or update failed.
   */
  updateCategory: (categoryId: SyncId, updates: UpdateCategoryInput) => Category | null;
  /**
   * Soft-delete a category and automatically refresh the list.
   * @returns `true` if deletion succeeded, `false` otherwise.
   */
  deleteCategory: (categoryId: SyncId) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Load all categories from the local database and expose CRUD operations. */
export function useCategories(): UseCategoriesResult {
  const db = useDatabase();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  /** Increment the refresh token to trigger a data re-fetch. */
  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const result = getAllCategories(db);
      setCategories(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories.');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const createCategory = useCallback(
    (input: CreateCategoryInput): Category | null => {
      try {
        const created = repoCreateCategory(db, input);
        refresh();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create category.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const updateCategory = useCallback(
    (categoryId: SyncId, updates: UpdateCategoryInput): Category | null => {
      try {
        const updated = repoUpdateCategory(db, categoryId, updates);
        if (updated !== null) {
          refresh();
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update category.');
        setLoading(false);
        return null;
      }
    },
    [db, refresh],
  );

  const deleteCategory = useCallback(
    (categoryId: SyncId): boolean => {
      try {
        const deleted = repoDeleteCategory(db, categoryId);
        if (deleted) {
          refresh();
        }
        return deleted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete category.');
        setLoading(false);
        return false;
      }
    },
    [db, refresh],
  );

  return {
    categories,
    loading,
    error,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
