// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for calendar heatmap spending data engine.
 *
 * References: issues #1579, #1741
 */

import { describe, it, expect } from 'vitest';
import {
  intensityToBucket,
  aggregateDaily,
  buildHeatmapCells,
  groupByWeek,
  computeMonthlyTotals,
  detectStreaks,
  compareYearOverYear,
  buildHeatmapData,
} from './heatmap-data';
import type { HeatmapTransaction } from './heatmap-data';
import type { HeatmapCell } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(date: string, amountCents: number): HeatmapTransaction {
  return { date, amountCents };
}

function makeCell(
  date: string,
  totalCents: number,
  intensity: number = 1,
  count: number = 1,
): HeatmapCell {
  return {
    date,
    totalCents,
    intensity,
    bucket: intensityToBucket(intensity),
    transactionCount: count,
  };
}

// ---------------------------------------------------------------------------
// intensityToBucket
// ---------------------------------------------------------------------------

describe('intensityToBucket', () => {
  it('returns "none" for zero', () => {
    expect(intensityToBucket(0)).toBe('none');
  });

  it('returns "none" for negative', () => {
    expect(intensityToBucket(-1)).toBe('none');
  });

  it('returns "low" for 0.3', () => {
    expect(intensityToBucket(0.3)).toBe('low');
  });

  it('returns "low" for exactly 0.5', () => {
    expect(intensityToBucket(0.5)).toBe('low');
  });

  it('returns "medium" for 1.0', () => {
    expect(intensityToBucket(1.0)).toBe('medium');
  });

  it('returns "medium" for 1.5', () => {
    expect(intensityToBucket(1.5)).toBe('medium');
  });

  it('returns "high" for 2.0', () => {
    expect(intensityToBucket(2.0)).toBe('high');
  });

  it('returns "high" for 3.0', () => {
    expect(intensityToBucket(3.0)).toBe('high');
  });

  it('returns "extreme" for 4.0', () => {
    expect(intensityToBucket(4.0)).toBe('extreme');
  });
});

// ---------------------------------------------------------------------------
// aggregateDaily
// ---------------------------------------------------------------------------

