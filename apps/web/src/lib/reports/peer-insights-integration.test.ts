// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildInsightsPeerComparisonReport, buildPeerComparisonCards } from './peer-insights-integration';

describe('peer insights integration', () => {
  it('preserves opt-in before exposing category peer cards', () => {
    const report = buildInsightsPeerComparisonReport({
      profile: { optedIn: false },
      categorySpending: [{ categoryName: 'Housing', amount: 120_000 }],
      monthlyIncomeCents: 400_000,
    });

    expect(report.optedIn).toBe(false);
    expect(buildPeerComparisonCards(report)).toEqual([]);
  });

  it('maps insights category spending into accessible peer comparison cards', () => {
    const report = buildInsightsPeerComparisonReport({
      profile: { optedIn: true, householdSize: 3, lifeStage: 'single-parent' },
      categorySpending: [
        { categoryName: 'Housing', amount: 120_000 },
        { categoryName: 'Food & Dining', amount: 70_000 },
      ],
      monthlyIncomeCents: 400_000,
    });
    const cards = buildPeerComparisonCards(report);

    expect(cards).toHaveLength(2);
    expect(cards[0].ariaLabel).toContain('peer range');
    expect(cards[0].percentLabel).toBe('30% of income');
  });
});
