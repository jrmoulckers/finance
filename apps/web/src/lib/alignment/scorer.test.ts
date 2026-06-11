// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { calculateAlignmentScore, mapCategoryToValueAllocations } from './scorer';
import type { AlignmentSpendingSnapshot, UserValuePreference } from './types';

const alignedPreferences: readonly UserValuePreference[] = [
  { valueId: 'security', weight: 10 },
  { valueId: 'family', weight: 9 },
  { valueId: 'health', weight: 7 },
  { valueId: 'growth', weight: 6 },
  { valueId: 'freedom', weight: 5 },
  { valueId: 'experiences', weight: 3 },
  { valueId: 'education', weight: 2 },
  { valueId: 'generosity', weight: 1 },
];

const misalignedPreferences: readonly UserValuePreference[] = [
  { valueId: 'experiences', weight: 10 },
  { valueId: 'generosity', weight: 9 },
  { valueId: 'education', weight: 8 },
  { valueId: 'health', weight: 6 },
  { valueId: 'family', weight: 5 },
  { valueId: 'security', weight: 4 },
  { valueId: 'growth', weight: 3 },
  { valueId: 'freedom', weight: 2 },
];

const snapshot: AlignmentSpendingSnapshot = {
  categories: [
    {
      categoryId: 'savings',
      categoryName: 'Savings & investing',
      amount: 60_000,
      source: 'savings',
      allocations: [
        { valueId: 'security', weight: 0.6 },
        { valueId: 'freedom', weight: 0.25 },
        { valueId: 'growth', weight: 0.15 },
      ],
    },
    {
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amount: 24_000,
      source: 'expense',
      allocations: [
        { valueId: 'health', weight: 0.55 },
        { valueId: 'family', weight: 0.45 },
      ],
    },
    {
      categoryId: 'childcare',
      categoryName: 'Childcare',
      amount: 16_000,
      source: 'expense',
      allocations: [
        { valueId: 'family', weight: 0.7 },
        { valueId: 'education', weight: 0.3 },
      ],
    },
  ],
  totalInputAmount: 100_000,
  totalMappedAmount: 100_000,
  unmappedAmount: 0,
};

describe('alignment scorer', () => {
  it('maps dining-style categories to experiences', () => {
    const allocations = mapCategoryToValueAllocations('Dining out');

    expect(allocations[0]?.valueId).toBe('experiences');
  });

  it('scores aligned preferences higher than mismatched preferences', () => {
    const aligned = calculateAlignmentScore(snapshot, alignedPreferences);
    const misaligned = calculateAlignmentScore(snapshot, misalignedPreferences);

    expect(aligned.score).toBeGreaterThan(misaligned.score);
    expect(aligned.mappedCoverage).toBe(1);
    expect(
      aligned.breakdown.find((value) => value.valueId === 'security')?.actualAmount,
    ).toBeGreaterThan(0);
  });
});