describe('aggregateDaily', () => {
  it('creates entries for all dates in range', () => {
    const result = aggregateDaily([], '2024-01-01', '2024-01-03');
    expect(result.size).toBe(3);
    expect(result.get('2024-01-01')).toEqual({ totalCents: 0, count: 0 });
  });

  it('aggregates transactions by date', () => {
    const txs = [makeTx('2024-01-01', 1000), makeTx('2024-01-01', 2000), makeTx('2024-01-02', 500)];
    const result = aggregateDaily(txs, '2024-01-01', '2024-01-03');

    expect(result.get('2024-01-01')).toEqual({ totalCents: 3000, count: 2 });
    expect(result.get('2024-01-02')).toEqual({ totalCents: 500, count: 1 });
    expect(result.get('2024-01-03')).toEqual({ totalCents: 0, count: 0 });
  });

  it('uses absolute values for negative amounts', () => {
    const txs = [makeTx('2024-01-01', -1500)];
    const result = aggregateDaily(txs, '2024-01-01', '2024-01-01');
    expect(result.get('2024-01-01')?.totalCents).toBe(1500);
  });

  it('ignores transactions outside range', () => {
    const txs = [makeTx('2023-12-31', 1000), makeTx('2024-01-04', 2000)];
    const result = aggregateDaily(txs, '2024-01-01', '2024-01-03');
    for (const [, data] of result) {
      expect(data.totalCents).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildHeatmapCells
// ---------------------------------------------------------------------------

describe('buildHeatmapCells', () => {
  it('computes daily average correctly', () => {
    const daily = new Map([
      ['2024-01-01', { totalCents: 1000, count: 1 }],
      ['2024-01-02', { totalCents: 3000, count: 2 }],
    ]);
    const { cells, dailyAverageCents } = buildHeatmapCells(daily);

    expect(dailyAverageCents).toBe(2000); // (1000+3000)/2
    expect(cells).toHaveLength(2);
  });

  it('assigns intensity relative to average', () => {
    const daily = new Map([
      ['2024-01-01', { totalCents: 1000, count: 1 }],
      ['2024-01-02', { totalCents: 3000, count: 1 }],
    ]);
    const { cells } = buildHeatmapCells(daily);

    // avg = 2000. Day 1: 1000/2000 = 0.5, Day 2: 3000/2000 = 1.5
    expect(cells[0].intensity).toBe(0.5);
    expect(cells[0].bucket).toBe('low');
    expect(cells[1].intensity).toBe(1.5);
    expect(cells[1].bucket).toBe('medium');
  });

  it('handles empty map', () => {
    const { cells, dailyAverageCents } = buildHeatmapCells(new Map());
    expect(cells).toHaveLength(0);
    expect(dailyAverageCents).toBe(0);
  });

  it('handles all-zero spending', () => {
    const daily = new Map([
      ['2024-01-01', { totalCents: 0, count: 0 }],
      ['2024-01-02', { totalCents: 0, count: 0 }],
    ]);
    const { cells } = buildHeatmapCells(daily);
    expect(cells.every((c) => c.bucket === 'none')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// groupByWeek
// ---------------------------------------------------------------------------

describe('groupByWeek', () => {
  it('returns empty for no cells', () => {
    expect(groupByWeek([])).toEqual([]);
  });

  it('groups cells by week', () => {
    // 2024-01-01 is a Monday
    const cells = [
      makeCell('2024-01-01', 1000),
      makeCell('2024-01-02', 2000),
      makeCell('2024-01-08', 3000), // next week
    ];
    const weeks = groupByWeek(cells);
    expect(weeks.length).toBeGreaterThanOrEqual(2);
  });

  it('computes weekly totals', () => {
    const cells = [makeCell('2024-01-01', 1000), makeCell('2024-01-02', 2000)];
    const weeks = groupByWeek(cells);
    const week = weeks[0];
    expect(week.totalCents).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// computeMonthlyTotals
// ---------------------------------------------------------------------------

describe('computeMonthlyTotals', () => {
  it('returns empty for no cells', () => {
    expect(computeMonthlyTotals([])).toEqual([]);
  });

  it('aggregates by month', () => {
    const cells = [
      makeCell('2024-01-05', 1000),
      makeCell('2024-01-15', 2000),
      makeCell('2024-02-01', 3000),
    ];
    const result = computeMonthlyTotals(cells);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ month: '2024-01', totalCents: 3000, activeDays: 2 });
    expect(result[1]).toEqual({ month: '2024-02', totalCents: 3000, activeDays: 1 });
  });

  it('counts only active days (with transactions)', () => {
    const cells = [
      makeCell('2024-01-01', 0, 0, 0), // no txs
      makeCell('2024-01-02', 500, 1, 2),
    ];
    const result = computeMonthlyTotals(cells);
    expect(result[0].activeDays).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// detectStreaks
// ---------------------------------------------------------------------------

describe('detectStreaks', () => {
  it('returns empty for no cells', () => {
    expect(detectStreaks([], 1000)).toEqual([]);
  });

  it('detects no-spend streaks', () => {
    const cells: HeatmapCell[] = [
      makeCell('2024-01-01', 0, 0, 0),
      makeCell('2024-01-02', 0, 0, 0),
      makeCell('2024-01-03', 0, 0, 0),
      makeCell('2024-01-04', 5000),
    ];
    const streaks = detectStreaks(cells, 1000, 3);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].type).toBe('no_spend');
    expect(streaks[0].days).toBe(3);
    expect(streaks[0].startDate).toBe('2024-01-01');
    expect(streaks[0].endDate).toBe('2024-01-03');
  });

  it('detects high-spend streaks', () => {
    const avg = 1000;
    const cells: HeatmapCell[] = [
      makeCell('2024-01-01', 2500, 2.5, 3),
      makeCell('2024-01-02', 3000, 3.0, 2),
      makeCell('2024-01-03', 2000, 2.0, 1),
      makeCell('2024-01-04', 500, 0.5, 1),
    ];
    const streaks = detectStreaks(cells, avg, 3);
    expect(streaks).toHaveLength(1);
    expect(streaks[0].type).toBe('high_spend');
    expect(streaks[0].days).toBe(3);
  });

  it('respects minimum streak length', () => {
    const cells: HeatmapCell[] = [
      makeCell('2024-01-01', 0, 0, 0),
      makeCell('2024-01-02', 0, 0, 0),
      makeCell('2024-01-03', 1000),
    ];
    const streaks = detectStreaks(cells, 1000, 3);
    expect(streaks).toHaveLength(0); // only 2 days
  });
});

// ---------------------------------------------------------------------------
// compareYearOverYear
// ---------------------------------------------------------------------------

describe('compareYearOverYear', () => {
  it('returns empty for no data', () => {
    expect(compareYearOverYear([], [])).toEqual([]);
  });

  it('computes year-over-year changes', () => {
    const current = [makeCell('2024-03-15', 5000)];
    const prior = [makeCell('2023-03-15', 3000)];
    const result = compareYearOverYear(current, prior);

    expect(result).toHaveLength(1);
    expect(result[0].monthDay).toBe('03-15');
    expect(result[0].currentYearCents).toBe(5000);
    expect(result[0].priorYearCents).toBe(3000);
    expect(result[0].changeCents).toBe(2000);
    expect(result[0].changePercent).toBeCloseTo(66.67, 1);
  });

  it('returns null changePercent when prior is zero', () => {
    const current = [makeCell('2024-06-01', 1000)];
    const result = compareYearOverYear(current, []);
    expect(result[0].changePercent).toBeNull();
  });

  it('includes days present in only one year', () => {
    const current = [makeCell('2024-01-01', 100)];
    const prior = [makeCell('2023-02-01', 200)];
    const result = compareYearOverYear(current, prior);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildHeatmapData (integration)
// ---------------------------------------------------------------------------

describe('buildHeatmapData', () => {
  it('builds complete heatmap from transactions', () => {
    const txs: HeatmapTransaction[] = [
      makeTx('2024-01-01', 1000),
      makeTx('2024-01-01', 2000),
      makeTx('2024-01-02', 500),
      makeTx('2024-01-03', 0),
      makeTx('2024-01-04', 1500),
      makeTx('2024-01-05', 0),
    ];

    const result = buildHeatmapData(txs, '2024-01-01', '2024-01-05');

    expect(result.cells).toHaveLength(5);
    expect(result.dailyAverageCents).toBeGreaterThan(0);
    expect(result.monthlyTotals).toHaveLength(1);
    expect(result.monthlyTotals[0].month).toBe('2024-01');
    expect(result.weeks.length).toBeGreaterThan(0);
  });

  it('handles empty transactions', () => {
    const result = buildHeatmapData([], '2024-01-01', '2024-01-07');
    expect(result.cells).toHaveLength(7);
    expect(result.dailyAverageCents).toBe(0);
    expect(result.cells.every((c) => c.bucket === 'none')).toBe(true);
  });

  it('uses integer cents throughout', () => {
    const txs = [makeTx('2024-01-01', 333), makeTx('2024-01-02', 667)];
    const result = buildHeatmapData(txs, '2024-01-01', '2024-01-02');
    expect(Number.isInteger(result.dailyAverageCents)).toBe(true);
  });
});
