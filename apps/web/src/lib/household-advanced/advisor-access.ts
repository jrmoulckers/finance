// SPDX-License-Identifier: BUSL-1.1

/**
 * Financial advisor or coach read-only access.
 *
 * Provides scoped, time-limited, read-only access for financial advisors
 * or coaches. Includes access audit logging and revocation support.
 *
 * All functions are pure — no side effects.
 *
 * References: issue #1795
 */

import type {
  AdvisorAccess,
  AdvisorAccessLogEntry,
  AdvisorRole,
  HouseholdId,
  ISODateString,
  UserId,
} from './types';

// ---------------------------------------------------------------------------
// Access Grant
// ---------------------------------------------------------------------------

/**
 * Grant read-only access to an advisor or coach.
 *
 * @param id - Unique access record identifier.
 * @param householdId - Household granting access.
 * @param advisorUserId - The advisor/coach user ID.
 * @param role - Role type (advisor or coach).
 * @param visibleAccountIds - Accounts the advisor can see.
 * @param visibleCategoryIds - Categories the advisor can see.
 * @param grantedBy - User granting the access.
 * @param grantedAt - When access was granted (ISO string).
 * @param expiresAt - When access expires (ISO string).
 * @returns A new {@link AdvisorAccess} record.
 */
export function grantAccess(
  id: string,
  householdId: HouseholdId,
  advisorUserId: UserId,
  role: AdvisorRole,
  visibleAccountIds: readonly string[],
  visibleCategoryIds: readonly string[],
  grantedBy: UserId,
  grantedAt: ISODateString,
  expiresAt: ISODateString,
): AdvisorAccess {
  return {
    id,
    householdId,
    advisorUserId,
    role,
    visibleAccountIds,
    visibleCategoryIds,
    grantedAt,
    expiresAt,
    revokedAt: null,
    grantedBy,
  };
}

// ---------------------------------------------------------------------------
// Revocation
// ---------------------------------------------------------------------------

/**
 * Revoke an advisor's access.
 *
 * @param access - The access record to revoke.
 * @param revokedAt - When the revocation occurred (ISO string).
 * @returns Updated access record with `revokedAt` set.
 */
export function revokeAccess(access: AdvisorAccess, revokedAt: ISODateString): AdvisorAccess {
  return { ...access, revokedAt };
}

// ---------------------------------------------------------------------------
// Access Validation
// ---------------------------------------------------------------------------

/**
 * Check whether an advisor access grant is currently valid.
 *
 * An access grant is valid when it has not been revoked and the current
 * time is before the expiry.
 *
 * @param access - The access record to check.
 * @param now - Current ISO timestamp.
 * @returns `true` if the access is active and not expired.
 */
export function isAccessValid(access: AdvisorAccess, now: ISODateString): boolean {
  if (access.revokedAt !== null) return false;
  return new Date(now).getTime() <= new Date(access.expiresAt).getTime();
}

/**
 * Check whether a specific account is visible to the advisor.
 *
 * @param access - The access record.
 * @param accountId - Account to check.
 * @returns `true` if the account is in the visible list.
 */
export function isAccountVisible(access: AdvisorAccess, accountId: string): boolean {
  return access.visibleAccountIds.includes(accountId);
}

/**
 * Check whether a specific category is visible to the advisor.
 *
 * @param access - The access record.
 * @param categoryId - Category to check.
 * @returns `true` if the category is in the visible list.
 */
export function isCategoryVisible(access: AdvisorAccess, categoryId: string): boolean {
  return access.visibleCategoryIds.includes(categoryId);
}

// ---------------------------------------------------------------------------
// Scope Updates
// ---------------------------------------------------------------------------

/**
 * Update the visible accounts for an advisor access grant.
 *
 * @param access - Current access record.
 * @param accountIds - New list of visible account IDs.
 * @returns Updated access record.
 */
export function updateVisibleAccounts(
  access: AdvisorAccess,
  accountIds: readonly string[],
): AdvisorAccess {
  return { ...access, visibleAccountIds: accountIds };
}

/**
 * Update the visible categories for an advisor access grant.
 *
 * @param access - Current access record.
 * @param categoryIds - New list of visible category IDs.
 * @returns Updated access record.
 */
export function updateVisibleCategories(
  access: AdvisorAccess,
  categoryIds: readonly string[],
): AdvisorAccess {
  return { ...access, visibleCategoryIds: categoryIds };
}

/**
 * Renew (extend) an advisor access grant.
 *
 * @param access - Current access record.
 * @param newExpiresAt - New expiry date (ISO string).
 * @returns Updated access record.
 */
export function renewAccess(access: AdvisorAccess, newExpiresAt: ISODateString): AdvisorAccess {
  return { ...access, expiresAt: newExpiresAt, revokedAt: null };
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

/**
 * Create an audit log entry for an advisor access event.
 *
 * @param id - Unique log entry identifier.
 * @param advisorAccessId - The access record this event pertains to.
 * @param action - The action that occurred.
 * @param performedBy - User who performed the action.
 * @param timestamp - When the action occurred (ISO string).
 * @param detail - Human-readable detail.
 * @returns A new {@link AdvisorAccessLogEntry}.
 */
export function createAccessLogEntry(
  id: string,
  advisorAccessId: string,
  action: AdvisorAccessLogEntry['action'],
  performedBy: UserId,
  timestamp: ISODateString,
  detail: string,
): AdvisorAccessLogEntry {
  return { id, advisorAccessId, action, performedBy, timestamp, detail };
}

/**
 * Filter audit log entries for a specific advisor access record.
 *
 * @param entries - Full audit log.
 * @param advisorAccessId - Access record to filter by.
 * @returns Filtered entries.
 */
export function getLogEntriesForAccess(
  entries: readonly AdvisorAccessLogEntry[],
  advisorAccessId: string,
): AdvisorAccessLogEntry[] {
  return entries.filter((e) => e.advisorAccessId === advisorAccessId);
}

/**
 * Get all active (non-revoked, non-expired) access grants for a household.
 *
 * @param grants - All access grants.
 * @param householdId - Household to filter by.
 * @param now - Current ISO timestamp.
 * @returns Active access grants.
 */
export function getActiveGrants(
  grants: readonly AdvisorAccess[],
  householdId: HouseholdId,
  now: ISODateString,
): AdvisorAccess[] {
  return grants.filter((g) => g.householdId === householdId && isAccessValid(g, now));
}
