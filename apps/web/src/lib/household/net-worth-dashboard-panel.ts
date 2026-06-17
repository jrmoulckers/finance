// SPDX-License-Identifier: BUSL-1.1

import type { NetWorthRollup, NetWorthSnapshot } from './net-worth-rollup';
import { buildNetWorthSnapshotTrendCopy, compareNetWorthToSharedGoals } from './net-worth-snapshot-goals';
import type { NetWorthGoalComparisonRow, SharedNetWorthGoal } from './net-worth-snapshot-goals';

/** Household dashboard panel view model for privacy-aware net worth (#2685). */

export interface NetWorthDashboardPanelModel {
  readonly assetCents: number;
  readonly liabilityCents: number;
  readonly netWorthCents: number;
  readonly attributionSummary: string;
  readonly trendHeadline: string;
  readonly trendDetail: string;
  readonly goalRows: readonly NetWorthGoalComparisonRow[];
  readonly privacyNotice: string;
  readonly emptyState: string | null;
}

export function buildNetWorthDashboardPanelModel(params: {
  readonly rollup: NetWorthRollup;
  readonly snapshots: readonly NetWorthSnapshot[];
  readonly sharedGoals?: readonly SharedNetWorthGoal[];
}): NetWorthDashboardPanelModel {
  const trend = buildNetWorthSnapshotTrendCopy(params.snapshots);
  const latestSnapshot = [...params.snapshots].sort((a, b) => a.month.localeCompare(b.month)).at(-1);
  const goalRows = latestSnapshot ? compareNetWorthToSharedGoals(latestSnapshot, params.sharedGoals ?? []) : [];
  const detailedCount = params.rollup.detailedAttributions.length;
  const aggregateCount = params.rollup.aggregateAttributions.length;

  return {
    assetCents: params.rollup.assetCents,
    liabilityCents: params.rollup.liabilityCents,
    netWorthCents: params.rollup.netWorthCents,
    attributionSummary: `${detailedCount} detailed contribution${detailedCount === 1 ? '' : 's'} and ${aggregateCount} redacted aggregate contribution${aggregateCount === 1 ? '' : 's'}.`,
    trendHeadline: trend.headline,
    trendDetail: trend.detail,
    goalRows,
    privacyNotice:
      'Household net worth includes opted-in detailed and aggregate-only accounts. Aggregate-only accounts affect totals without showing names or owners; excluded accounts are omitted.',
    emptyState: params.rollup.assetCents === 0 && params.rollup.liabilityCents === 0 ? 'No opted-in household net-worth accounts yet.' : null,
  };
}
