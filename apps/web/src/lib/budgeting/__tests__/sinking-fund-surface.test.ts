// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildSinkingFundSurfaceState } from '../sinking-fund-surface';

describe('sinking fund surface state', () => {
  it('surfaces active plans separately from archived historical plans', () => {
    const state = buildSinkingFundSurfaceState(
      [
        {
          id: 'fund-active',
          name: 'Holiday',
          targetCents: 60_000,
          savedCents: 30_000,
          dueDate: '2025-07-01',
          linkedCategoryId: 'cat-holiday',
        },
        {
          id: 'fund-archived',
          name: 'Old trip',
          targetCents: 50_000,
          savedCents: 50_000,
          dueDate: '2024-07-01',
          linkedCategoryId: 'cat-trip',
          isArchived: true,
        },
      ],
      '2025-01-01',
    );

    expect(state.activeCards.map((card) => card.fundId)).toEqual(['fund-active']);
    expect(state.archivedCards.map((card) => card.fundId)).toEqual(['fund-archived']);
    expect(state.totalActiveRemainingCents).toBe(30_000);
    expect(state.offlineFriendlyMessage).toContain('locally saved');
  });
});
