// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { projectSuggestedGoal } from './projections';

describe('projectSuggestedGoal', () => {
  it('projects a completion date and milestone timeline', () => {
    const projection = projectSuggestedGoal(
      {
        targetCents: 120_000,
        currentCents: 20_000,
        targetDate: '2025-12-31',
      },
      20_000,
      new Date('2025-06-01T00:00:00Z'),
    );

    expect(projection.monthsToGoal).toBe(5);
    expect(projection.projectedCompletionDate).toBe('2025-11-01');
    expect(projection.onTrack).toBe(true);
    expect(projection.milestoneDates).toHaveLength(4);
  });

  it('returns a non-projectable state when contributions are zero', () => {
    const projection = projectSuggestedGoal(
      {
        targetCents: 100_000,
        currentCents: 10_000,
        targetDate: null,
      },
      0,
      new Date('2025-06-01T00:00:00Z'),
    );

    expect(projection.projectedCompletionDate).toBeNull();
    expect(projection.monthsToGoal).toBeNull();
  });
});
