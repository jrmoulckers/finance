// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure helpers for household shared budget ownership and visibility.
 *
 * References: issue #2336
 */

export type HouseholdBudgetResponsibility = 'OWNER_ONLY' | 'SHARED';
export type HouseholdBudgetVisibility = 'PRIVATE' | 'HOUSEHOLD';
export type HouseholdBudgetRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface HouseholdBudgetMetadata {
  readonly budgetId: string;
  readonly householdId: string;
  readonly ownerMemberId: string | null;
  readonly responsibility: HouseholdBudgetResponsibility;
  readonly visibility: HouseholdBudgetVisibility;
  readonly participantMemberIds: readonly string[];
  readonly lastChangedByMemberId: string | null;
  readonly updatedAt: string;
}

export interface HouseholdBudgetProgressInput extends HouseholdBudgetMetadata {
  readonly name: string;
  readonly limitCents: number;
  readonly spentCents: number;
}

export interface HouseholdBudgetProgress extends HouseholdBudgetProgressInput {
  readonly remainingCents: number;
  readonly ownerLabel: string;
  readonly canEdit: boolean;
}

export interface HouseholdBudgetMemberContext {
  readonly memberId: string;
  readonly role: HouseholdBudgetRole;
}

export interface BudgetOwnershipSummary {
  readonly mine: number;
  readonly shared: number;
  readonly privateHidden: number;
}

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function normalizeHouseholdBudgetMetadata(
  metadata: HouseholdBudgetMetadata,
): HouseholdBudgetMetadata {
  const participants = uniqueIds(metadata.participantMemberIds);
  const ownerMemberId = metadata.responsibility === 'SHARED' ? null : metadata.ownerMemberId;

  return {
    ...metadata,
    ownerMemberId,
    participantMemberIds: metadata.responsibility === 'SHARED' ? participants : [],
  };
}

export function canViewHouseholdBudget(
  metadata: HouseholdBudgetMetadata,
  viewer: HouseholdBudgetMemberContext,
): boolean {
  if (metadata.visibility === 'HOUSEHOLD') return true;
  if (metadata.ownerMemberId === viewer.memberId) return true;
  return metadata.participantMemberIds.includes(viewer.memberId);
}

export function canEditHouseholdBudget(
  metadata: HouseholdBudgetMetadata,
  viewer: HouseholdBudgetMemberContext,
): boolean {
  if (!canViewHouseholdBudget(metadata, viewer)) return false;
  if (viewer.role === 'OWNER' || viewer.role === 'ADMIN') return true;
  if (viewer.role === 'VIEWER') return false;
  return metadata.ownerMemberId === viewer.memberId || metadata.participantMemberIds.includes(viewer.memberId);
}

export function buildHouseholdBudgetProgress(
  budgets: readonly HouseholdBudgetProgressInput[],
  viewer: HouseholdBudgetMemberContext,
): HouseholdBudgetProgress[] {
  return budgets
    .filter((budget) => canViewHouseholdBudget(budget, viewer))
    .map((budget) => ({
      ...budget,
      remainingCents: Math.round(budget.limitCents) - Math.round(budget.spentCents),
      ownerLabel: budget.responsibility === 'SHARED' ? 'Shared responsibility' : 'Owner assigned',
      canEdit: canEditHouseholdBudget(budget, viewer),
    }));
}

export function summarizeBudgetOwnership(
  budgets: readonly HouseholdBudgetMetadata[],
  viewer: HouseholdBudgetMemberContext,
): BudgetOwnershipSummary {
  return budgets.reduce(
    (summary, budget) => {
      if (!canViewHouseholdBudget(budget, viewer)) {
        return { ...summary, privateHidden: summary.privateHidden + 1 };
      }
      if (budget.responsibility === 'SHARED') {
        return { ...summary, shared: summary.shared + 1 };
      }
      if (budget.ownerMemberId === viewer.memberId) {
        return { ...summary, mine: summary.mine + 1 };
      }
      return summary;
    },
    { mine: 0, shared: 0, privateHidden: 0 },
  );
}
