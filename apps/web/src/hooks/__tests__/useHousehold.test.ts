// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildRecurringBillReminders,
  calculateGoalPledgeProgress,
  calculateReconciliationSummary,
  calculateSharedExpenseBalances,
  calculateShoppingBudgetSummary,
  createEqualSharedExpenseSplits,
  simplifySettleUpBalances,
  useHousehold,
} from '../useHousehold';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
  getRandomValues: (arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) arr[i] = i + 1;
    return arr;
  },
});

beforeEach(() => {
  uuidCounter = 0;
  localStorage.clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHousehold', () => {
  it('returns null household when none exists', () => {
    const { result } = renderHook(() => useHousehold());

    expect(result.current.loading).toBe(false);
    expect(result.current.household).toBeNull();
    expect(result.current.members).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('creates a household with the owner as first member', () => {
    const { result } = renderHook(() => useHousehold());

    let household!: ReturnType<typeof result.current.createHousehold>;
    act(() => {
      household = result.current.createHousehold({ name: 'Smith Family' });
    });

    expect(household).not.toBeNull();
    expect(result.current.household?.name).toBe('Smith Family');
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0]?.role).toBe('OWNER');
  });

  it('invites a member with specified role', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test Household' });
    });

    let invitation!: ReturnType<typeof result.current.inviteMember>;
    act(() => {
      invitation = result.current.inviteMember({
        email: 'partner@example.com',
        role: 'ADMIN',
      });
    });

    expect(invitation).not.toBeNull();
    expect(result.current.invitations).toHaveLength(1);
    expect(result.current.invitations[0]?.email).toBe('partner@example.com');
    expect(result.current.invitations[0]?.role).toBe('ADMIN');
    expect(result.current.invitations[0]?.status).toBe('PENDING');
  });

  it('returns null when inviting without a household', () => {
    const { result } = renderHook(() => useHousehold());

    let invitation!: ReturnType<typeof result.current.inviteMember>;
    act(() => {
      invitation = result.current.inviteMember({
        email: 'test@example.com',
        role: 'MEMBER',
      });
    });

    expect(invitation).toBeNull();
    expect(result.current.error).toBe('No household exists. Create one first.');
  });

  it('revokes a pending invitation', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test' });
    });

    act(() => {
      result.current.inviteMember({ email: 'test@example.com', role: 'VIEWER' });
    });

    const invitationId = result.current.invitations[0]?.id;
    expect(invitationId).toBeDefined();

    let revoked: boolean;
    act(() => {
      revoked = result.current.revokeInvitation(invitationId!);
    });

    expect(revoked!).toBe(true);
  });

  it('adds and revokes a trusted helper as a read-only VIEWER member', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test Household' });
    });

    let helper!: ReturnType<typeof result.current.addTrustedHelper>;
    act(() => {
      helper = result.current.addTrustedHelper({
        name: 'Aunt Maria',
        accessMethod: 'READ_ONLY_SUMMARY',
      });
    });

    expect(helper).not.toBeNull();
    expect(helper?.displayName).toBe('Aunt Maria');
    expect(helper?.role).toBe('VIEWER');
    expect(result.current.members).toHaveLength(2);
    expect(result.current.members[1]).toEqual(expect.objectContaining({ role: 'VIEWER' }));
    expect(result.current.checkPermission('VIEWER', 'VIEW_SHARED_ACCOUNTS')).toBe(true);
    expect(result.current.checkPermission('VIEWER', 'ADD_TRANSACTIONS')).toBe(false);
    expect(result.current.checkPermission('VIEWER', 'EDIT_SHARED_ACCOUNTS')).toBe(false);
    expect(result.current.checkPermission('VIEWER', 'MANAGE_ROLES')).toBe(false);

    let removed: boolean;
    act(() => {
      removed = result.current.removeMember(helper!.id);
    });

    expect(removed!).toBe(true);
    expect(result.current.members.some((member) => member.id === helper?.id)).toBe(false);
  });

  it('updates a member role', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test' });
    });

    // The first member is the owner — we test the mechanism
    const memberId = result.current.members[0]?.id;
    expect(memberId).toBeDefined();

    let updated: boolean;
    act(() => {
      updated = result.current.updateMemberRole(memberId!, 'ADMIN');
    });

    expect(updated!).toBe(true);
    expect(result.current.members[0]?.role).toBe('ADMIN');
  });

  it('removes a member', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test' });
    });

    const memberId = result.current.members[0]?.id;

    let removed: boolean;
    act(() => {
      removed = result.current.removeMember(memberId!);
    });

    expect(removed!).toBe(true);
    expect(result.current.members).toHaveLength(0);
  });

  it('sets account sharing mode', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Test' });
    });

    act(() => {
      result.current.setAccountSharing({ accountId: 'acct-1', sharingMode: 'SHARED' });
    });

    expect(result.current.accountSharings).toHaveLength(1);
    expect(result.current.accountSharings[0]?.sharingMode).toBe('SHARED');

    act(() => {
      result.current.setAccountSharing({ accountId: 'acct-1', sharingMode: 'PRIVATE' });
    });

    expect(result.current.accountSharings[0]?.sharingMode).toBe('PRIVATE');
  });

  it('persists household data to localStorage', () => {
    const { result, unmount } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Persistent Family' });
    });

    unmount();

    // Re-mount and check data is restored
    const { result: result2 } = renderHook(() => useHousehold());

    expect(result2.current.household?.name).toBe('Persistent Family');
    expect(result2.current.members).toHaveLength(1);
  });

  it('links and persists a college fund goal for an existing child profile', () => {
    const { result, unmount } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'College Family' });
    });

    let childId!: string;
    act(() => {
      const child = result.current.createChildProfile({
        name: 'Maya',
        age: 12,
        weeklyAllowance: 10,
        allowanceDay: 'friday',
      });
      childId = child!.id;
    });

    act(() => {
      result.current.linkChildCollegeFundGoal({ childId, goalId: 'goal-college-1' });
    });

    expect(result.current.children[0]?.collegeFundGoalId).toBe('goal-college-1');

    unmount();

    const { result: result2 } = renderHook(() => useHousehold());
    expect(result2.current.children[0]?.collegeFundGoalId).toBe('goal-college-1');
  });

  it('checks permissions correctly', () => {
    const { result } = renderHook(() => useHousehold());

    expect(result.current.checkPermission('OWNER', 'MANAGE_MEMBERS')).toBe(true);
    expect(result.current.checkPermission('VIEWER', 'MANAGE_MEMBERS')).toBe(false);
    expect(result.current.checkPermission('MEMBER', 'ADD_TRANSACTIONS')).toBe(true);
    expect(result.current.checkPermission('VIEWER', 'ADD_TRANSACTIONS')).toBe(false);
  });
});

