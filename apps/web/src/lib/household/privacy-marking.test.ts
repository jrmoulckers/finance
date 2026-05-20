// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { PrivateTransaction, TransactionWithAmount } from './types';
import {
  calculateSharedTotal,
  countPrivateTransactions,
  filterVisibleTransactions,
  getPrivacyLevel,
  getPrivateMarkings,
  markTransactionPrivacy,
} from './privacy-marking';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2025-01-15T10:00:00Z';
const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const TXN_1 = 'txn-1';
const TXN_2 = 'txn-2';
const TXN_3 = 'txn-3';

function makeTxn(
  transactionId: string,
  memberId: string,
  amountCents: number,
): TransactionWithAmount {
  return { transactionId, memberId, amountCents, categoryId: 'cat-1', date: '2025-01-15' };
}

// ---------------------------------------------------------------------------
// markTransactionPrivacy
// ---------------------------------------------------------------------------

describe('markTransactionPrivacy', () => {
  it('adds a new privacy marking', () => {
    const result = markTransactionPrivacy(
      [],
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE' },
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].privacyLevel).toBe('PRIVATE');
    expect(result[0].transactionId).toBe(TXN_1);
  });

  it('updates an existing marking for the same member + transaction', () => {
    const existing: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const result = markTransactionPrivacy(
      existing,
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'SHARED' },
      '2025-01-16T10:00:00Z',
    );
    expect(result).toHaveLength(1);
    expect(result[0].privacyLevel).toBe('SHARED');
  });

  it('does not affect markings for other members', () => {
    const existing: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const result = markTransactionPrivacy(
      existing,
      { transactionId: TXN_1, memberId: MEMBER_B, privacyLevel: 'PRIVATE' },
      NOW,
    );
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getPrivacyLevel
// ---------------------------------------------------------------------------

describe('getPrivacyLevel', () => {
  it('returns SHARED when no marking exists (default)', () => {
    expect(getPrivacyLevel([], TXN_1, MEMBER_A)).toBe('SHARED');
  });

  it('returns the explicit marking when one exists', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    expect(getPrivacyLevel(markings, TXN_1, MEMBER_A)).toBe('PRIVATE');
  });
});

// ---------------------------------------------------------------------------
// filterVisibleTransactions
// ---------------------------------------------------------------------------

describe('filterVisibleTransactions', () => {
  const transactions = [
    makeTxn(TXN_1, MEMBER_A, 100_00), // A's transaction
    makeTxn(TXN_2, MEMBER_B, 200_00), // B's transaction
    makeTxn(TXN_3, MEMBER_A, 300_00), // A's transaction
  ];

  it('shows all transactions when none are private', () => {
    const result = filterVisibleTransactions(transactions, [], MEMBER_B);
    expect(result).toHaveLength(3);
  });

  it('hides private transactions from other members', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const result = filterVisibleTransactions(transactions, markings, MEMBER_B);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.transactionId)).toEqual([TXN_2, TXN_3]);
  });

  it('always shows own private transactions to the owner', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    const result = filterVisibleTransactions(transactions, markings, MEMBER_A);
    expect(result).toHaveLength(3);
  });

  it('handles all transactions being private', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
      { transactionId: TXN_3, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    // B should only see their own transaction
    const result = filterVisibleTransactions(transactions, markings, MEMBER_B);
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe(TXN_2);
  });
});

// ---------------------------------------------------------------------------
// calculateSharedTotal
// ---------------------------------------------------------------------------

describe('calculateSharedTotal', () => {
  const transactions = [
    makeTxn(TXN_1, MEMBER_A, 100_00),
    makeTxn(TXN_2, MEMBER_B, 200_00),
    makeTxn(TXN_3, MEMBER_A, 300_00),
  ];

  it('sums all transactions when none are private', () => {
    expect(calculateSharedTotal(transactions, [], MEMBER_B)).toBe(600_00);
  });

  it('excludes private transactions from the total', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    expect(calculateSharedTotal(transactions, markings, MEMBER_B)).toBe(500_00);
  });

  it('returns 0 for empty transactions', () => {
    expect(calculateSharedTotal([], [], MEMBER_A)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getPrivateMarkings / countPrivateTransactions
// ---------------------------------------------------------------------------

describe('getPrivateMarkings', () => {
  const markings: PrivateTransaction[] = [
    { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    { transactionId: TXN_2, memberId: MEMBER_A, privacyLevel: 'SHARED', markedAt: NOW },
    { transactionId: TXN_3, memberId: MEMBER_B, privacyLevel: 'PRIVATE', markedAt: NOW },
  ];

  it('returns only private markings for the specified member', () => {
    const result = getPrivateMarkings(markings, MEMBER_A);
    expect(result).toHaveLength(1);
    expect(result[0].transactionId).toBe(TXN_1);
  });
});

describe('countPrivateTransactions', () => {
  it('returns 0 when no private markings exist', () => {
    expect(countPrivateTransactions([], MEMBER_A)).toBe(0);
  });

  it('counts correctly for single-member household', () => {
    const markings: PrivateTransaction[] = [
      { transactionId: TXN_1, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
      { transactionId: TXN_2, memberId: MEMBER_A, privacyLevel: 'PRIVATE', markedAt: NOW },
    ];
    expect(countPrivateTransactions(markings, MEMBER_A)).toBe(2);
  });
});
