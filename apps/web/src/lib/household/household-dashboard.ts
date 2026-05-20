// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy-aware household dashboard engine.
 *
 * Computes net worth, spending summaries, and per-member breakdowns
 * while respecting privacy boundaries. Private transactions are never
 * included in shared aggregates.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1785
 */

import type { SyncId } from '../../kmp/bridge';
import type { PermissionMatrix } from './types';
import type {
  DashboardAccount,
  HouseholdDashboard,
  MemberSpendingSummary,
  PrivateTransaction,
  TransactionWithAmount,
} from './types';
import { filterVisibleTransactions } from './privacy-marking';
import { canViewCategory } from './category-permissions';

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

/**
 * Calculate the shared net worth from shared accounts only.
 *
 * Only accounts marked as shared are included. Private accounts are
 * excluded from the household view.
 *
 * @param accounts - All dashboard accounts
 * @returns Net worth in cents (sum of shared account balances)
 */
export function calculateSharedNetWorth(accounts: readonly DashboardAccount[]): number {
  return accounts.filter((a) => a.isShared).reduce((sum, a) => sum + a.balanceCents, 0);
}

/**
 * Get accounts visible in the shared household dashboard.
 *
 * @param accounts - All dashboard accounts
 * @returns Only accounts marked as shared
 */
export function getSharedAccounts(accounts: readonly DashboardAccount[]): DashboardAccount[] {
  return accounts.filter((a) => a.isShared);
}

// ---------------------------------------------------------------------------
// Spending summaries
// ---------------------------------------------------------------------------

/**
 * Calculate total household spending from shared transactions only.
 *
 * Filters out private transactions and only includes spending in
 * categories visible to the viewer.
 *
 * @param transactions - All transactions with amounts
 * @param markings - Privacy markings
 * @param permissionMatrix - Category permission matrix
 * @param viewerId - The member viewing the dashboard
 * @param sharedCategoryIds - Categories that are shared in the household
 * @returns Total shared spending in cents
 */
export function calculateTotalSharedSpending(
  transactions: readonly TransactionWithAmount[],
  markings: readonly PrivateTransaction[],
  permissionMatrix: PermissionMatrix,
  viewerId: SyncId,
  sharedCategoryIds: readonly SyncId[],
): number {
  const visible = filterVisibleTransactions(transactions, markings, viewerId);
  return visible
    .filter(
      (txn) =>
        txn.categoryId !== null &&
        sharedCategoryIds.includes(txn.categoryId) &&
        canViewCategory(permissionMatrix, viewerId, txn.categoryId),
    )
    .reduce((sum, txn) => sum + txn.amountCents, 0);
}

/**
 * Build per-member spending breakdown for shared categories.
 *
 * Each member's spending is aggregated only across categories that are:
 * 1. In the shared category list
 * 2. Visible to the viewer per the permission matrix
 * 3. Not marked as private by the transaction owner
 *
 * @param transactions - All transactions with amounts
 * @param markings - Privacy markings
 * @param permissionMatrix - Category permission matrix
 * @param viewerId - The member viewing the dashboard
 * @param memberNames - Map of member ID to display name
 * @param sharedCategoryIds - Categories shared in the household
 * @returns Per-member spending summaries
 */
export function buildMemberSpendingBreakdown(
  transactions: readonly TransactionWithAmount[],
  markings: readonly PrivateTransaction[],
  permissionMatrix: PermissionMatrix,
  viewerId: SyncId,
  memberNames: ReadonlyMap<SyncId, string | null>,
  sharedCategoryIds: readonly SyncId[],
): MemberSpendingSummary[] {
  const visible = filterVisibleTransactions(transactions, markings, viewerId);

  // Filter to shared categories the viewer can see
  const sharedVisible = visible.filter(
    (txn) =>
      txn.categoryId !== null &&
      sharedCategoryIds.includes(txn.categoryId) &&
      canViewCategory(permissionMatrix, viewerId, txn.categoryId),
  );

  // Group by member
  const memberMap = new Map<SyncId, Map<SyncId, number>>();
  const memberTotals = new Map<SyncId, number>();

  for (const txn of sharedVisible) {
    const catId = txn.categoryId!;

    if (!memberMap.has(txn.memberId)) {
      memberMap.set(txn.memberId, new Map());
      memberTotals.set(txn.memberId, 0);
    }

    const catMap = memberMap.get(txn.memberId)!;
    catMap.set(catId, (catMap.get(catId) ?? 0) + txn.amountCents);
    memberTotals.set(txn.memberId, (memberTotals.get(txn.memberId) ?? 0) + txn.amountCents);
  }

  const result: MemberSpendingSummary[] = [];
  for (const [memberId, catMap] of memberMap) {
    result.push({
      memberId,
      memberName: memberNames.get(memberId) ?? null,
      totalSpentCents: memberTotals.get(memberId) ?? 0,
      byCategory: catMap,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Full dashboard
// ---------------------------------------------------------------------------

/**
 * Build a complete privacy-aware household dashboard.
 *
 * Combines shared net worth, shared accounts, total spending, and
 * per-member spending breakdowns into a single dashboard object.
 *
 * @param accounts - All household accounts with sharing info
 * @param transactions - All transactions with amounts
 * @param markings - Privacy markings
 * @param permissionMatrix - Category permission matrix
 * @param viewerId - The member viewing the dashboard
 * @param memberNames - Map of member ID to display name
 * @param sharedCategoryIds - Categories shared in the household
 * @returns Complete household dashboard data
 */
export function buildHouseholdDashboard(
  accounts: readonly DashboardAccount[],
  transactions: readonly TransactionWithAmount[],
  markings: readonly PrivateTransaction[],
  permissionMatrix: PermissionMatrix,
  viewerId: SyncId,
  memberNames: ReadonlyMap<SyncId, string | null>,
  sharedCategoryIds: readonly SyncId[],
): HouseholdDashboard {
  const sharedAccounts = getSharedAccounts(accounts);
  const sharedNetWorthCents = calculateSharedNetWorth(accounts);

  const totalSharedSpendingCents = calculateTotalSharedSpending(
    transactions,
    markings,
    permissionMatrix,
    viewerId,
    sharedCategoryIds,
  );

  const memberSpending = buildMemberSpendingBreakdown(
    transactions,
    markings,
    permissionMatrix,
    viewerId,
    memberNames,
    sharedCategoryIds,
  );

  return {
    sharedNetWorthCents,
    sharedAccounts,
    totalSharedSpendingCents,
    memberSpending,
  };
}