describe('shared expense settlement helpers', () => {
  it('splits equal expenses in cents without losing pennies', () => {
    expect(createEqualSharedExpenseSplits(100, ['alex', 'sam', 'jordan'])).toEqual([
      { memberId: 'alex', amount: 33.34 },
      { memberId: 'sam', amount: 33.33 },
      { memberId: 'jordan', amount: 33.33 },
    ]);
  });

  it('computes net balances from expenses and settlements', () => {
    const expense = {
      id: 'expense-1',
      householdId: 'hh-1',
      description: 'Groceries',
      amount: 90,
      paidByMemberId: 'sam',
      splitMode: 'EQUAL' as const,
      splits: createEqualSharedExpenseSplits(90, ['alex', 'sam', 'jordan']),
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    };

    const balances = calculateSharedExpenseBalances(['alex', 'sam', 'jordan'], [expense], []);
    expect(balances).toEqual([
      expect.objectContaining({ memberId: 'alex', netBalance: -30 }),
      expect.objectContaining({ memberId: 'sam', netBalance: 60 }),
      expect.objectContaining({ memberId: 'jordan', netBalance: -30 }),
    ]);

    const settled = calculateSharedExpenseBalances(
      ['alex', 'sam', 'jordan'],
      [expense],
      [
        {
          id: 'settlement-1',
          householdId: 'hh-1',
          fromMemberId: 'alex',
          toMemberId: 'sam',
          amount: 30,
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-02T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        },
      ],
    );

    expect(settled.find((balance) => balance.memberId === 'alex')?.netBalance).toBe(0);
    expect(settled.find((balance) => balance.memberId === 'sam')?.netBalance).toBe(30);
  });

  it('simplifies settle-up balances with largest debtor to largest creditor greedy matching', () => {
    expect(
      simplifySettleUpBalances([
        { memberId: 'alex', netBalance: -20 },
        { memberId: 'jordan', netBalance: -15 },
        { memberId: 'sam', netBalance: 35 },
      ]),
    ).toEqual([
      { fromMemberId: 'alex', toMemberId: 'sam', amount: 20 },
      { fromMemberId: 'jordan', toMemberId: 'sam', amount: 15 },
    ]);
  });
});

