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

import { useCallback, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createCategory as repoCreateCategory,
  deleteCategory as repoDeleteCategory,
  mapCategory,
  updateCategory as repoUpdateCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../db/repositories/categories';
import type { Row } from '../db/sqlite-wasm';
import type { Category, SyncId } from '../kmp/bridge';
import { useRealtimeTable } from './useRealtimeTable';

export interface UseCategoriesResult {
  categories: Category[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createCategory: (input: CreateCategoryInput) => Category | null;
  updateCategory: (categoryId: SyncId, updates: UpdateCategoryInput) => Category | null;
  deleteCategory: (categoryId: SyncId) => boolean;
}

export function useCategories(): UseCategoriesResult {
  const db = useDatabase();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const {
    rows,
    loading,
    error: liveError,
    refresh,
  } = useRealtimeTable<Row>('category', {
    where: 'deleted_at IS NULL',
    orderBy: 'sort_order ASC, name ASC',
  });

  const categories = useMemo(() => rows.map((row) => mapCategory(row)), [rows]);
  const error = mutationError ?? liveError;

  const createCategory = useCallback(
    (input: CreateCategoryInput): Category | null => {
      try {
        setMutationError(null);
        return repoCreateCategory(db, input);
      } catch (categoryError) {
        setMutationError(
          categoryError instanceof Error ? categoryError.message : 'Failed to create category.',
        );
        return null;
      }
    },
    [db],
  );

  const updateCategory = useCallback(
    (categoryId: SyncId, updates: UpdateCategoryInput): Category | null => {
      try {
        setMutationError(null);
        return repoUpdateCategory(db, categoryId, updates);
      } catch (categoryError) {
        setMutationError(
          categoryError instanceof Error ? categoryError.message : 'Failed to update category.',
        );
        return null;
      }
    },
    [db],
  );

  const deleteCategory = useCallback(
    (categoryId: SyncId): boolean => {
      try {
        setMutationError(null);
        return repoDeleteCategory(db, categoryId);
      } catch (categoryError) {
        setMutationError(
          categoryError instanceof Error ? categoryError.message : 'Failed to delete category.',
        );
        return false;
      }
    },
    [db],
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
