// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type {
  GoalContributionEntry,
  OffboardingPlan,
  PrivateTransaction,
  ReviewItem,
  TransactionWithAmount,
} from './types';
import {
  buildDepartingContributionSummary,
  calculateDepartingMemberContributions,
  generateSharedHistoryExport,
  reassignReviewItems,
  resolveAccountTransfers,
  splitAccountBalance,
  validateOffboardingPlan,
} from './offboarding';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2025-01-15T10:00:00Z';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const MEMBER_C = 'member-c';
const ACC_1 = 'acc-1';
const ACC_2 = 'acc-2';
const ACC_3 = 'acc-3';
const GOAL_1 = 'goal-1';
const GOAL_2 = 'goal-2';

const TRANSACTIONS: TransactionWithAmount[] = [
  {
    transactionId: 'txn-1',
    memberId: MEMBER_A,
    amountCents: 100_00,
    categoryId: 'cat-1',
    date: '2025-01-01',
  },
  {
    transactionId: 'txn-2',
    memberId: MEMBER_B,
    amountCents: 200_00,
    categoryId: 'cat-1',
    date: '2025-01-05',
  },
  {
    transactionId: 'txn-3',
    memberId: MEMBER_A,
    amountCents: 300_00,
    categoryId: 'cat-2',
    date: '2025-01-10',
  },
  {
    transactionId: 'txn-4',
    memberId: MEMBER_B,
    amountCents: 150_00,
    categoryId: 'cat-2',
    date: '2025-02-01',
  },
];

// ---------------------------------------------------------------------------
// generateSharedHistoryExport
// ---------------------------------------------------------------------------

