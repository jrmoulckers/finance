// SPDX-License-Identifier: BUSL-1.1

/**
 * Household offboarding and shared-history export engine.
 *
 * Handles the departure of a household member: generating shared-history
 * exports, validating offboarding plans, splitting shared accounts,
 * transferring ownership, and archiving household data.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1733
 */

import type { SyncId } from '../../kmp/bridge';
import type {
  AccountOffboardingDecision,
  GoalContributionEntry,
  OffboardingPlan,
  PrivateTransaction,
  ReviewItem,
  SharedHistoryExport,
  SharedHistoryExportInput,
  TransactionWithAmount,
} from './types';
import { filterVisibleTransactions } from './privacy-marking';

// ---------------------------------------------------------------------------
// Shared-history export
// ---------------------------------------------------------------------------

/**
 * Generate a shared-history export for a departing member.
 *
 * Includes only transactions that were shared (visible to the household)
 * within the specified date range. Private transactions are excluded.
 *
 * @param input - Export parameters (member, household, date range)
 * @param transactions - All transactions with amounts
 * @param markings - Privacy markings
 * @param now - Current timestamp (ISO-8601)
 * @returns SharedHistoryExport summary
 */
export function generateSharedHistoryExport(
  input: SharedHistoryExportInput,
  transactions: readonly TransactionWithAmount[],
  markings: readonly PrivateTransaction[],
  now: string,
): SharedHistoryExport {
  // Filter to shared transactions visible to the departing member
  const visible = filterVisibleTransactions(transactions, markings, input.memberId);

  // Filter by date range
  const inRange = visible.filter((txn) => txn.date >= input.startDate && txn.date <= input.endDate);

  const totalAmountCents = inRange.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);

  return {
    memberId: input.memberId,
    startDate: input.startDate,
    endDate: input.endDate,
    transactionCount: inRange.length,
    totalAmountCents,
    exportedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Offboarding plan validation
// ---------------------------------------------------------------------------

/**
 * Validate an offboarding plan for completeness and correctness.
 *
 * Checks that:
 * - Every shared account has a decision
 * - TRANSFER decisions have a valid target member
 * - The departing member is not transferring to themselves
 *
 * @param plan - The offboarding plan to validate
 * @param sharedAccountIds - IDs of all shared accounts
 * @param householdMemberIds - IDs of all current household members
 * @returns Array of validation error messages (empty if valid)
 */
export function validateOffboardingPlan(
  plan: OffboardingPlan,
  sharedAccountIds: readonly SyncId[],
  householdMemberIds: readonly SyncId[],
): string[] {
  const errors: string[] = [];

  // Check all shared accounts have decisions
  const coveredAccounts = new Set(plan.accountDecisions.map((d) => d.accountId));
  for (const accountId of sharedAccountIds) {
    if (!coveredAccounts.has(accountId)) {
      errors.push(`Missing decision for shared account ${accountId}`);
    }
  }

  // Validate each decision
  for (const decision of plan.accountDecisions) {
    if (decision.action === 'TRANSFER') {
      if (!decision.transferTo) {
        errors.push(`TRANSFER decision for account ${decision.accountId} requires a target member`);
      } else if (decision.transferTo === plan.departingMemberId) {
        errors.push(`Cannot transfer account ${decision.accountId} to the departing member`);
      } else if (!householdMemberIds.includes(decision.transferTo)) {
        errors.push(
          `Transfer target ${decision.transferTo} for account ${decision.accountId} is not a household member`,
        );
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Account splitting
// ---------------------------------------------------------------------------

/**
 * Calculate how a shared account balance should be split.
 *
 * Divides the balance evenly among the specified members. Remainder
 * cents are distributed one-at-a-time to ensure the total matches.
 *
 * @param balanceCents - Current account balance in cents
 * @param memberCount - Number of members to split among
 * @returns Array of split amounts in cents (one per member)
 */
export function splitAccountBalance(balanceCents: number, memberCount: number): number[] {
  if (memberCount <= 0) return [];
  if (memberCount === 1) return [balanceCents];

  const baseShare = Math.floor(balanceCents / memberCount);
  const remainder = balanceCents - baseShare * memberCount;

  return Array.from({ length: memberCount }, (_, i) => baseShare + (i < remainder ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Ownership transfer
// ---------------------------------------------------------------------------

/**
 * Apply account transfer decisions from an offboarding plan.
 *
 * Returns the new owner mapping for transferred accounts.
 *
 * @param decisions - Account offboarding decisions
 * @returns Map of accountId to new owner memberId (only for TRANSFER actions)
 */
export function resolveAccountTransfers(
  decisions: readonly AccountOffboardingDecision[],
): Map<SyncId, SyncId> {
  const transfers = new Map<SyncId, SyncId>();
  for (const decision of decisions) {
    if (decision.action === 'TRANSFER' && decision.transferTo) {
      transfers.set(decision.accountId, decision.transferTo);
    }
  }
  return transfers;
}

// ---------------------------------------------------------------------------
// Review item reassignment
// ---------------------------------------------------------------------------

/**
 * Reassign review items from a departing member to another member.
 *
 * Only reassigns items that are assigned to the departing member.
 * Items flagged by the departing member keep their original flaggedBy.
 *
 * @param items - All review items
 * @param departingMemberId - The member who is leaving
 * @param newAssigneeId - The member who will take over
 * @returns Updated review items
 */
export function reassignReviewItems(
  items: readonly ReviewItem[],
  departingMemberId: SyncId,
  newAssigneeId: SyncId,
): ReviewItem[] {
  return items.map((item) =>
    item.assignedTo === departingMemberId ? { ...item, assignedTo: newAssigneeId } : item,
  );
}

// ---------------------------------------------------------------------------
// Contribution settlement
// ---------------------------------------------------------------------------

/**
 * Calculate the departing member's total contributions to shared goals.
 *
 * Used for settlement calculations during offboarding.
 *
 * @param entries - All goal contribution entries
 * @param departingMemberId - The departing member
 * @param goalIds - IDs of shared goals to include
 * @returns Total contributions in cents
 */
export function calculateDepartingMemberContributions(
  entries: readonly GoalContributionEntry[],
  departingMemberId: SyncId,
  goalIds: readonly SyncId[],
): number {
  return entries
    .filter((e) => e.memberId === departingMemberId && goalIds.includes(e.goalId))
    .reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Build a summary of what a departing member contributed across all shared goals.
 *
 * @param entries - All goal contribution entries
 * @param departingMemberId - The departing member
 * @param goalIds - Shared goal IDs
 * @returns Map of goalId to total contributed cents
 */
export function buildDepartingContributionSummary(
  entries: readonly GoalContributionEntry[],
  departingMemberId: SyncId,
  goalIds: readonly SyncId[],
): Map<SyncId, number> {
  const summary = new Map<SyncId, number>();
  for (const entry of entries) {
    if (entry.memberId === departingMemberId && goalIds.includes(entry.goalId)) {
      summary.set(entry.goalId, (summary.get(entry.goalId) ?? 0) + entry.amountCents);
    }
  }
  return summary;
}
