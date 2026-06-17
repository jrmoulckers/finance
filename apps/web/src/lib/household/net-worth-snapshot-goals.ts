// SPDX-License-Identifier: BUSL-1.1

import type { NetWorthSnapshot, NetWorthVisibility } from './net-worth-rollup';

/** Monthly household net-worth snapshots and privacy-preserving shared-goal comparisons (#2683). */

export interface SharedNetWorthGoal {
  readonly goalId: string;
  readonly label: string;
  readonly targetNetWorthCents: number;
}

export interface MajorLiabilityComparisonInput {
  readonly liabilityId: string;
  readonly label: string;
  readonly balanceCents: number;
  readonly visibility: Exclude<NetWorthVisibility, 'EXCLUDED'>;
}

export interface NetWorthGoalComparisonRow {
  readonly id: string;
  readonly label: string;
  readonly currentNetWorthCents: number;
  readonly targetCents: number;
  readonly gapCents: number;
  readonly percentComplete: number;
  readonly privacyCopy: string;
}

export interface NetWorthLiabilityComparisonRow {
  readonly id: string;
  readonly label: string;
  readonly balanceCents: number;
  readonly netWorthAfterPayoffCents: number;
  readonly privacyCopy: string;
}

export interface NetWorthSnapshotTrendCopy {
  readonly headline: string;
  readonly detail: string;
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

export function upsertMonthlyNetWorthSnapshot(
  existing: readonly NetWorthSnapshot[],
  snapshot: NetWorthSnapshot,
): readonly NetWorthSnapshot[] {
  return [
    ...existing.filter(
      (item) => !(item.householdId === snapshot.householdId && item.month === snapshot.month),
    ),
    {
      householdId: snapshot.householdId,
      month: snapshot.month,
      assetCents: snapshot.assetCents,
      liabilityCents: snapshot.liabilityCents,
      netWorthCents: snapshot.netWorthCents,
      createdAt: snapshot.createdAt,
    },
  ].sort((a, b) => a.month.localeCompare(b.month));
}

export function compareNetWorthToSharedGoals(
  snapshot: NetWorthSnapshot,
  goals: readonly SharedNetWorthGoal[],
): readonly NetWorthGoalComparisonRow[] {
  return goals.map((goal) => ({
    id: goal.goalId,
    label: goal.label,
    currentNetWorthCents: snapshot.netWorthCents,
    targetCents: goal.targetNetWorthCents,
    gapCents: goal.targetNetWorthCents - snapshot.netWorthCents,
    percentComplete:
      goal.targetNetWorthCents > 0 ? roundPercent((snapshot.netWorthCents / goal.targetNetWorthCents) * 100) : 0,
    privacyCopy: 'Uses household-level monthly totals only; account names and owner attribution are not included.',
  }));
}

export function compareNetWorthToMajorLiabilities(
  snapshot: NetWorthSnapshot,
  liabilities: readonly MajorLiabilityComparisonInput[],
): readonly NetWorthLiabilityComparisonRow[] {
  return liabilities.map((liability) => ({
    id: liability.liabilityId,
    label: liability.visibility === 'DETAILED' ? liability.label : 'Redacted household liability',
    balanceCents: Math.abs(Math.round(liability.balanceCents)),
    netWorthAfterPayoffCents: snapshot.netWorthCents + Math.abs(Math.round(liability.balanceCents)),
    privacyCopy:
      liability.visibility === 'DETAILED'
        ? 'Detailed liability labels are visible in this household view.'
        : 'Aggregate-only liability names stay redacted in shared-goal comparisons.',
  }));
}

export function buildNetWorthSnapshotTrendCopy(
  snapshots: readonly NetWorthSnapshot[],
): NetWorthSnapshotTrendCopy {
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const current = sorted.at(-1);
  const previous = sorted.at(-2);
  if (!current) {
    return {
      headline: 'No household net-worth snapshot yet',
      detail: 'Add a monthly snapshot to see household-level trends without account-level details.',
    };
  }
  if (!previous) {
    return {
      headline: `Household net worth snapshot saved for ${current.month}`,
      detail: 'Trend copy uses monthly totals only and does not expose aggregate-only account names.',
    };
  }
  const changeCents = current.netWorthCents - previous.netWorthCents;
  const direction = changeCents >= 0 ? 'increased' : 'decreased';
  return {
    headline: `Household net worth ${direction} since ${previous.month}`,
    detail: `Change is ${Math.abs(changeCents)} cents based on household totals only; private account attribution remains hidden.`,
  };
}
