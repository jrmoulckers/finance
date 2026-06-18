// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { HouseholdBudgetProgressInput } from './budget-ownership';
import {
  buildHouseholdBudgetPageRows,
  filterHouseholdBudgetRows,
  getHouseholdBudgetEditControlState,
} from './budget-ownership-view';

const budgets: HouseholdBudgetProgressInput[] = [
  {
    budgetId: 'mine',
    householdId: 'household-1',
    ownerMemberId: 'member-a',
    responsibility: 'OWNER_ONLY',
    visibility: 'PRIVATE',
    participantMemberIds: [],
    lastChangedByMemberId: 'member-a',
    updatedAt: '2025-03-01T00:00:00Z',
    name: 'Personal',
    limitCents: 20_000,
    spentCents: 5_000,
  },
  {
    budgetId: 'shared',
    householdId: 'household-1',
    ownerMemberId: null,
    responsibility: 'SHARED',
    visibility: 'HOUSEHOLD',
    participantMemberIds: ['member-a', 'member-b'],
    lastChangedByMemberId: 'member-b',
    updatedAt: '2025-03-02T00:00:00Z',
    name: 'Groceries',
    limitCents: 80_000,
    spentCents: 70_000,
  },
  {
    budgetId: 'demo-local',
    householdId: 'household-1',
    ownerMemberId: null,
    responsibility: 'SHARED',
    visibility: 'HOUSEHOLD',
    participantMemberIds: [],
    lastChangedByMemberId: null,
    updatedAt: '2025-03-03T00:00:00Z',
    name: 'Demo fallback',
    limitCents: 50_000,
    spentCents: 10_000,
  },
];

describe('household budget page rows', () => {
  it('builds owner/shared indicators, last-changed labels, and fallback local metadata', () => {
    const rows = buildHouseholdBudgetPageRows(budgets, { memberId: 'member-a', role: 'MEMBER' }, [
      { memberId: 'member-a', displayName: 'Alex' },
      { memberId: 'member-b', displayName: 'Blake' },
    ]);

    expect(rows.map((row) => row.budgetId)).toEqual(['mine', 'shared', 'demo-local']);
    expect(rows[0]).toMatchObject({
      indicatorLabel: 'Owner-only budget you own',
      lastChangedLabel: 'Last changed by Alex',
    });
    expect(rows[1]).toMatchObject({
      indicatorLabel: 'Shared household budget',
      lastChangedLabel: 'Last changed by Blake',
    });
    expect(rows[2].lastChangedLabel).toBe('Last changed locally');
  });

  it('filters all, mine, and shared rows for Budgets page tabs', () => {
    const rows = buildHouseholdBudgetPageRows(budgets, { memberId: 'member-a', role: 'MEMBER' });

    expect(filterHouseholdBudgetRows(rows, 'all').map((row) => row.budgetId)).toEqual([
      'mine',
      'shared',
      'demo-local',
    ]);
    expect(filterHouseholdBudgetRows(rows, 'mine').map((row) => row.budgetId)).toEqual([
      'mine',
      'shared',
    ]);
    expect(filterHouseholdBudgetRows(rows, 'shared').map((row) => row.budgetId)).toEqual([
      'shared',
      'demo-local',
    ]);
  });

  it('explains disabled edit controls for viewer role', () => {
    const [row] = buildHouseholdBudgetPageRows([budgets[1]], {
      memberId: 'member-a',
      role: 'VIEWER',
    });

    expect(getHouseholdBudgetEditControlState(row)).toEqual({
      disabled: true,
      reason: 'Only household members with edit permission can change this shared budget.',
    });
  });
});
