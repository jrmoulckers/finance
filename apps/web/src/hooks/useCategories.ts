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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  createCategory as repoCreateCategory,
  deleteCategory as repoDeleteCategory,
  getAllCategories,
  updateCategory as repoUpdateCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '../db/repositories/categories';
import { queryOne, type Row } from '../db/sqlite-wasm';
import type { Category, SyncId } from '../kmp/bridge';

export interface FoodMealTemplateCategoryDefinition {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly description: string;
}

export interface FoodMealTemplateState {
  readonly parentCategory: Category | null;
  readonly subcategories: Category[];
  readonly missingSubcategoryDefinitions: readonly FoodMealTemplateCategoryDefinition[];
}

const FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS = [
  { name: 'Food & Meals', icon: 'utensils', color: '#16A34A' },
  { name: 'Food', icon: 'utensils', color: '#16A34A' },
  { name: 'Dining', icon: 'utensils', color: '#16A34A' },
] as const;

export const FOOD_MEAL_SUBCATEGORY_DEFINITIONS: readonly FoodMealTemplateCategoryDefinition[] = [
  {
    name: 'Groceries',
    icon: '🛒',
    color: '#16A34A',
    description: 'Weekly staples and pantry refills.',
  },
  {
    name: 'Dining Out',
    icon: '🍽️',
    color: '#F97316',
    description: 'Restaurants, cafés, and sit-down meals.',
  },
  {
    name: 'Delivery & Takeout',
    icon: '🥡',
    color: '#FB7185',
    description: 'Delivery fees, takeout, and app orders.',
  },
  {
    name: 'Coffee & Snacks',
    icon: '☕',
    color: '#A16207',
    description: 'Coffee runs, treats, and snack stops.',
  },
  {
    name: 'Meal Prep',
    icon: '🥗',
    color: '#0F766E',
    description: 'Ingredients bought for planned meals.',
  },
] as const;

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

