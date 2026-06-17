// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '../../kmp/bridge';
import { useAutoCategorize } from '../useAutoCategorize';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function makeCategory(id: string, name: string): Category {
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

const categories = [
  makeCategory('cat-food', 'Food'),
  makeCategory('cat-transport', 'Transport'),
  makeCategory('cat-entertainment', 'Entertainment'),
];

describe('useAutoCategorize', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('suggests a built-in merchant using category aliases', () => {
    const { result } = renderHook(() => useAutoCategorize(categories));
    const suggestion = result.current.suggestCategory("Trader Joe's #42");
    expect(suggestion?.categoryId).toBe('cat-food');
    expect(suggestion?.confidence).toBe(0.75);
  });

  it('respects the confidence threshold for auto-apply', () => {
    const { result } = renderHook(() => useAutoCategorize(categories));
    const suggestion = result.current.suggestCategory('Unknown stream service', 1299);
    expect(result.current.shouldAutoApply(suggestion)).toBe(false);
  });

  it('learns from user feedback and uses the learned rule', () => {
    const { result } = renderHook(() => useAutoCategorize(categories));

    act(() => {
      result.current.learnFromFeedback({
        description: 'Local Taco Truck',
        amountCents: 1800,
        categoryId: 'cat-food',
        categoryName: 'Food',
      });
    });

    const suggestion = result.current.suggestCategory('Local Taco Truck');
    expect(suggestion?.source).toBe('user');
    expect(suggestion?.confidence).toBe(0.95);
  });
});
