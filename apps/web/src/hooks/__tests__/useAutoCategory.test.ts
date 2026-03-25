// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '../../kmp/bridge';
import { clearLearnedRules } from '../../lib/categorization/user-rules';
import { useAutoCategory } from '../useAutoCategory';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeCat(id: string, name: string): Category {
  return {
    id,
    householdId: 'hh-1',
    name,
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    ...syncMetadata,
  };
}

const categories: Category[] = [
  makeCat('cat-groceries', 'Groceries'),
  makeCat('cat-dining', 'Dining'),
  makeCat('cat-transport', 'Transportation'),
  makeCat('cat-utilities', 'Utilities'),
  makeCat('cat-entertainment', 'Entertainment'),
  makeCat('cat-healthcare', 'Healthcare'),
  makeCat('cat-shopping', 'Shopping'),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoCategory', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLearnedRules();
  });

  it('returns a suggestion for a known merchant', () => {
    const { result } = renderHook(() => useAutoCategory(categories));
    const suggestion = result.current.suggestCategory('walmart');
    expect(suggestion).not.toBeNull();
    expect(suggestion!.categoryName).toBe('Groceries');
    expect(suggestion!.categoryId).toBe('cat-groceries');
  });

  it('returns null for an unknown merchant', () => {
    const { result } = renderHook(() => useAutoCategory(categories));
    const suggestion = result.current.suggestCategory('Random Store XYZ');
    expect(suggestion).toBeNull();
  });

  it('returns null for empty description', () => {
    const { result } = renderHook(() => useAutoCategory(categories));
    const suggestion = result.current.suggestCategory('');
    expect(suggestion).toBeNull();
  });

  it('learn correction updates future suggestions', () => {
    const { result } = renderHook(() => useAutoCategory(categories));

    // Before learning
    const before = result.current.suggestCategory('my local shop');
    expect(before).toBeNull();

    // Learn a correction
    result.current.learnCorrection('my local shop', 'cat-groceries');

    // After learning
    const after = result.current.suggestCategory('my local shop');
    expect(after).not.toBeNull();
    expect(after!.categoryId).toBe('cat-groceries');
    expect(after!.source).toBe('user');
  });

  it('getSuggestionHistory returns learned rules', () => {
    const { result } = renderHook(() => useAutoCategory(categories));

    expect(result.current.getSuggestionHistory()).toHaveLength(0);

    result.current.learnCorrection('walmart', 'cat-dining');
    result.current.learnCorrection('target', 'cat-shopping');

    const history = result.current.getSuggestionHistory();
    expect(history).toHaveLength(2);
  });

  it('clearLearnedRules removes all learned rules', () => {
    const { result } = renderHook(() => useAutoCategory(categories));

    result.current.learnCorrection('walmart', 'cat-dining');
    expect(result.current.getSuggestionHistory()).toHaveLength(1);

    result.current.clearLearnedRules();
    expect(result.current.getSuggestionHistory()).toHaveLength(0);
  });

  it('accepts an optional amount parameter for heuristic matching', () => {
    const { result } = renderHook(() => useAutoCategory(categories));
    // Unknown merchant with an amount hint — may produce a low-confidence suggestion
    const suggestion = result.current.suggestCategory('Unknown Place', 1200);
    if (suggestion) {
      expect(suggestion.confidence).toBeLessThanOrEqual(0.5);
      expect(suggestion.source).toBe('pattern');
    }
  });
});
