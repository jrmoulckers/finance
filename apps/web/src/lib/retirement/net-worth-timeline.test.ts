// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the net worth timeline engine.
 *
 * Covers milestone detection, growth rate calculation, net worth projection,
 * and life event annotation.
 *
 * References: #1745
 */

import { describe, expect, it } from 'vitest';
import type { LifeEventMilestone, NetWorthSnapshot } from './types';
import {
  detectMilestones,
  findNewMilestones,
  calculateGrowthRate,
  calculatePeriodicGrowthRates,
  calculateMonthlyGrowthRate,
  projectNetWorth,
  annotateLifeEvents,
  CELEBRATION_THRESHOLDS,
} from './net-worth-timeline';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const snapshots: NetWorthSnapshot[] = [
  {
    date: '2023-01-01',
    totalAssetsCents: 50000_00,
    totalLiabilitiesCents: 10000_00,
    netWorthCents: 40000_00,
  },
  {
    date: '2023-06-01',
    totalAssetsCents: 70000_00,
    totalLiabilitiesCents: 10000_00,
    netWorthCents: 60000_00,
  },
  {
    date: '2024-01-01',
    totalAssetsCents: 120000_00,
    totalLiabilitiesCents: 10000_00,
    netWorthCents: 110000_00,
  },
  {
    date: '2024-06-01',
    totalAssetsCents: 160000_00,
    totalLiabilitiesCents: 10000_00,
    netWorthCents: 150000_00,
  },
];

// ---------------------------------------------------------------------------
// Milestone detection
// ---------------------------------------------------------------------------

describe('detectMilestones', () => {
  it('detects milestones reached in snapshot history', () => {
    const milestones = detectMilestones(snapshots);

    const positiveNW = milestones.find((m) => m.thresholdCents === 0);
    expect(positiveNW?.reached).toBe(true);
    expect(positiveNW?.reachedDate).toBe('2023-01-01');

    const first100k = milestones.find((m) => m.thresholdCents === 100000_00);
    expect(first100k?.reached).toBe(true);
    expect(first100k?.reachedDate).toBe('2024-01-01');

    const first500k = milestones.find((m) => m.thresholdCents === 500000_00);
    expect(first500k?.reached).toBe(false);
    expect(first500k?.reachedDate).toBeNull();
  });

  it('handles empty snapshots', () => {
    const milestones = detectMilestones([]);
    expect(milestones.every((m) => !m.reached)).toBe(true);
  });
});

describe('findNewMilestones', () => {
  it('finds milestones crossed between two values', () => {
    const newMilestones = findNewMilestones(90000_00, 110000_00);
    expect(newMilestones).toContain('First $100K!');
  });

  it('returns empty when no milestones crossed', () => {
    expect(findNewMilestones(40000_00, 45000_00)).toHaveLength(0);
  });

  it('finds multiple milestones crossed at once', () => {
    const newMilestones = findNewMilestones(5000_00, 30000_00);
    expect(newMilestones).toContain('$10K Net Worth!');
    expect(newMilestones).toContain('$25K Net Worth!');
  });
});

