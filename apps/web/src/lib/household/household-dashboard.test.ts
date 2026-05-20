// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { DashboardAccount, PrivateTransaction, TransactionWithAmount } from './types';
import { buildPermissionMatrix } from './category-permissions';
import {
  buildHouseholdDashboard,
  buildMemberSpendingBreakdown,
  calculateSharedNetWorth,
  calculateTotalSharedSpending,
  getSharedAccounts,
} from './household-dashboard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const CAT_1 = 'cat-food';
const CAT_2 = 'cat-transport';
const NOW = '2025-01-15T10:00:00Z';

const ACCOUNTS: DashboardAccount[] = [
  { accountId: 'acc-1', name: 'Joint Checking', balanceCents: 500_000, isShared: true },
  { accountId: 'acc-2', name: 'Private Savings', balanceCents: 200_000, isShared: false },
  { accountId: 'acc-3', name: 'Joint Savings', balanceCents: 300_000, isShared: true },
];

const TRANSACTIONS: TransactionWithAmount[] = [
  {
    transactionId: 'txn-1',
    memberId: MEMBER_A,
    amountCents: 50_00,
    categoryId: CAT_1,
    date: '2025-01-10',
  },
  {
    transactionId: 'txn-2',
    memberId: MEMBER_B,
    amountCents: 30_00,
    categoryId: CAT_1,
    date: '2025-01-11',
  },
  {
    transactionId: 'txn-3',
    memberId: MEMBER_A,
    amountCents: 20_00,
    categoryId: CAT_2,
    date: '2025-01-12',
  },
  {
    transactionId: 'txn-4',
    memberId: MEMBER_B,
    amountCents: 40_00,
    categoryId: CAT_2,
    date: '2025-01-13',
  },
];

const MEMBER_NAMES = new Map<string, string | null>([
  [MEMBER_A, 'Alice'],
  [MEMBER_B, 'Bob'],
]);

const SHARED_CATEGORIES = [CAT_1, CAT_2];

// All categories visible by default
const EMPTY_MATRIX = buildPermissionMatrix([]);

// ---------------------------------------------------------------------------
// calculateSharedNetWorth
// ---------------------------------------------------------------------------

describe('calculateSharedNetWorth', () => {
  it('sums only shared accounts', () => {
    expect(calculateSharedNetWorth(ACCOUNTS)).toBe(800_000);
  });

  it('returns 0 when no shared accounts exist', () => {
    const privateOnly = ACCOUNTS.map((a) => ({ ...a, isShared: false }));
    expect(calculateSharedNetWorth(privateOnly)).toBe(0);
  });

  it('returns 0 for empty accounts', () => {
    expect(calculateSharedNetWorth([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSharedAccounts
// ---------------------------------------------------------------------------

describe('getSharedAccounts', () => {
  it('filters to shared accounts only', () => {
    const result = getSharedAccounts(ACCOUNTS);
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.isShared)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateTotalSharedSpending
// ---------------------------------------------------------------------------

describe('calculateTotalSharedSpending', () => {
  it('sums spending in shared categories', () => {
    const total = calculateTotalSharedSpending(
      TRANSACTIONS,
      [],
      EMPTY_MATRIX,
      MEMBER_A,
      SHARED_CATEGORIES,
    );
    expect(total).toBe(140_00);
  });

  it('excludes private transactions', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: 'txn-2', memberId: MEMBER_B, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const total = calculateTotalSharedSpending(
      TRANSACTIONS,
      markings,
      EMPTY_MATRIX,
      MEMBER_A,
      SHARED_CATEGORIES,
    );
    expect(total).toBe(110_00);
  });

  it('excludes transactions in non-shared categories', () => {
    const total = calculateTotalSharedSpending(
      TRANSACTIONS,
      [],
      EMPTY_MATRIX,
      MEMBER_A,
      [CAT_1], // only food
    );
    expect(total).toBe(80_00);
  });

  it('returns 0 when all transactions are private', () => {
    const markings: PrivateTransaction[] = TRANSACTIONS.map((t) => ({
      transactionId: t.transactionId,
      memberId: t.memberId,
      privacyLevel: 'PRIVATE' as const,
      markedAt: NOW,
    }));
    // Viewer A still sees own transactions, but A's are private too
    // Actually, owner always sees own, so A sees their own private txns
    // But B's are hidden from A
    const total = calculateTotalSharedSpending(
      TRANSACTIONS,
      markings,
      EMPTY_MATRIX,
      MEMBER_A,
      SHARED_CATEGORIES,
    );
    // A sees own txn-1 (50_00), txn-3 (20_00) = 70_00; B's are hidden
    expect(total).toBe(70_00);
  });
});

// ---------------------------------------------------------------------------
// buildMemberSpendingBreakdown
// ---------------------------------------------------------------------------

describe('buildMemberSpendingBreakdown', () => {
  it('breaks down spending by member and category', () => {
    const result = buildMemberSpendingBreakdown(
      TRANSACTIONS,
      [],
      EMPTY_MATRIX,
      MEMBER_A,
      MEMBER_NAMES,
      SHARED_CATEGORIES,
    );
    expect(result).toHaveLength(2);

    const alice = result.find((m) => m.memberId === MEMBER_A);
    expect(alice?.totalSpentCents).toBe(70_00);
    expect(alice?.memberName).toBe('Alice');
    expect(alice?.byCategory.get(CAT_1)).toBe(50_00);
    expect(alice?.byCategory.get(CAT_2)).toBe(20_00);

    const bob = result.find((m) => m.memberId === MEMBER_B);
    expect(bob?.totalSpentCents).toBe(70_00);
    expect(bob?.memberName).toBe('Bob');
  });

  it('returns empty for single-member household with all private txns', () => {
    const markings: PrivateTransaction[] = TRANSACTIONS.filter((t) => t.memberId === MEMBER_A).map(
      (t) => ({
        transactionId: t.transactionId,
        memberId: t.memberId,
        privacyLevel: 'PRIVATE' as const,
        markedAt: NOW,
      }),
    );
    // B views — A's are hidden, only B's remain
    const result = buildMemberSpendingBreakdown(
      TRANSACTIONS,
      markings,
      EMPTY_MATRIX,
      MEMBER_B,
      MEMBER_NAMES,
      SHARED_CATEGORIES,
    );
    expect(result).toHaveLength(1);
    expect(result[0].memberId).toBe(MEMBER_B);
  });
});

// ---------------------------------------------------------------------------
// buildHouseholdDashboard
// ---------------------------------------------------------------------------

describe('buildHouseholdDashboard', () => {
  it('builds a complete dashboard', () => {
    const dashboard = buildHouseholdDashboard(
      ACCOUNTS,
      TRANSACTIONS,
      [],
      EMPTY_MATRIX,
      MEMBER_A,
      MEMBER_NAMES,
      SHARED_CATEGORIES,
    );

    expect(dashboard.sharedNetWorthCents).toBe(800_000);
    expect(dashboard.sharedAccounts).toHaveLength(2);
    expect(dashboard.totalSharedSpendingCents).toBe(140_00);
    expect(dashboard.memberSpending).toHaveLength(2);
  });

  it('handles empty data', () => {
    const dashboard = buildHouseholdDashboard([], [], [], EMPTY_MATRIX, MEMBER_A, new Map(), []);

    expect(dashboard.sharedNetWorthCents).toBe(0);
    expect(dashboard.sharedAccounts).toHaveLength(0);
    expect(dashboard.totalSharedSpendingCents).toBe(0);
    expect(dashboard.memberSpending).toHaveLength(0);
  });
});
