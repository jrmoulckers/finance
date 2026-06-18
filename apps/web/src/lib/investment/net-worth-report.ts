// SPDX-License-Identifier: BUSL-1.1

/** Net-worth-over-time report helpers for web beta reports (#2243). */

import { computePeriodComparison, type PeriodComparison } from '../analytics/net-worth';

export type NetWorthReportRange = '6M' | '12M' | '24M' | 'YTD' | 'ALL';

export interface NetWorthSnapshot {
  readonly date: string;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly accountClassValues?: readonly NetWorthAccountClassValue[];
}

export interface NetWorthAccountClassValue {
  readonly className: string;
  readonly amountCents: number;
}

export interface NetWorthTimelinePoint {
  readonly month: string;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly netWorthCents: number;
}

export interface NetWorthTimelineMilestone {
  readonly id: string;
  readonly label: string;
  readonly thresholdCents: number;
  readonly reachedMonth: string | null;
}

export interface NetWorthContributionChange {
  readonly className: string;
  readonly startAmountCents: number;
  readonly endAmountCents: number;
  readonly changeCents: number;
}

export interface NetWorthOverTimeReport {
  readonly range: NetWorthReportRange;
  readonly points: readonly NetWorthTimelinePoint[];
  readonly comparison: PeriodComparison | null;
  readonly milestones: readonly NetWorthTimelineMilestone[];
  readonly contributionChanges: readonly NetWorthContributionChange[];
  readonly csv: string;
}

const DEFAULT_MILESTONES: readonly Omit<NetWorthTimelineMilestone, 'reachedMonth'>[] = [
  { id: 'first-10k', label: 'First $10K', thresholdCents: 10_000_00 },
  { id: 'first-100k', label: 'First $100K', thresholdCents: 100_000_00 },
  { id: 'debt-free', label: 'Debt-free', thresholdCents: 0 },
];

function toMonth(date: string): string {
  return date.slice(0, 7);
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + monthNumber;
}

function selectSnapshotsForRange(
  snapshots: readonly NetWorthSnapshot[],
  range: NetWorthReportRange,
): readonly NetWorthSnapshot[] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  if (!last || range === 'ALL') return sorted;

  if (range === 'YTD') {
    const yearPrefix = last.date.slice(0, 4);
    return sorted.filter((snapshot) => snapshot.date.startsWith(yearPrefix));
  }

  const months = Number(range.replace('M', ''));
  const minMonthIndex = monthIndex(toMonth(last.date)) - months + 1;
  return sorted.filter((snapshot) => monthIndex(toMonth(snapshot.date)) >= minMonthIndex);
}

function latestMonthlyPoints(
  snapshots: readonly NetWorthSnapshot[],
): readonly NetWorthTimelinePoint[] {
  const latestByMonth = new Map<string, NetWorthSnapshot>();
  for (const snapshot of snapshots) {
    const month = toMonth(snapshot.date);
    const existing = latestByMonth.get(month);
    if (!existing || snapshot.date > existing.date) latestByMonth.set(month, snapshot);
  }

  return [...latestByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, snapshot]) => ({
      month,
      assetsCents: snapshot.assetsCents,
      liabilitiesCents: Math.max(0, snapshot.liabilitiesCents),
      netWorthCents: snapshot.assetsCents - Math.max(0, snapshot.liabilitiesCents),
    }));
}

function detectTimelineMilestones(
  points: readonly NetWorthTimelinePoint[],
  milestones: readonly Omit<NetWorthTimelineMilestone, 'reachedMonth'>[],
): readonly NetWorthTimelineMilestone[] {
  return milestones.map((milestone) => {
    const reached = points.find((point) =>
      milestone.id === 'debt-free'
        ? point.liabilitiesCents === 0
        : point.netWorthCents >= milestone.thresholdCents,
    );
    return { ...milestone, reachedMonth: reached?.month ?? null };
  });
}

function classMap(snapshot: NetWorthSnapshot | undefined): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const item of snapshot?.accountClassValues ?? []) map.set(item.className, item.amountCents);
  return map;
}

function computeContributionChanges(
  snapshots: readonly NetWorthSnapshot[],
): readonly NetWorthContributionChange[] {
  const first = snapshots[0];
  const last = snapshots.at(-1);
  const start = classMap(first);
  const end = classMap(last);
  const classNames = new Set([...start.keys(), ...end.keys()]);

  return [...classNames]
    .map((className) => {
      const startAmountCents = start.get(className) ?? 0;
      const endAmountCents = end.get(className) ?? 0;
      return {
        className,
        startAmountCents,
        endAmountCents,
        changeCents: endAmountCents - startAmountCents,
      };
    })
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents));
}

export function exportNetWorthTimelineCsv(points: readonly NetWorthTimelinePoint[]): string {
  const rows = ['month,assetsCents,liabilitiesCents,netWorthCents'];
  for (const point of points) {
    rows.push(
      `${point.month},${point.assetsCents},${point.liabilitiesCents},${point.netWorthCents}`,
    );
  }
  return rows.join('\n');
}

export function buildNetWorthOverTimeReport(
  snapshots: readonly NetWorthSnapshot[],
  range: NetWorthReportRange,
  milestones: readonly Omit<NetWorthTimelineMilestone, 'reachedMonth'>[] = DEFAULT_MILESTONES,
): NetWorthOverTimeReport {
  const selectedSnapshots = selectSnapshotsForRange(snapshots, range);
  const points = latestMonthlyPoints(selectedSnapshots);
  const first = points[0];
  const last = points.at(-1);
  const comparison =
    first && last && first !== last
      ? computePeriodComparison(last.netWorthCents, first.netWorthCents, last.month, first.month)
      : null;

  return {
    range,
    points,
    comparison,
    milestones: detectTimelineMilestones(points, milestones),
    contributionChanges: computeContributionChanges(selectedSnapshots),
    csv: exportNetWorthTimelineCsv(points),
  };
}
