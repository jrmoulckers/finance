// SPDX-License-Identifier: BUSL-1.1

/** Local-first net-worth report view helpers (#2474, #2475, #2476). */

import type { AssetClassBreakdown, NetWorthDataPoint } from '../analytics/net-worth';
import {
  buildNetWorthOverTimeReport,
  type NetWorthOverTimeReport,
  type NetWorthReportRange,
  type NetWorthSnapshot,
} from './net-worth-report';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NetWorthReportTableRow {
  readonly month: string;
  readonly assetsCents: number;
  readonly liabilitiesCents: number;
  readonly netWorthCents: number;
  readonly changeFromPreviousCents: number | null;
}

export interface NetWorthReportViewModel {
  readonly range: NetWorthReportRange;
  readonly report: NetWorthOverTimeReport;
  readonly tableRows: readonly NetWorthReportTableRow[];
  readonly milestoneMarkers: readonly string[];
  readonly csvFileName: string;
  readonly emptyMessage: string | null;
}

const STORAGE_KEY = 'finance.netWorthReport.snapshots.v1';

export const NET_WORTH_REPORT_RANGES: readonly NetWorthReportRange[] = [
  '6M',
  '12M',
  '24M',
  'YTD',
  'ALL',
];

function isSnapshot(value: unknown): value is NetWorthSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<NetWorthSnapshot>;
  return (
    typeof snapshot.date === 'string' &&
    typeof snapshot.assetsCents === 'number' &&
    typeof snapshot.liabilitiesCents === 'number'
  );
}

export function loadNetWorthSnapshots(storage: StorageLike): readonly NetWorthSnapshot[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSnapshot).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveNetWorthSnapshots(
  storage: StorageLike,
  snapshots: readonly NetWorthSnapshot[],
): readonly NetWorthSnapshot[] {
  const normalized = [...snapshots].filter(isSnapshot).sort((a, b) => a.date.localeCompare(b.date));
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearNetWorthSnapshots(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}

export function snapshotFromCurrentNetWorth(
  current: NetWorthDataPoint,
  assetClasses: readonly AssetClassBreakdown[] = [],
): NetWorthSnapshot {
  return {
    date: current.label,
    assetsCents: current.assets,
    liabilitiesCents: current.liabilities,
    accountClassValues: assetClasses.map((assetClass) => ({
      className: assetClass.className,
      amountCents: assetClass.balance,
    })),
  };
}

export function upsertMonthlyNetWorthSnapshot(
  snapshots: readonly NetWorthSnapshot[],
  nextSnapshot: NetWorthSnapshot,
): readonly NetWorthSnapshot[] {
  const nextMonth = nextSnapshot.date.slice(0, 7);
  const withoutSameMonth = snapshots.filter((snapshot) => snapshot.date.slice(0, 7) !== nextMonth);
  return [...withoutSameMonth, nextSnapshot].sort((a, b) => a.date.localeCompare(b.date));
}

export function persistCurrentNetWorthSnapshot(
  storage: StorageLike,
  current: NetWorthDataPoint,
  assetClasses: readonly AssetClassBreakdown[] = [],
): readonly NetWorthSnapshot[] {
  const snapshots = loadNetWorthSnapshots(storage);
  return saveNetWorthSnapshots(
    storage,
    upsertMonthlyNetWorthSnapshot(snapshots, snapshotFromCurrentNetWorth(current, assetClasses)),
  );
}

function buildRows(report: NetWorthOverTimeReport): readonly NetWorthReportTableRow[] {
  return report.points.map((point, index) => {
    const previous = index > 0 ? report.points[index - 1] : undefined;
    return {
      ...point,
      changeFromPreviousCents: previous ? point.netWorthCents - previous.netWorthCents : null,
    };
  });
}

function buildMarkers(report: NetWorthOverTimeReport): readonly string[] {
  return report.milestones.map((milestone) =>
    milestone.reachedMonth
      ? `${milestone.label} reached in ${milestone.reachedMonth}`
      : `${milestone.label} not reached in selected range`,
  );
}

export function buildNetWorthReportViewModel(
  snapshots: readonly NetWorthSnapshot[],
  range: NetWorthReportRange,
): NetWorthReportViewModel {
  const report = buildNetWorthOverTimeReport(snapshots, range);
  const latestMonth = report.points.at(-1)?.month ?? 'empty';
  return {
    range,
    report,
    tableRows: buildRows(report),
    milestoneMarkers: buildMarkers(report),
    csvFileName: `net-worth-${range.toLowerCase()}-${latestMonth}.csv`,
    emptyMessage:
      report.points.length === 0
        ? 'No monthly net-worth history is available yet. Save a local snapshot to start the report.'
        : null,
  };
}
