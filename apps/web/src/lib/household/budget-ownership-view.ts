// SPDX-License-Identifier: BUSL-1.1

import type {
  HouseholdBudgetMemberContext,
  HouseholdBudgetProgress,
  HouseholdBudgetProgressInput,
} from './budget-ownership';
import { buildHouseholdBudgetProgress } from './budget-ownership';

export type HouseholdBudgetFilter = 'all' | 'mine' | 'shared';

export interface HouseholdBudgetMemberLabel {
  readonly memberId: string;
  readonly displayName: string;
}

export interface HouseholdBudgetPageRow extends HouseholdBudgetProgress {
  readonly indicatorLabel: string;
  readonly lastChangedLabel: string;
  readonly filterBuckets: readonly HouseholdBudgetFilter[];
}

export function buildHouseholdBudgetPageRows(
  budgets: readonly HouseholdBudgetProgressInput[],
  viewer: HouseholdBudgetMemberContext,
  members: readonly HouseholdBudgetMemberLabel[] = [],
): readonly HouseholdBudgetPageRow[] {
  const memberNames = new Map(members.map((member) => [member.memberId, member.displayName]));

  return buildHouseholdBudgetProgress(budgets, viewer).map((budget) => {
    const mine = budget.ownerMemberId === viewer.memberId || budget.participantMemberIds.includes(viewer.memberId);
    const filterBuckets: HouseholdBudgetFilter[] = ['all'];
    if (mine) filterBuckets.push('mine');
    if (budget.responsibility === 'SHARED') filterBuckets.push('shared');

    return {
      ...budget,
      indicatorLabel: budget.responsibility === 'SHARED'
        ? 'Shared household budget'
        : `Owner-only budget${budget.ownerMemberId === viewer.memberId ? ' you own' : ''}`,
      lastChangedLabel: formatLastChangedLabel(budget.lastChangedByMemberId, memberNames),
      filterBuckets,
    };
  });
}

export function filterHouseholdBudgetRows(
  rows: readonly HouseholdBudgetPageRow[],
  filter: HouseholdBudgetFilter,
): readonly HouseholdBudgetPageRow[] {
  return rows.filter((row) => row.filterBuckets.includes(filter));
}

export function getHouseholdBudgetEditControlState(row: HouseholdBudgetPageRow): {
  readonly disabled: boolean;
  readonly reason: string | null;
} {
  if (row.canEdit) return { disabled: false, reason: null };
  return {
    disabled: true,
    reason: row.responsibility === 'SHARED'
      ? 'Only household members with edit permission can change this shared budget.'
      : 'Only the owner or household admin can change this budget.',
  };
}

function formatLastChangedLabel(
  memberId: string | null,
  memberNames: ReadonlyMap<string, string>,
): string {
  if (memberId === null) return 'Last changed locally';
  return `Last changed by ${memberNames.get(memberId) ?? 'a household member'}`;
}
