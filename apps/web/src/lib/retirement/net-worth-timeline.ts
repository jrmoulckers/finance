// SPDX-License-Identifier: BUSL-1.1

/**
 * Net worth timeline with life event milestones and projections.
 *
 * Tracks net worth history over time, marks life events, celebrates
 * achievement milestones, calculates growth rates, and projects
 * future net worth based on historical trends.
 *
 * All monetary values are integer cents. Uses banker's rounding.
 *
 * References: #1745
 */

import type {
  GrowthRate,
  LifeEventMilestone,
  NetWorthMilestone,
  NetWorthProjection,
  NetWorthSnapshot,
} from './types';
import { bankersRound, safeDivide } from './withdrawal-optimizer';

// ---------------------------------------------------------------------------
// Milestone detection
// ---------------------------------------------------------------------------

/** Standard net worth celebration thresholds in cents. */
export const CELEBRATION_THRESHOLDS: readonly {
  cents: number;
  label: string;
}[] = [
  { cents: 0, label: 'Positive Net Worth!' },
  { cents: 10000_00, label: '$10K Net Worth!' },
  { cents: 25000_00, label: '$25K Net Worth!' },
  { cents: 50000_00, label: '$50K Net Worth!' },
  { cents: 100000_00, label: 'First $100K!' },
  { cents: 250000_00, label: 'Quarter Millionaire!' },
  { cents: 500000_00, label: 'Half Millionaire!' },
  { cents: 1000000_00, label: 'Millionaire!' },
  { cents: 2000000_00, label: 'Double Millionaire!' },
  { cents: 5000000_00, label: '$5M Net Worth!' },
  { cents: 10000000_00, label: '$10M Net Worth!' },
];

/**
 * Detect net worth milestones reached from a history of snapshots.
 *
 * Scans the snapshot history to determine when each threshold was first
 * crossed, and whether it has been reached.
 *
 * @param snapshots - Chronologically ordered net worth snapshots.
 * @returns Array of milestone statuses.
 */
export function detectMilestones(
  snapshots: readonly NetWorthSnapshot[],
): readonly NetWorthMilestone[] {
  return CELEBRATION_THRESHOLDS.map(({ cents, label }) => {
    const reachedSnapshot = snapshots.find((s) => s.netWorthCents >= cents);
    return {
      thresholdCents: cents,
      label,
      reached: reachedSnapshot !== undefined,
      reachedDate: reachedSnapshot?.date ?? null,
    };
  });
}

/**
 * Find newly reached milestones by comparing two net worth values.
 *
 * @param previousCents - Previous net worth in cents.
 * @param currentCents - Current net worth in cents.
 * @returns Labels of milestones crossed between previous and current.
 */
export function findNewMilestones(previousCents: number, currentCents: number): readonly string[] {
  return CELEBRATION_THRESHOLDS.filter(
    ({ cents }) => previousCents < cents && currentCents >= cents,
  ).map(({ label }) => label);
}

// ---------------------------------------------------------------------------
// Growth rate calculation
// ---------------------------------------------------------------------------

/**
 * Calculate growth rate between two snapshots.
 *
 * @param start - Starting snapshot.
 * @param end - Ending snapshot.
 * @returns Growth rate details.
 */
export function calculateGrowthRate(start: NetWorthSnapshot, end: NetWorthSnapshot): GrowthRate {
  const changeCents = end.netWorthCents - start.netWorthCents;
  const changePercent =
    start.netWorthCents !== 0
      ? Math.round(safeDivide(changeCents * 10000, Math.abs(start.netWorthCents))) / 10000
      : 0;

  // Calculate annualized rate
  const startDate = new Date(start.date);
  const endDate = new Date(end.date);
  const yearsFraction = safeDivide(
    endDate.getTime() - startDate.getTime(),
    365.25 * 24 * 60 * 60 * 1000,
  );

  let annualizedRate = 0;
  if (yearsFraction > 0 && start.netWorthCents > 0 && end.netWorthCents > 0) {
    annualizedRate =
      Math.round(
        (Math.pow(
          safeDivide(end.netWorthCents, start.netWorthCents),
          safeDivide(1, yearsFraction),
        ) -
          1) *
          10000,
      ) / 10000;
  }

  return {
    startDate: start.date,
    endDate: end.date,
    startCents: start.netWorthCents,
    endCents: end.netWorthCents,
    changeCents,
    changePercent,
    annualizedRate,
  };
}

/**
 * Calculate growth rates between consecutive periods in a snapshot history.
 *
 * @param snapshots - Chronologically ordered snapshots.
 * @returns Array of period-over-period growth rates.
 */
