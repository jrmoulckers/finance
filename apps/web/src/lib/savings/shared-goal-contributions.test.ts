// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { summarizeGoalContributions } from './shared-goal-contributions';

describe('shared goal contribution rules', () => {
  it('projects monthly targets and privacy-aware contributor summaries', () => {
    const summary = summarizeGoalContributions(
      12000_00,
      3000_00,
      '2026-07-01',
      '2026-04-01',
      [
        { id: 'a', name: 'Avery', splitPercent: 60, privacy: 'visible' },
        { id: 'b', name: 'Blake', splitPercent: 40, privacy: 'percent-only' },
      ],
      [
        { contributorId: 'a', date: '2026-04-01', amountCents: 1800_00 },
        { contributorId: 'b', date: '2026-04-01', amountCents: 1200_00 },
      ],
    );
    expect(summary.monthlyTargetCents).toBe(3000_00);
    expect(summary.contributors).toEqual([
      { contributorId: 'a', displayName: 'Avery', amountCents: 1800_00, percentOfTotal: 60 },
      { contributorId: 'b', displayName: 'Blake', amountCents: null, percentOfTotal: 40 },
    ]);
  });
});