describe('CELEBRATION_THRESHOLDS', () => {
  it('has thresholds in ascending order', () => {
    for (let i = 1; i < CELEBRATION_THRESHOLDS.length; i++) {
      expect(CELEBRATION_THRESHOLDS[i]!.cents).toBeGreaterThan(
        CELEBRATION_THRESHOLDS[i - 1]!.cents,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Growth rates
// ---------------------------------------------------------------------------

describe('calculateGrowthRate', () => {
  it('calculates growth between two snapshots', () => {
    const rate = calculateGrowthRate(snapshots[0]!, snapshots[2]!);
    expect(rate.changeCents).toBe(70000_00); // 110K - 40K
    expect(rate.changePercent).toBeGreaterThan(0);
    expect(rate.annualizedRate).toBeGreaterThan(0);
  });

  it('handles zero starting net worth', () => {
    const zeroStart: NetWorthSnapshot = {
      date: '2023-01-01',
      totalAssetsCents: 0,
      totalLiabilitiesCents: 0,
      netWorthCents: 0,
    };
    const rate = calculateGrowthRate(zeroStart, snapshots[1]!);
    expect(rate.changeCents).toBe(60000_00);
    expect(rate.changePercent).toBe(0); // Can't calculate % from zero
    expect(rate.annualizedRate).toBe(0);
  });
});

describe('calculatePeriodicGrowthRates', () => {
  it('returns growth rates between consecutive periods', () => {
    const rates = calculatePeriodicGrowthRates(snapshots);
    expect(rates).toHaveLength(3); // 4 snapshots → 3 periods
    expect(rates[0]!.startDate).toBe('2023-01-01');
    expect(rates[0]!.endDate).toBe('2023-06-01');
  });

  it('returns empty for fewer than 2 snapshots', () => {
    expect(calculatePeriodicGrowthRates([])).toHaveLength(0);
    expect(calculatePeriodicGrowthRates([snapshots[0]!])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

describe('calculateMonthlyGrowthRate', () => {
  it('returns positive rate for growing net worth', () => {
    const rate = calculateMonthlyGrowthRate(snapshots);
    expect(rate).toBeGreaterThan(0);
  });

  it('returns 0 for insufficient data', () => {
    expect(calculateMonthlyGrowthRate([])).toBe(0);
    expect(calculateMonthlyGrowthRate([snapshots[0]!])).toBe(0);
  });
});

describe('projectNetWorth', () => {
  it('projects future net worth based on trend', () => {
    const projection = projectNetWorth(snapshots, 12);
    expect(projection.points).toHaveLength(12);
    expect(projection.monthlyGrowthRate).toBeGreaterThan(0);

    // Each projected point should grow
    for (let i = 1; i < projection.points.length; i++) {
      expect(projection.points[i]!.netWorthCents).toBeGreaterThan(
        projection.points[i - 1]!.netWorthCents,
      );
    }
  });

  it('returns empty for insufficient data', () => {
    const projection = projectNetWorth([snapshots[0]!], 12);
    expect(projection.points).toHaveLength(0);
    expect(projection.confidence).toBe('low');
  });

  it('returns empty for zero months', () => {
    const projection = projectNetWorth(snapshots, 0);
    expect(projection.points).toHaveLength(0);
  });

  it('assigns confidence based on data points', () => {
    // 4 snapshots → low confidence (< 6)
    const projection = projectNetWorth(snapshots, 6);
    expect(projection.confidence).toBe('low');

    // Build enough snapshots for medium
    const manySnapshots: NetWorthSnapshot[] = [];
    for (let i = 0; i < 12; i++) {
      manySnapshots.push({
        date: `2023-${String(i + 1).padStart(2, '0')}-01`,
        totalAssetsCents: 50000_00 + i * 5000_00,
        totalLiabilitiesCents: 10000_00,
        netWorthCents: 40000_00 + i * 5000_00,
      });
    }
    const medProj = projectNetWorth(manySnapshots, 6);
    expect(medProj.confidence).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// Life event annotation
// ---------------------------------------------------------------------------

describe('annotateLifeEvents', () => {
  it('annotates events with nearest snapshot net worth', () => {
    const events: LifeEventMilestone[] = [
      {
        id: 'e1',
        type: 'marriage',
        label: 'Got Married',
        date: '2023-07-01',
        netWorthAtEventCents: null,
      },
    ];

    const annotated = annotateLifeEvents(events, snapshots);
    expect(annotated[0]!.netWorthAtEventCents).not.toBeNull();
    // Closest to July 2023 is June 2023 snapshot (60K)
    expect(annotated[0]!.netWorthAtEventCents).toBe(60000_00);
  });

  it('preserves already-annotated events', () => {
    const events: LifeEventMilestone[] = [
      {
        id: 'e1',
        type: 'home-purchase',
        label: 'Bought House',
        date: '2023-05-01',
        netWorthAtEventCents: 55000_00,
      },
    ];

    const annotated = annotateLifeEvents(events, snapshots);
    expect(annotated[0]!.netWorthAtEventCents).toBe(55000_00);
  });

  it('handles empty snapshots', () => {
    const events: LifeEventMilestone[] = [
      { id: 'e1', type: 'other', label: 'Event', date: '2023-01-01', netWorthAtEventCents: null },
    ];

    const annotated = annotateLifeEvents(events, []);
    expect(annotated[0]!.netWorthAtEventCents).toBeNull();
  });
});
