// SPDX-License-Identifier: BUSL-1.1

/**
 * Calendar heatmap spending data engine.
 *
 * Aggregates daily spending into a calendar grid structure,
 * computes intensity levels, detects spending streaks,
 * and supports year-over-year comparisons.
 *
 * All monetary values are integer cents. All functions are pure.
 *
 * References: issues #1579, #1741
 */

import type {
  HeatmapCell,
  HeatmapWeek,
  HeatmapData,
  MonthlyTotal,
  SpendingStreak,
  IntensityBucket,
  YearOverYearDay,
} from './types';
import { bankersRound } from './budget-tags';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date at UTC midnight.
 * @param dateStr - ISO date string.
 * @returns Date object.
 */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Format a Date to YYYY-MM-DD.
 * @param date - Date object.
 * @returns ISO date string.
 */
function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get ISO week number for a date.
 * @param date - Date object.
 * @returns Week number (1–53).
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Generate all dates from start to end (inclusive).
 * @param startDate - Start date (YYYY-MM-DD).
 * @param endDate - End date (YYYY-MM-DD).
 * @returns Array of ISO date strings.
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = parseDate(startDate);
  const end = parseDate(endDate);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Intensity / bucket
// ---------------------------------------------------------------------------

/**
 * Map a spending intensity ratio to a color bucket.
 *
 * Thresholds:
 * - none: 0 (no spending)
 * - low: 0 < intensity ≤ 0.5 (below half the average)
 * - medium: 0.5 < intensity ≤ 1.5 (around the average)
 * - high: 1.5 < intensity ≤ 3.0 (well above average)
 * - extreme: > 3.0 (triple the average or more)
 *
 * @param intensity - Ratio of daily spend to daily average.
 * @returns IntensityBucket label.
 */
export function intensityToBucket(intensity: number): IntensityBucket {
  if (intensity <= 0) return 'none';
  if (intensity <= 0.5) return 'low';
  if (intensity <= 1.5) return 'medium';
  if (intensity <= 3.0) return 'high';
  return 'extreme';
}

// ---------------------------------------------------------------------------
// Daily aggregation
// ---------------------------------------------------------------------------

/** Minimal transaction input for heatmap computation. */
export interface HeatmapTransaction {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Amount in cents (positive = spending). */
  readonly amountCents: number;
}

/**
 * Aggregate transactions into daily spending totals.
 *
 * @param transactions - Array of transactions with date and amountCents.
 * @param startDate - Range start (YYYY-MM-DD).
 * @param endDate - Range end (YYYY-MM-DD).
 * @returns Map from date string to {totalCents, count}.
 */
export function aggregateDaily(
  transactions: readonly HeatmapTransaction[],
  startDate: string,
  endDate: string,
): Map<string, { totalCents: number; count: number }> {
  const map = new Map<string, { totalCents: number; count: number }>();

  // Initialize all dates in range
  for (const date of generateDateRange(startDate, endDate)) {
    map.set(date, { totalCents: 0, count: 0 });
  }

  // Aggregate
  for (const tx of transactions) {
    if (tx.date < startDate || tx.date > endDate) continue;
    const entry = map.get(tx.date) ?? { totalCents: 0, count: 0 };
    entry.totalCents += Math.abs(tx.amountCents);
    entry.count += 1;
    map.set(tx.date, entry);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Heatmap cells
// ---------------------------------------------------------------------------

/**
 * Build heatmap cells from daily aggregated data.
 *
 * @param dailyData - Map from date to spending data.
 * @returns Object with cells array and computed daily average.
 */
export function buildHeatmapCells(dailyData: Map<string, { totalCents: number; count: number }>): {
  cells: HeatmapCell[];
  dailyAverageCents: number;
} {
  const entries = [...dailyData.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Compute daily average (only counting days within the range)
  let totalSpending = 0;
  const dayCount = entries.length;
  for (const [, data] of entries) {
    totalSpending += data.totalCents;
  }
  const dailyAverageCents = dayCount > 0 ? bankersRound(totalSpending / dayCount) : 0;

  const cells: HeatmapCell[] = entries.map(([date, data]) => {
    const intensity = dailyAverageCents > 0 ? data.totalCents / dailyAverageCents : 0;
    return {
      date,
      totalCents: data.totalCents,
      intensity: Math.round(intensity * 1000) / 1000,
      bucket: intensityToBucket(intensity),
      transactionCount: data.count,
    };
  });

  return { cells, dailyAverageCents };
}

// ---------------------------------------------------------------------------
// Weekly grouping
// ---------------------------------------------------------------------------

/**
 * Group heatmap cells into weekly rows.
 *
 * Each week has 7 slots (Sunday=0 through Saturday=6).
 * Days outside the range are null.
 *
 * @param cells - Heatmap cells sorted by date.
 * @returns Array of HeatmapWeek objects.
 */
export function groupByWeek(cells: readonly HeatmapCell[]): HeatmapWeek[] {
  if (cells.length === 0) return [];

  const weekMap = new Map<number, { days: (HeatmapCell | null)[]; totalCents: number }>();

  for (const cell of cells) {
    const date = parseDate(cell.date);
    const weekNum = getISOWeekNumber(date);
    const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat

    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, { days: [null, null, null, null, null, null, null], totalCents: 0 });
    }
    const week = weekMap.get(weekNum)!;
    week.days[dayOfWeek] = cell;
    week.totalCents += cell.totalCents;
  }

  return [...weekMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, data]) => ({
      weekNumber,
      days: data.days,
      totalCents: data.totalCents,
    }));
}