describe('household beta helpers and persistence', () => {
  it('creates recurring bill reminders and marks a cycle paid into shared expenses', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Beta Household' });
    });
    const ownerId = result.current.members[0]!.id;

    act(() => {
      result.current.addTrustedHelper({ name: 'Sam', accessMethod: 'READ_ONLY_SUMMARY' });
    });
    const helperId = result.current.members[1]!.id;

    let billId = '';
    let cycleId = '';
    act(() => {
      const bill = result.current.createRecurringSharedBill({
        name: 'Internet',
        estimatedAmount: 90,
        dueDay: 15,
        cadence: 'MONTHLY',
        splitMemberIds: [ownerId, helperId],
        defaultPayerMemberId: ownerId,
        rotationMode: 'ROUND_ROBIN',
        payerRotationMemberIds: [ownerId, helperId],
      });
      billId = bill!.id;
      cycleId = bill!.cycles[0]!.id;
    });

    expect(buildRecurringBillReminders(result.current.recurringBills)[0]).toEqual(
      expect.objectContaining({ name: 'Internet', payerMemberId: ownerId, amount: 90 }),
    );

    act(() => {
      result.current.markRecurringBillCyclePaid({ billId, cycleId });
    });

    expect(result.current.sharedExpenses[0]).toEqual(
      expect.objectContaining({ description: 'Internet recurring bill', paidByMemberId: ownerId }),
    );
    expect(result.current.recurringBills[0]?.cycles[0]?.status).toBe('PAID');
    expect(result.current.activityEvents.some((event) => event.type === 'BILLS')).toBe(true);
  });

  it('tracks goal pledges, contributions, and catch-up recommendations', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Goal Household' });
    });
    const memberId = result.current.members[0]!.id;

    act(() => {
      result.current.setGoalContributionPledge({
        goalId: 'goal-vacation',
        memberId,
        pledgeType: 'FIXED',
        pledgedAmount: 500,
        cadence: 'MONTHLY',
        nextDueDate: '2025-02-01',
      });
    });
    act(() => {
      result.current.recordGoalContribution({ goalId: 'goal-vacation', memberId, amount: 125 });
    });

    expect(calculateGoalPledgeProgress(result.current.goalPledges, 'goal-vacation')).toEqual(
      expect.objectContaining({ totalPledged: 500, totalContributed: 125, totalRemaining: 375 }),
    );
  });

  it('summarizes shopping trips and can generate a shared expense', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Shopping Household' });
    });
    const memberId = result.current.members[0]!.id;
    let shoppingBudgetId = '';

    act(() => {
      const budget = result.current.createShoppingBudget({
        budgetId: 'budget-groceries',
        name: 'Groceries',
        categoryIds: ['groceries', 'household'],
        monthlyLimit: 600,
      });
      shoppingBudgetId = budget!.id;
    });
    act(() => {
      result.current.logShoppingTrip({
        shoppingBudgetId,
        store: 'Market',
        receiptTotal: 120,
        payerMemberId: memberId,
        allocation: 'SHARED',
        purchasedAt: '2025-01-10T12:00:00Z',
        generateSharedExpense: true,
        splitMemberIds: [memberId],
      });
    });

    const summary = calculateShoppingBudgetSummary(
      result.current.shoppingBudgets[0]!,
      new Date('2025-01-15T12:00:00Z'),
    );
    expect(summary).toEqual(
      expect.objectContaining({ spentThisMonth: 120, remainingAmount: 480, averageTripSize: 120 }),
    );
    expect(result.current.sharedExpenses[0]?.description).toBe('Market shopping trip');
  });

  it('calculates privacy-aware reconciliation true-up suggestions and snapshots a period', () => {
    const { result } = renderHook(() => useHousehold());

    act(() => {
      result.current.createHousehold({ name: 'Reconcile Household' });
    });
    act(() => {
      result.current.addTrustedHelper({ name: 'Sam', accessMethod: 'READ_ONLY_SUMMARY' });
    });
    const [alex, sam] = result.current.members.map((member) => member.id);
    let planId = '';

    act(() => {
      const plan = result.current.setReconciliationPlan({
        name: 'January true-up',
        periodType: 'MONTHLY',
        participantMemberIds: [alex!, sam!],
        obligations: [
          {
            sourceType: 'BUDGET',
            sourceId: 'budget-groceries',
            label: 'Groceries',
            amount: 300,
            memberIds: [alex!, sam!],
            shareMode: 'EQUAL',
            shares: [],
          },
        ],
        contributions: [
          {
            memberId: alex!,
            amount: 250,
            label: 'Groceries aggregate',
            visibility: 'AGGREGATE_ONLY',
          },
          { memberId: sam!, amount: 50, label: 'Shared card', visibility: 'DETAILS_REVEALED' },
        ],
      });
      planId = plan!.id;
    });

    const summary = calculateReconciliationSummary(result.current.reconciliationPlans[0]!);
    expect(summary.trueUpSuggestions).toEqual([
      { fromMemberId: sam, toMemberId: alex, amount: 100 },
    ]);
    expect(summary.memberSummaries[0]?.privacyLabel).toMatch(/aggregate totals only/i);

    act(() => {
      result.current.markReconciliationPeriodReconciled({
        planId,
        periodLabel: 'January 2025',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
    });
    expect(result.current.reconciliationSnapshots[0]?.periodLabel).toBe('January 2025');
  });
});
