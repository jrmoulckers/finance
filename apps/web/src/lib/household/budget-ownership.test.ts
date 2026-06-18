// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildHouseholdBudgetProgress,
  canEditHouseholdBudget,
  canViewHouseholdBudget,
  normalizeHouseholdBudgetMetadata,
  summarizeBudgetOwnership,
  type HouseholdBudgetProgressInput,
} from './budget-ownership';

const ownedBudget: HouseholdBudgetProgressInput = {
  budgetId: 'budget-mine',
  householdId: 'household-1',
  ownerMemberId: 'member-a',
  responsibility: 'OWNER_ONLY',
  visibility: 'PRIVATE',
  participantMemberIds: [],
  lastChangedByMemberId: 'member-a',
  updatedAt: '2025-03-01T00:00:00Z',
  name: 'Personal fun',
  limitCents: 20_000,
  spentCents: 5_000,
};

const sharedBudget: HouseholdBudgetProgressInput = {
  budgetId: 'budget-shared',
  householdId: 'household-1',
  ownerMemberId: null,
  responsibility: 'SHARED',
  visibility: 'HOUSEHOLD',
  participantMemberIds: ['member-a', 'member-b'],
  lastChangedByMemberId: 'member-b',
  updatedAt: '2025-03-02T00:00:00Z',
  name: 'Groceries',
  limitCents: 80_000,
  spentCents: 65_000,
};

describe('normalizeHouseholdBudgetMetadata', () => {
  it('clears owner for shared-responsibility budgets and deduplicates participants', () => {
    const result = normalizeHouseholdBudgetMetadata({
      ...sharedBudget,
      ownerMemberId: 'member-a',
      participantMemberIds: ['member-a', 'member-a', 'member-b'],
    });

    expect(result.ownerMemberId).toBeNull();
    expect(result.participantMemberIds).toEqual(['member-a', 'member-b']);
  });
});

describe('budget permissions', () => {
  it('shows private owner-only budgets only to the owner', () => {
    expect(canViewHouseholdBudget(ownedBudget, { memberId: 'member-a', role: 'MEMBER' })).toBe(
      true,
    );
    expect(canViewHouseholdBudget(ownedBudget, { memberId: 'member-b', role: 'MEMBER' })).toBe(
      false,
    );
  });

  it('allows admins and assigned members to edit visible shared budgets but blocks viewers', () => {
    expect(canEditHouseholdBudget(sharedBudget, { memberId: 'member-c', role: 'ADMIN' })).toBe(
      true,
    );
    expect(canEditHouseholdBudget(sharedBudget, { memberId: 'member-a', role: 'MEMBER' })).toBe(
      true,
    );
    expect(canEditHouseholdBudget(sharedBudget, { memberId: 'member-a', role: 'VIEWER' })).toBe(
      false,
    );
  });
});

describe('buildHouseholdBudgetProgress', () => {
  it('returns progress with edit flags for visible budgets', () => {
    const result = buildHouseholdBudgetProgress([ownedBudget, sharedBudget], {
      memberId: 'member-b',
      role: 'MEMBER',
    });

    expect(result.map((budget) => budget.budgetId)).toEqual(['budget-shared']);
    expect(result[0]).toMatchObject({
      remainingCents: 15_000,
      ownerLabel: 'Shared responsibility',
      canEdit: true,
    });
  });
});

describe('summarizeBudgetOwnership', () => {
  it('counts mine, shared, and hidden private budgets', () => {
    const summary = summarizeBudgetOwnership([ownedBudget, sharedBudget], {
      memberId: 'member-b',
      role: 'MEMBER',
    });

    expect(summary).toEqual({ mine: 0, shared: 1, privateHidden: 1 });
  });
});
