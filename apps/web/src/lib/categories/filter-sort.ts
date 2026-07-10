// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure search / filter / sort helpers for the Categories page.
 *
 * Extracted from `CategoriesPage` so the narrowing logic is unit-testable
 * without rendering React. All functions are pure and side-effect free.
 *
 * References: issue #3790
 */

import type { Category } from '../../kmp/bridge';

/** Which category kinds to include. */
export type CategoryTypeFilter = 'all' | 'income' | 'expense';

/** How to order the resulting category list. */
export type CategorySortField = 'name' | 'usage' | 'sortOrder';

export interface CategoryFilterOptions {
  /** Free-text query matched (case/diacritic-insensitive) against the name. */
  query: string;
  /** Restrict to income, expense, or all categories. */
  typeFilter: CategoryTypeFilter;
  /** Primary sort field. */
  sortField: CategorySortField;
}

/** Lower-case and strip diacritics so `cafe` matches `Café`. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Filter categories by name query and income/expense type, then sort.
 *
 * `name` sorts alphabetically (locale-aware), `usage` sorts by transaction
 * count descending (most-used first), and `sortOrder` respects the stored
 * manual ordering. Ties fall back to alphabetical name order so the output is
 * deterministic.
 */
export function filterAndSortCategories(
  categories: readonly Category[],
  options: CategoryFilterOptions,
  usageCounts: ReadonlyMap<string, number>,
): Category[] {
  const term = normalize(options.query.trim());

  const filtered = categories.filter((category) => {
    if (options.typeFilter === 'income' && !category.isIncome) return false;
    if (options.typeFilter === 'expense' && category.isIncome) return false;
    if (term !== '' && !normalize(category.name).includes(term)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (options.sortField) {
      case 'usage': {
        const usageA = usageCounts.get(a.id) ?? 0;
        const usageB = usageCounts.get(b.id) ?? 0;
        if (usageA !== usageB) return usageB - usageA;
        return a.name.localeCompare(b.name);
      }
      case 'sortOrder': {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      }
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return sorted;
}
