// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { generateMisalignmentAlerts } from './analyzer';
import { calculateAlignmentScore } from './scorer';
import type { AlignmentSpendingSnapshot, UserValuePreference } from './types';

const preferences: readonly UserValuePreference[] = [
  { valueId: 'health', weight: 10 },
  { valueId: 'security', weight: 9 },
  { valueId: 'family', weight: 8 },
  { valueId: 'growth', weight: 7 },
  { valueId: 'freedom', weight: 6 },
  { valueId: 'experiences', weight: 4 },
  { valueId: 'education', weight: 3 },
  { valueId: 'generosity', weight: 2 },
];

const snapshot: AlignmentSpendingSnapshot = {
  categories: [
    {
      categoryId: 'travel',
      categoryName: 'Travel',
      amount: 40_000,
      source: 'expense',
      allocations: [
        { valueId: 'experiences', weight: 0.7 },
        { valueId: 'freedom', weight: 0.3 },
      ],
    },
    {
      categoryId: 'uncategorized',
      categoryName: 'Uncategorized',
      amount: 40_000,
      source: 'expense',
      allocations: [],
    },
    {
      categoryId: 'savings',
      categoryName: 'Savings & investing',
      amount: 20_000,
      source: 'savings',
      allocations: [
        { valueId: 'security', weight: 0.6 },
        { valueId: 'freedom', weight: 0.25 },
        { valueId: 'growth', weight: 0.15 },
      ],
    },
  ],
  totalInputAmount: 100_000,
  totalMappedAmount: 60_000,
  unmappedAmount: 40_000,
};

describe('alignment analyzer', () => {
  it('flags missing spend for a top value and low mapping coverage', () => {
    const result = calculateAlignmentScore(snapshot, preferences);
    const alerts = generateMisalignmentAlerts(snapshot, preferences, result);

    expect(alerts.some((alert) => alert.id === 'coverage')).toBe(true);
    expect(alerts.some((alert) => alert.id === 'health-missing')).toBe(true);
    expect(alerts.find((alert) => alert.id === 'health-missing')?.description).toContain('gym');
  });
});
