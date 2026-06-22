// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for the net worth forward-projection engine.
 *
 * References: issue #2116
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECTION_MONTHS,
  PROJECTION_RANGES,
  deriveMonthlyPaceCents,
  projectNetWorth,
  rangeToHorizonMonths,
  sliceSeriesToRange,
  type NetWorthSeriesPoint,
} from './net-worth-projection';

function makeSeries(values: number[], startIso = '2026-01-31'): NetWorthSeriesPoint[] {
  const base = new Date(`${startIso}T00:00:00.000Z`);
  return values.map((netWorthCents, index) => {
    const date = new Date(base);
    date.setUTCMonth(base.getUTCMonth() + index);
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      netWorthCents,
      dateIso: date.toISOString().slice(0, 10),
    };
  });
}

describe('deriveMonthlyPaceCents', () => {
  it('returns zero for fewer than two points', () => {
    expect(deriveMonthlyPaceCents([])).toBe(0);
    expect(deriveMonthlyPaceCents(makeSeries([100_000]))).toBe(0);
  });

  it('derives a positive pace for a steadily growing series', () => {
    const series = makeSeries([100_000, 150_000, 200_000, 250_000]);
    expect(deriveMonthlyPaceCents(series, 'average')).toBe(50_000);
    expect(deriveMonthlyPaceCents(series, 'regression')).toBe(50_000);
  });

  it('derives a negative pace for a declining series', () => {
    const series = makeSeries([400_000, 300_000, 200_000]);
    expect(deriveMonthlyPaceCents(series, 'average')).toBe(-100_000);
    expect(deriveMonthlyPaceCents(series, 'regression')).toBe(-100_000);
  });

  it('derives a flat pace for a flat series', () => {
    const series = makeSeries([250_000, 250_000, 250_000, 250_000]);
    expect(deriveMonthlyPaceCents(series, 'average')).toBe(0);
    expect(deriveMonthlyPaceCents(series, 'regression')).toBe(0);
  });

  it('regression smooths noise where the average uses only endpoints', () => {
    // Noisy middle: the average uses only first/last (50k/mo), while the
    // least-squares slope fits every point and lands lower (10k/mo).
    const series = makeSeries([100_000, 400_000, 200_000, 100_000, 300_000]);
    expect(deriveMonthlyPaceCents(series, 'average')).toBe(50_000);
    expect(deriveMonthlyPaceCents(series, 'regression')).toBe(10_000);
  });

  it('always returns an integer number of cents', () => {
    const series = makeSeries([0, 100_001, 200_005]);
    const pace = deriveMonthlyPaceCents(series, 'regression');
    expect(Number.isInteger(pace)).toBe(true);
  });
});