function getFirstHouseholdId(db: ReturnType<typeof useDatabase>): SyncId | null {
  const row = queryOne<Row>(
    db,
    'SELECT id FROM household WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  );
  return row && typeof row.id === 'string' ? row.id : null;
}

function getNextSortOrder(categories: readonly Category[], householdId: SyncId): number {
  return (
    categories
      .filter((category) => category.householdId === householdId)
      .reduce((maxSortOrder, category) => Math.max(maxSortOrder, category.sortOrder), 0) + 1
  );
}

export function findFoodMealParentCategory(categories: readonly Category[]): Category | null {
  return (
    FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS.map((definition) =>
      categories.find(
        (category) =>
          !category.isIncome &&
          normalizeCategoryName(category.name) === normalizeCategoryName(definition.name),
      ),
    ).find((category): category is Category => category !== undefined) ?? null
  );
}

export function buildFoodMealTemplateState(categories: readonly Category[]): FoodMealTemplateState {
  const parentCategory = findFoodMealParentCategory(categories);
  const subcategories = parentCategory
    ? FOOD_MEAL_SUBCATEGORY_DEFINITIONS.map((definition) =>
        categories.find(
          (category) =>
            category.parentId === parentCategory.id &&
            !category.isIncome &&
            normalizeCategoryName(category.name) === normalizeCategoryName(definition.name),
        ),
      ).filter((category): category is Category => category !== undefined)
    : [];

  return {
    parentCategory,
    subcategories,
    missingSubcategoryDefinitions: FOOD_MEAL_SUBCATEGORY_DEFINITIONS.filter(
      (definition) =>
        !subcategories.some(
          (category) =>
            normalizeCategoryName(category.name) === normalizeCategoryName(definition.name),
        ),
    ),
  };
}

export function isFoodMealBudgetParentCategory(
  category: Category | null | undefined,
  categories: readonly Category[],
): boolean {
  if (!category || category.isIncome) {
    return false;
  }

  return (
    FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS.some(
      (definition) =>
        normalizeCategoryName(category.name) === normalizeCategoryName(definition.name),
    ) ||
    categories.some(
      (candidate) =>
        candidate.parentId === category.id &&
        FOOD_MEAL_SUBCATEGORY_DEFINITIONS.some(
          (definition) =>
            normalizeCategoryName(candidate.name) === normalizeCategoryName(definition.name),
        ),
    )
  );
}

export function isFoodMealCategory(
  category: Category | null | undefined,
  categories: readonly Category[],
): boolean {
  if (!category || category.isIncome) {
    return false;
  }

  const normalizedName = normalizeCategoryName(category.name);
  if (
    FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS.some(
      (definition) => normalizedName === normalizeCategoryName(definition.name),
    ) ||
    FOOD_MEAL_SUBCATEGORY_DEFINITIONS.some(
      (definition) => normalizedName === normalizeCategoryName(definition.name),
    )
  ) {
    return true;
  }

  const parentCategory = category.parentId
    ? (categories.find((candidate) => candidate.id === category.parentId) ?? null)
    : null;
  if (
    parentCategory &&
    FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS.some(
      (definition) =>
        normalizeCategoryName(parentCategory.name) === normalizeCategoryName(definition.name),
    )
  ) {
    return true;
  }

  return categories.some(
    (candidate) =>
      candidate.parentId === category.id &&
      FOOD_MEAL_SUBCATEGORY_DEFINITIONS.some(
        (definition) =>
          normalizeCategoryName(candidate.name) === normalizeCategoryName(definition.name),
      ),
  );
}

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
  /** Current Food & Meals template setup based on existing categories. */
  foodMealTemplate: FoodMealTemplateState;
  /** Create the missing Food & Meals parent/subcategories and return the next template state. */
  ensureFoodMealCategories: () => FoodMealTemplateState | null;
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

  const foodMealTemplate = useMemo(() => buildFoodMealTemplateState(categories), [categories]);

  const ensureFoodMealCategories = useCallback((): FoodMealTemplateState | null => {
    try {
      const nextCategories = [...categories];
      let parentCategory = foodMealTemplate.parentCategory;
      const householdId =
        parentCategory?.householdId ?? nextCategories[0]?.householdId ?? getFirstHouseholdId(db);

      if (!householdId) {
        setError('No household found. Create a household before adding Food & Meals categories.');
        setLoading(false);
        return null;
      }

      let createdCategories = false;

      if (!parentCategory) {
        parentCategory = repoCreateCategory(db, {
          householdId,
          name: FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS[0].name,
          icon: FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS[0].icon,
          color: FOOD_MEAL_PARENT_CATEGORY_DEFINITIONS[0].color,
          sortOrder: getNextSortOrder(nextCategories, householdId),
        });
        nextCategories.push(parentCategory);
        createdCategories = true;
      }

      const existingChildNames = new Set(
        nextCategories
          .filter((category) => category.parentId === parentCategory.id)
          .map((category) => normalizeCategoryName(category.name)),
      );

      for (const definition of FOOD_MEAL_SUBCATEGORY_DEFINITIONS) {
        const normalizedName = normalizeCategoryName(definition.name);
        if (existingChildNames.has(normalizedName)) {
          continue;
        }

        const createdCategory = repoCreateCategory(db, {
          householdId,
          name: definition.name,
          icon: definition.icon,
          color: definition.color,
          parentId: parentCategory.id,
          sortOrder: getNextSortOrder(nextCategories, householdId),
        });
        nextCategories.push(createdCategory);
        existingChildNames.add(normalizedName);
        createdCategories = true;
      }

      if (createdCategories) {
        refresh();
      }

      return buildFoodMealTemplateState(nextCategories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add Food & Meals categories.');
      setLoading(false);
      return null;
    }
  }, [categories, db, foodMealTemplate.parentCategory, refresh]);

  return {
    categories,
    loading,
    error,
    refresh,
    createCategory,
    updateCategory,
    deleteCategory,
    foodMealTemplate,
    ensureFoodMealCategories,
  };
}