// ---------------------------------------------------------------------------
// Monthly totals
// ---------------------------------------------------------------------------

/**
 * Compute monthly spending totals from heatmap cells.
 *
 * @param cells - Heatmap cells.
 * @returns Array of MonthlyTotal sorted chronologically.
 */
export function computeMonthlyTotals(cells: readonly HeatmapCell[]): MonthlyTotal[] {
  const map = new Map<string, { totalCents: number; activeDays: number }>();

  for (const cell of cells) {
    const month = cell.date.slice(0, 7);
    const entry = map.get(month) ?? { totalCents: 0, activeDays: 0 };
    entry.totalCents += cell.totalCents;
    if (cell.transactionCount > 0) entry.activeDays += 1;
    map.set(month, entry);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({
      month,
      totalCents: data.totalCents,
      activeDays: data.activeDays,
    }));
}

// ---------------------------------------------------------------------------
// Streak detection
// ---------------------------------------------------------------------------

/**
 * Detect consecutive spending streaks.
 *
 * - **no_spend**: consecutive days with $0 spending.
 * - **low_spend**: consecutive days below 50% of daily average.
 * - **high_spend**: consecutive days above 200% of daily average.
 *
 * Only streaks of 3+ days are reported.
 *
 * @param cells - Heatmap cells sorted by date.
 * @param dailyAverageCents - The daily average for threshold computation.
 * @param minStreakDays - Minimum streak length to report (default 3).
 * @returns Array of SpendingStreak objects.
 */
export function detectStreaks(
  cells: readonly HeatmapCell[],
  dailyAverageCents: number,
  minStreakDays: number = 3,
): SpendingStreak[] {
  if (cells.length === 0) return [];

  const lowThreshold = dailyAverageCents * 0.5;
  const highThreshold = dailyAverageCents * 2.0;

  type StreakType = SpendingStreak['type'];
  const streaks: SpendingStreak[] = [];

  let currentType: StreakType | null = null;
  let startDate = '';
  let endDate = '';
  let count = 0;

  function classify(cell: HeatmapCell): StreakType | null {
    if (cell.totalCents === 0) return 'no_spend';
    if (cell.totalCents <= lowThreshold) return 'low_spend';
    if (cell.totalCents >= highThreshold) return 'high_spend';
    return null;
  }

  function flush(): void {
    if (currentType !== null && count >= minStreakDays) {
      streaks.push({ type: currentType, startDate, endDate, days: count });
    }
  }

  for (const cell of cells) {
    const type = classify(cell);
    if (type === currentType && type !== null) {
      endDate = cell.date;
      count++;
    } else {
      flush();
      currentType = type;
      startDate = cell.date;
      endDate = cell.date;
      count = 1;
    }
  }
  flush();

  return streaks;
}

// ---------------------------------------------------------------------------
// Year-over-year comparison
// ---------------------------------------------------------------------------

/**
 * Compare spending on each calendar day between two years.
 *
 * @param currentYearCells - Heatmap cells for the current year.
 * @param priorYearCells - Heatmap cells for the prior year.
 * @returns Array of YearOverYearDay comparisons.
 */
export function compareYearOverYear(
  currentYearCells: readonly HeatmapCell[],
  priorYearCells: readonly HeatmapCell[],
): YearOverYearDay[] {
  const currentMap = new Map<string, number>();
  for (const c of currentYearCells) {
    const md = c.date.slice(5); // MM-DD
    currentMap.set(md, (currentMap.get(md) ?? 0) + c.totalCents);
  }

  const priorMap = new Map<string, number>();
  for (const c of priorYearCells) {
    const md = c.date.slice(5);
    priorMap.set(md, (priorMap.get(md) ?? 0) + c.totalCents);
  }

  const allDays = new Set([...currentMap.keys(), ...priorMap.keys()]);
  const result: YearOverYearDay[] = [];

  for (const md of [...allDays].sort()) {
    const current = currentMap.get(md) ?? 0;
    const prior = priorMap.get(md) ?? 0;
    const change = current - prior;
    const changePercent = prior > 0 ? Math.round((change / prior) * 10000) / 100 : null;
    result.push({
      monthDay: md,
      currentYearCents: current,
      priorYearCents: prior,
      changeCents: change,
      changePercent,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build a complete heatmap dataset from transactions over a date range.
 *
 * @param transactions - Transactions with date and amountCents.
 * @param startDate - Start of range (YYYY-MM-DD).
 * @param endDate - End of range (YYYY-MM-DD).
 * @param minStreakDays - Minimum streak length (default 3).
 * @returns Complete HeatmapData.
 */
export function buildHeatmapData(
  transactions: readonly HeatmapTransaction[],
  startDate: string,
  endDate: string,
  minStreakDays: number = 3,
): HeatmapData {
  const daily = aggregateDaily(transactions, startDate, endDate);
  const { cells, dailyAverageCents } = buildHeatmapCells(daily);
  const weeks = groupByWeek(cells);
  const monthlyTotals = computeMonthlyTotals(cells);
  const streaks = detectStreaks(cells, dailyAverageCents, minStreakDays);

  return {
    cells,
    weeks,
    monthlyTotals,
    dailyAverageCents,
    streaks,
  };
}