describe('projectNetWorth', () => {
  it('guards against empty history', () => {
    const result = projectNetWorth([], { horizonMonths: 6 });
    expect(result.hasProjection).toBe(false);
    expect(result.points).toHaveLength(0);
    expect(result.reason).toMatch(/two months/i);
  });

  it('guards against single-point history', () => {
    const result = projectNetWorth(makeSeries([100_000]), { horizonMonths: 6 });
    expect(result.hasProjection).toBe(false);
    expect(result.startNetWorthCents).toBe(100_000);
    expect(result.reason).toBeTruthy();
  });

  it('projects a growing series forward with integer cents', () => {
    const series = makeSeries([100_000, 150_000, 200_000]);
    const result = projectNetWorth(series, { horizonMonths: 3, method: 'average' });

    expect(result.hasProjection).toBe(true);
    expect(result.monthlyPaceCents).toBe(50_000);
    expect(result.paceDirection).toBe('up');
    expect(result.startNetWorthCents).toBe(200_000);
    expect(result.points.map((point) => point.netWorthCents)).toEqual([250_000, 300_000, 350_000]);
    expect(result.points.map((point) => point.monthOffset)).toEqual([1, 2, 3]);
    expect(result.endNetWorthCents).toBe(350_000);
    result.points.forEach((point) => expect(Number.isInteger(point.netWorthCents)).toBe(true));
  });

  it('projects a declining series downward', () => {
    const series = makeSeries([300_000, 250_000, 200_000]);
    const result = projectNetWorth(series, { horizonMonths: 2, method: 'average' });
    expect(result.paceDirection).toBe('down');
    expect(result.points.map((point) => point.netWorthCents)).toEqual([150_000, 100_000]);
  });

  it('holds a flat series flat', () => {
    const series = makeSeries([250_000, 250_000, 250_000]);
    const result = projectNetWorth(series, { horizonMonths: 3 });
    expect(result.paceDirection).toBe('flat');
    expect(result.points.every((point) => point.netWorthCents === 250_000)).toBe(true);
  });

  it('clamps the horizon to the maximum', () => {
    const series = makeSeries([100_000, 110_000]);
    const result = projectNetWorth(series, { horizonMonths: 999 });
    expect(result.horizonMonths).toBe(MAX_PROJECTION_MONTHS);
    expect(result.points).toHaveLength(MAX_PROJECTION_MONTHS);
  });

  it('produces no projection for a zero or negative horizon', () => {
    const series = makeSeries([100_000, 110_000]);
    expect(projectNetWorth(series, { horizonMonths: 0 }).hasProjection).toBe(false);
    expect(projectNetWorth(series, { horizonMonths: -4 }).hasProjection).toBe(false);
    expect(projectNetWorth(series, { horizonMonths: -4 }).reason).toMatch(/horizon/i);
  });

  it('derives the horizon from a range when none is given', () => {
    const series = makeSeries([100_000, 110_000, 120_000, 130_000, 140_000, 150_000]);
    expect(projectNetWorth(series, { range: '3M' }).points).toHaveLength(3);
    expect(projectNetWorth(series, { range: '6M' }).points).toHaveLength(6);
  });

  it('labels projected points from the basis date when present', () => {
    const series = makeSeries([100_000, 150_000], '2026-05-15');
    const result = projectNetWorth(series, { horizonMonths: 2 });
    // Basis last point is Jun 2026 → projections land in Jul and Aug.
    expect(result.points.map((point) => point.label)).toEqual(['Jul', 'Aug']);
    expect(result.points[0]!.dateIso?.slice(0, 7)).toBe('2026-07');
  });

  it('falls back to relative labels without a basis date', () => {
    const series: NetWorthSeriesPoint[] = [
      { label: 'A', netWorthCents: 100_000 },
      { label: 'B', netWorthCents: 120_000 },
    ];
    const result = projectNetWorth(series, { horizonMonths: 2 });
    expect(result.points.map((point) => point.label)).toEqual(['+1mo', '+2mo']);
    expect(result.points[0]!.dateIso).toBeUndefined();
  });
});

describe('range helpers', () => {
  it('exposes the four ranges in display order', () => {
    expect(PROJECTION_RANGES).toEqual(['3M', '6M', '1Y', 'All']);
  });

  it('slices trailing windows for fixed ranges', () => {
    const series = makeSeries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => n * 100_000));
    expect(sliceSeriesToRange(series, '3M')).toHaveLength(3);
    expect(sliceSeriesToRange(series, '6M')).toHaveLength(6);
    expect(sliceSeriesToRange(series, '1Y')).toHaveLength(8); // fewer than 12 available
    expect(sliceSeriesToRange(series, 'All')).toHaveLength(8);
    expect(sliceSeriesToRange(series, '3M').map((p) => p.netWorthCents)).toEqual([
      600_000, 700_000, 800_000,
    ]);
  });

  it('maps fixed ranges to fixed horizons', () => {
    expect(rangeToHorizonMonths('3M', 5)).toBe(3);
    expect(rangeToHorizonMonths('6M', 5)).toBe(6);
    expect(rangeToHorizonMonths('1Y', 5)).toBe(12);
  });

  it('derives the All horizon from history length within bounds', () => {
    expect(rangeToHorizonMonths('All', 2)).toBe(3); // floor(1) clamped up to 3
    expect(rangeToHorizonMonths('All', 12)).toBe(6);
    expect(rangeToHorizonMonths('All', 1000)).toBe(MAX_PROJECTION_MONTHS);
  });
});