export function calculatePeriodicGrowthRates(
  snapshots: readonly NetWorthSnapshot[],
): readonly GrowthRate[] {
  if (snapshots.length < 2) return [];

  const rates: GrowthRate[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    rates.push(calculateGrowthRate(snapshots[i - 1]!, snapshots[i]!));
  }
  return rates;
}

// ---------------------------------------------------------------------------
// Net worth projection
// ---------------------------------------------------------------------------

/**
 * Calculate average monthly growth rate from snapshot history.
 *
 * @param snapshots - Chronologically ordered snapshots (need at least 2).
 * @returns Average monthly growth rate as a decimal.
 */
export function calculateMonthlyGrowthRate(snapshots: readonly NetWorthSnapshot[]): number {
  if (snapshots.length < 2) return 0;

  const first = snapshots[0]!;
  const last = snapshots[snapshots.length - 1]!;

  if (first.netWorthCents <= 0) return 0;

  const startDate = new Date(first.date);
  const endDate = new Date(last.date);
  const monthsDiff =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());

  if (monthsDiff <= 0) return 0;

  // Monthly compound growth rate: (end/start)^(1/months) - 1
  const ratio = safeDivide(last.netWorthCents, first.netWorthCents);
  if (ratio <= 0) return 0;

  return Math.pow(ratio, safeDivide(1, monthsDiff)) - 1;
}

/**
 * Project future net worth based on historical trend.
 *
 * @param snapshots - Historical snapshots (need at least 2).
 * @param monthsToProject - Number of months to project forward.
 * @returns Projection with monthly data points and confidence level.
 */
export function projectNetWorth(
  snapshots: readonly NetWorthSnapshot[],
  monthsToProject: number,
): NetWorthProjection {
  if (snapshots.length < 2 || monthsToProject <= 0) {
    return {
      points: [],
      monthlyGrowthRate: 0,
      confidence: 'low',
    };
  }

  const monthlyRate = calculateMonthlyGrowthRate(snapshots);
  const lastSnapshot = snapshots[snapshots.length - 1]!;
  const lastDate = new Date(lastSnapshot.date);
  const points: NetWorthSnapshot[] = [];

  for (let month = 1; month <= monthsToProject; month++) {
    const projDate = new Date(lastDate);
    projDate.setMonth(projDate.getMonth() + month);
    const dateStr = projDate.toISOString().slice(0, 10);

    const projectedNet = bankersRound(
      lastSnapshot.netWorthCents * Math.pow(1 + monthlyRate, month),
    );

    // Simplified: project assets and liabilities proportionally
    const ratio =
      lastSnapshot.netWorthCents !== 0 ? safeDivide(projectedNet, lastSnapshot.netWorthCents) : 1;

    points.push({
      date: dateStr,
      totalAssetsCents: bankersRound(lastSnapshot.totalAssetsCents * ratio),
      totalLiabilitiesCents: bankersRound(lastSnapshot.totalLiabilitiesCents * ratio),
      netWorthCents: projectedNet,
    });
  }

  // Confidence based on data points available
  let confidence: 'high' | 'medium' | 'low';
  if (snapshots.length >= 24) {
    confidence = 'high';
  } else if (snapshots.length >= 6) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    points,
    monthlyGrowthRate: Math.round(monthlyRate * 1000000) / 1000000,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Life event mapping
// ---------------------------------------------------------------------------

/**
 * Associate life events with the nearest net worth snapshot.
 *
 * For each life event, finds the closest snapshot by date and attaches
 * the net worth value at that time.
 *
 * @param events - Life events to annotate.
 * @param snapshots - Historical net worth snapshots.
 * @returns Life events with net worth values filled in.
 */
export function annotateLifeEvents(
  events: readonly LifeEventMilestone[],
  snapshots: readonly NetWorthSnapshot[],
): readonly LifeEventMilestone[] {
  if (snapshots.length === 0) return events;

  return events.map((event) => {
    if (event.netWorthAtEventCents !== null) return event;

    const eventDate = new Date(event.date).getTime();
    let closest = snapshots[0]!;
    let closestDiff = Math.abs(new Date(closest.date).getTime() - eventDate);

    for (const snapshot of snapshots) {
      const diff = Math.abs(new Date(snapshot.date).getTime() - eventDate);
      if (diff < closestDiff) {
        closest = snapshot;
        closestDiff = diff;
      }
    }

    return {
      ...event,
      netWorthAtEventCents: closest.netWorthCents,
    };
  });
}