describe('generateSharedHistoryExport', () => {
  it('generates export with correct counts and totals', () => {
    const result = generateSharedHistoryExport(
      { memberId: MEMBER_A, householdId: 'hh-1', startDate: '2025-01-01', endDate: '2025-01-31' },
      TRANSACTIONS,
      [],
      NOW,
    );
    expect(result.memberId).toBe(MEMBER_A);
    expect(result.transactionCount).toBe(3); // txn-1, txn-2, txn-3 (txn-4 is Feb)
    expect(result.totalAmountCents).toBe(600_00); // |100| + |200| + |300|
    expect(result.exportedAt).toBe(NOW);
  });

  it('excludes private transactions from export', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: 'txn-2', memberId: MEMBER_B, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const result = generateSharedHistoryExport(
      { memberId: MEMBER_A, householdId: 'hh-1', startDate: '2025-01-01', endDate: '2025-01-31' },
      TRANSACTIONS,
      markings,
      NOW,
    );
    // txn-2 is private by B, so A can't see it
    expect(result.transactionCount).toBe(2);
    expect(result.totalAmountCents).toBe(400_00); // |100| + |300|
  });

  it('handles empty transactions', () => {
    const result = generateSharedHistoryExport(
      { memberId: MEMBER_A, householdId: 'hh-1', startDate: '2025-01-01', endDate: '2025-01-31' },
      [],
      [],
      NOW,
    );
    expect(result.transactionCount).toBe(0);
    expect(result.totalAmountCents).toBe(0);
  });

  it('handles date range with no matches', () => {
    const result = generateSharedHistoryExport(
      { memberId: MEMBER_A, householdId: 'hh-1', startDate: '2024-01-01', endDate: '2024-12-31' },
      TRANSACTIONS,
      [],
      NOW,
    );
    expect(result.transactionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateOffboardingPlan
// ---------------------------------------------------------------------------

describe('validateOffboardingPlan', () => {
  const validPlan: OffboardingPlan = {
    departingMemberId: MEMBER_A,
    accountDecisions: [
      { accountId: ACC_1, action: 'TRANSFER', transferTo: MEMBER_B },
      { accountId: ACC_2, action: 'SPLIT', transferTo: null },
    ],
    goalsToUnlink: [GOAL_1],
    reviewItemsToReassign: [],
  };

  it('returns no errors for a valid plan', () => {
    const errors = validateOffboardingPlan(
      validPlan,
      [ACC_1, ACC_2],
      [MEMBER_A, MEMBER_B, MEMBER_C],
    );
    expect(errors).toHaveLength(0);
  });

  it('detects missing account decisions', () => {
    const errors = validateOffboardingPlan(
      validPlan,
      [ACC_1, ACC_2, ACC_3], // ACC_3 has no decision
      [MEMBER_A, MEMBER_B],
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(ACC_3);
  });

  it('detects TRANSFER without target', () => {
    const badPlan: OffboardingPlan = {
      ...validPlan,
      accountDecisions: [{ accountId: ACC_1, action: 'TRANSFER', transferTo: null }],
    };
    const errors = validateOffboardingPlan(badPlan, [ACC_1], [MEMBER_A, MEMBER_B]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('requires a target');
  });

  it('detects transfer to self (departing member)', () => {
    const badPlan: OffboardingPlan = {
      ...validPlan,
      accountDecisions: [{ accountId: ACC_1, action: 'TRANSFER', transferTo: MEMBER_A }],
    };
    const errors = validateOffboardingPlan(badPlan, [ACC_1], [MEMBER_A, MEMBER_B]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('departing member');
  });

  it('detects transfer to non-member', () => {
    const badPlan: OffboardingPlan = {
      ...validPlan,
      accountDecisions: [{ accountId: ACC_1, action: 'TRANSFER', transferTo: 'unknown' }],
    };
    const errors = validateOffboardingPlan(badPlan, [ACC_1], [MEMBER_A, MEMBER_B]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('not a household member');
  });
});

// ---------------------------------------------------------------------------
// splitAccountBalance
// ---------------------------------------------------------------------------

describe('splitAccountBalance', () => {
  it('splits evenly', () => {
    expect(splitAccountBalance(1000_00, 2)).toEqual([500_00, 500_00]);
  });

  it('distributes remainder cents', () => {
    const result = splitAccountBalance(100_01, 3);
    expect(result).toEqual([3334, 3334, 3333]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100_01);
  });

  it('returns full balance for single member', () => {
    expect(splitAccountBalance(500_00, 1)).toEqual([500_00]);
  });

  it('returns empty for zero members', () => {
    expect(splitAccountBalance(500_00, 0)).toEqual([]);
  });

  it('handles zero balance', () => {
    expect(splitAccountBalance(0, 3)).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// resolveAccountTransfers
// ---------------------------------------------------------------------------

describe('resolveAccountTransfers', () => {
  it('maps TRANSFER decisions to new owners', () => {
    const result = resolveAccountTransfers([
      { accountId: ACC_1, action: 'TRANSFER', transferTo: MEMBER_B },
      { accountId: ACC_2, action: 'SPLIT', transferTo: null },
      { accountId: ACC_3, action: 'TRANSFER', transferTo: MEMBER_C },
    ]);
    expect(result.size).toBe(2);
    expect(result.get(ACC_1)).toBe(MEMBER_B);
    expect(result.get(ACC_3)).toBe(MEMBER_C);
  });

  it('returns empty map for no TRANSFER decisions', () => {
    const result = resolveAccountTransfers([
      { accountId: ACC_1, action: 'KEEP', transferTo: null },
    ]);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reassignReviewItems
// ---------------------------------------------------------------------------

describe('reassignReviewItems', () => {
  const items: ReviewItem[] = [
    {
      id: 'r-1',
      transactionId: 'txn-1',
      flaggedBy: MEMBER_B,
      assignedTo: MEMBER_A,
      status: 'PENDING',
      reason: null,
      createdAt: NOW,
      resolvedAt: null,
    },
    {
      id: 'r-2',
      transactionId: 'txn-2',
      flaggedBy: MEMBER_A,
      assignedTo: MEMBER_B,
      status: 'PENDING',
      reason: null,
      createdAt: NOW,
      resolvedAt: null,
    },
  ];

  it('reassigns items from departing member', () => {
    const result = reassignReviewItems(items, MEMBER_A, MEMBER_C);
    expect(result[0].assignedTo).toBe(MEMBER_C); // was assigned to A
    expect(result[1].assignedTo).toBe(MEMBER_B); // not affected
  });

  it('preserves flaggedBy even when departing member flagged it', () => {
    const result = reassignReviewItems(items, MEMBER_A, MEMBER_C);
    expect(result[1].flaggedBy).toBe(MEMBER_A); // unchanged
  });
});

// ---------------------------------------------------------------------------
// calculateDepartingMemberContributions / buildDepartingContributionSummary
// ---------------------------------------------------------------------------

describe('calculateDepartingMemberContributions', () => {
  const entries: GoalContributionEntry[] = [
    { goalId: GOAL_1, memberId: MEMBER_A, amountCents: 300_00, date: '2025-01-01' },
    { goalId: GOAL_1, memberId: MEMBER_B, amountCents: 200_00, date: '2025-01-05' },
    { goalId: GOAL_2, memberId: MEMBER_A, amountCents: 100_00, date: '2025-01-10' },
  ];

  it('sums contributions for departing member across specified goals', () => {
    const total = calculateDepartingMemberContributions(entries, MEMBER_A, [GOAL_1, GOAL_2]);
    expect(total).toBe(400_00);
  });

  it('returns 0 when member has no contributions', () => {
    expect(calculateDepartingMemberContributions(entries, MEMBER_C, [GOAL_1])).toBe(0);
  });
});

describe('buildDepartingContributionSummary', () => {
  const entries: GoalContributionEntry[] = [
    { goalId: GOAL_1, memberId: MEMBER_A, amountCents: 300_00, date: '2025-01-01' },
    { goalId: GOAL_2, memberId: MEMBER_A, amountCents: 100_00, date: '2025-01-10' },
    { goalId: GOAL_1, memberId: MEMBER_A, amountCents: 50_00, date: '2025-01-15' },
  ];

  it('groups contributions by goal', () => {
    const summary = buildDepartingContributionSummary(entries, MEMBER_A, [GOAL_1, GOAL_2]);
    expect(summary.get(GOAL_1)).toBe(350_00);
    expect(summary.get(GOAL_2)).toBe(100_00);
  });

  it('returns empty map for non-contributing member', () => {
    const summary = buildDepartingContributionSummary(entries, MEMBER_B, [GOAL_1]);
    expect(summary.size).toBe(0);
  });
});
