// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy marking engine for household transactions.
 *
 * Allows members to mark individual transactions as private, hiding them
 * from other household members. Private transactions are excluded from
 * shared aggregates while still appearing in the owner's personal view.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1782
 */

import type {
  MarkPrivacyInput,
  PrivateTransaction,
  PrivacyLevel,
  TransactionWithAmount,
} from './types';

import type { SyncId } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Privacy marking
// ---------------------------------------------------------------------------

/**
 * Mark a transaction with a privacy level.
 *
 * Creates or updates a privacy marking record. If a marking already exists
 * for the given transaction, the new level replaces it.
 *
 * @param existingMarkings - Current set of privacy markings
 * @param input - The marking to apply
 * @param now - Current timestamp (ISO-8601)
 * @returns Updated array of privacy markings
 */
export function markTransactionPrivacy(
  existingMarkings: readonly PrivateTransaction[],
  input: MarkPrivacyInput,
  now: string,
): PrivateTransaction[] {
  const newMarking: PrivateTransaction = {
    transactionId: input.transactionId,
    memberId: input.memberId,
    privacyLevel: input.privacyLevel,
    markedAt: now,
  };

  const idx = existingMarkings.findIndex(
    (m) => m.transactionId === input.transactionId && m.memberId === input.memberId,
  );

  if (idx >= 0) {
    const result = [...existingMarkings];
    result[idx] = newMarking;
    return result;
  }

  return [...existingMarkings, newMarking];
}

/**
 * Get the privacy level for a specific transaction and member.
 *
 * Returns 'SHARED' if no explicit marking exists (default is shared).
 *
 * @param markings - All privacy markings
 * @param transactionId - Transaction to look up
 * @param memberId - The member who owns the transaction
 * @returns The effective privacy level
 */
export function getPrivacyLevel(
  markings: readonly PrivateTransaction[],
  transactionId: SyncId,
  memberId: SyncId,
): PrivacyLevel {
  const marking = markings.find(
    (m) => m.transactionId === transactionId && m.memberId === memberId,
  );
  return marking?.privacyLevel ?? 'SHARED';
}

/**
 * Filter transactions to only those visible to a specific viewer.
 *
 * A transaction is visible if:
 * - The viewer owns it (always visible to owner), OR
 * - Its privacy level is 'SHARED'
 *
 * @param transactions - All transactions to filter
 * @param markings - Privacy markings
 * @param viewerId - The member viewing the transactions
 * @returns Transactions visible to the viewer
 */
export function filterVisibleTransactions<
  T extends { readonly transactionId: SyncId; readonly memberId: SyncId },
>(transactions: readonly T[], markings: readonly PrivateTransaction[], viewerId: SyncId): T[] {
  return transactions.filter((txn) => {
    // Owner always sees their own transactions
    if (txn.memberId === viewerId) return true;

    const level = getPrivacyLevel(markings, txn.transactionId, txn.memberId);
    return level === 'SHARED';
  });
}

/**
 * Calculate aggregate total excluding private transactions from the shared view.
 *
 * Only includes transactions that are either owned by the viewer or marked
 * as SHARED. Uses Banker's rounding (amounts are already integers, so this
 * is a straightforward sum).
 *
 * @param transactions - All transactions with amounts
 * @param markings - Privacy markings
 * @param viewerId - The member viewing the aggregate
 * @returns Total amount in cents (only shared + own transactions)
 */
export function calculateSharedTotal(
  transactions: readonly TransactionWithAmount[],
  markings: readonly PrivateTransaction[],
  viewerId: SyncId,
): number {
  const visible = filterVisibleTransactions(transactions, markings, viewerId);
  return visible.reduce((sum, txn) => sum + txn.amountCents, 0);
}

/**
 * Get all transactions marked as private by a specific member.
 *
 * @param markings - All privacy markings
 * @param memberId - The member whose private markings to retrieve
 * @returns Privacy markings where level is PRIVATE for this member
 */
export function getPrivateMarkings(
  markings: readonly PrivateTransaction[],
  memberId: SyncId,
): PrivateTransaction[] {
  return markings.filter((m) => m.memberId === memberId && m.privacyLevel === 'PRIVATE');
}

/**
 * Count how many transactions are marked private for a member.
 *
 * @param markings - All privacy markings
 * @param memberId - The member to count for
 * @returns Number of private transactions
 */
export function countPrivateTransactions(
  markings: readonly PrivateTransaction[],
  memberId: SyncId,
): number {
  return getPrivateMarkings(markings, memberId).length;
}
