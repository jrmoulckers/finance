// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Category } from '../../kmp/bridge';
import { filterAndSortCategories } from './filter-sort';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    householdId: 'household-1',
    name: 'Groceries',
    parentId: null,
    icon: 'groceries',
    color: '#22c55e',
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  } as Category;
}

const categories: Category[] = [
  makeCategory({ id: 'food', name: 'Food', sortOrder: 2, isIncome: false }),
  makeCategory({ id: 'salary', name: 'Salary', sortOrder: 0, isIncome: true }),
  makeCategory({ id: 'rent', name: 'Rent', sortOrder: 1, isIncome: false }),
  makeCategory({ id: 'cafe', name: 'Café', sortOrder: 3, isIncome: false }),
];

const usageCounts = new Map<string, number>([
  ['food', 10],
  ['salary', 1],
  ['rent', 5],
  ['cafe', 0],
]);

describe('filterAndSortCategories', () => {
  it('returns all categories sorted by name when unfiltered', () => {
    const result = filterAndSortCategories(
      categories,
      { query: '', typeFilter: 'all', sortField: 'name' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['cafe', 'food', 'rent', 'salary']);
  });

  it('filters by income type', () => {
    const result = filterAndSortCategories(
      categories,
      { query: '', typeFilter: 'income', sortField: 'name' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['salary']);
  });

  it('filters by expense type', () => {
    const result = filterAndSortCategories(
      categories,
      { query: '', typeFilter: 'expense', sortField: 'name' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['cafe', 'food', 'rent']);
  });

  it('matches the name query ignoring case and diacritics', () => {
    const result = filterAndSortCategories(
      categories,
      { query: 'cafe', typeFilter: 'all', sortField: 'name' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['cafe']);
  });

  it('sorts by usage descending, then name', () => {
    const result = filterAndSortCategories(
      categories,
      { query: '', typeFilter: 'all', sortField: 'usage' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['food', 'rent', 'salary', 'cafe']);
  });

  it('sorts by manual sort order', () => {
    const result = filterAndSortCategories(
      categories,
      { query: '', typeFilter: 'all', sortField: 'sortOrder' },
      usageCounts,
    );
    expect(result.map((c) => c.id)).toEqual(['salary', 'rent', 'food', 'cafe']);
  });

  it('returns an empty array when nothing matches', () => {
    const result = filterAndSortCategories(
      categories,
      { query: 'nonexistent', typeFilter: 'all', sortField: 'name' },
      usageCounts,
    );
    expect(result).toEqual([]);
  });
});
