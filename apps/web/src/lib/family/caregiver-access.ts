// SPDX-License-Identifier: BUSL-1.1

/**
 * Caregiver / guardian access engine.
 *
 * Pure functions for managing guardian access grants, permission levels,
 * audit logging, time-limited access, and emergency access protocols.
 *
 * References: #1730
 */

import type { CaregiverAccess, CaregiverAuditEntry, CaregiverPermission } from './types';

// ---------------------------------------------------------------------------
// Access grant management
// ---------------------------------------------------------------------------

/**
 * Creates a new caregiver access grant.
 *
 * @param params - Grant creation parameters
 * @returns A new CaregiverAccess grant
 */
export function createAccessGrant(params: {
  readonly id: string;
  readonly caregiverName: string;
  readonly caregiverContact: string;
  readonly permission: CaregiverPermission;
  readonly accountIds: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly now: string;
}): CaregiverAccess {
  return {
    id: params.id,
    caregiverName: params.caregiverName,
    caregiverContact: params.caregiverContact,
    permission: params.permission,
    accountIds: params.accountIds,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    isEmergency: false,
    active: true,
    createdAt: params.now,
  };
}

/**
 * Creates an emergency access grant with elevated permissions.
 *
 * Emergency grants are full-permission, time-limited, and flagged
 * for audit purposes.
 *
 * @param params - Emergency grant parameters
 * @returns A new emergency CaregiverAccess grant
 */
export function createEmergencyAccess(params: {
  readonly id: string;
  readonly caregiverName: string;
  readonly caregiverContact: string;
  readonly accountIds: readonly string[];
  readonly validFrom: string;
  readonly durationHours: number;
  readonly now: string;
}): CaregiverAccess {
  const validUntil = new Date(
    new Date(params.validFrom).getTime() + params.durationHours * 3600_000,
  ).toISOString();

  return {
    id: params.id,
    caregiverName: params.caregiverName,
    caregiverContact: params.caregiverContact,
    permission: 'full',
    accountIds: params.accountIds,
    validFrom: params.validFrom,
    validUntil,
    isEmergency: true,
    active: true,
    createdAt: params.now,
  };
}

/**
 * Revokes a caregiver access grant.
 *
 * @param grant - The grant to revoke
 * @returns Updated grant with active=false
 */
export function revokeAccess(grant: CaregiverAccess): CaregiverAccess {
  return { ...grant, active: false };
}

/**
 * Updates the permission level of an existing grant.
 *
 * @param grant - The existing grant
 * @param newPermission - New permission level
 * @returns Updated grant
 */
export function updatePermission(
  grant: CaregiverAccess,
  newPermission: CaregiverPermission,
): CaregiverAccess {
  return { ...grant, permission: newPermission };
}

/**
 * Extends the validity period of a grant.
 *
 * @param grant - The existing grant
 * @param newValidUntil - New expiration ISO-8601 timestamp
 * @returns Updated grant
 */
export function extendAccess(grant: CaregiverAccess, newValidUntil: string): CaregiverAccess {
  return { ...grant, validUntil: newValidUntil };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Checks whether a caregiver access grant is currently valid.
 *
 * @param grant - The access grant
 * @param now - Current ISO-8601 timestamp
 * @returns True if the grant is active and within its validity window
 */
export function isAccessValid(grant: CaregiverAccess, now: string): boolean {
  if (!grant.active) return false;
  if (now < grant.validFrom) return false;
  // Empty validUntil means indefinite
  if (grant.validUntil !== '' && now > grant.validUntil) return false;
  return true;
}

/**
 * Checks if a caregiver can access a specific account.
 *
 * @param grant - The access grant
 * @param accountId - Account ID to check
 * @param now - Current ISO-8601 timestamp
 * @returns True if the caregiver can access this account
 */
export function canAccessAccount(grant: CaregiverAccess, accountId: string, now: string): boolean {
  if (!isAccessValid(grant, now)) return false;
  return grant.accountIds.includes(accountId);
}

/**
 * Checks if a caregiver has write permissions.
 *
 * @param grant - The access grant
 * @returns True if the grant allows editing
 */
export function hasWritePermission(grant: CaregiverAccess): boolean {
  return grant.permission === 'limited-edit' || grant.permission === 'full';
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

/**
 * Creates an audit log entry for a caregiver action.
 *
 * @param params - Audit entry parameters
 * @returns A new CaregiverAuditEntry
 */
export function createAuditEntry(params: {
  readonly id: string;
  readonly accessId: string;
  readonly action: string;
  readonly accountId: string;
  readonly now: string;
  readonly details?: string;
}): CaregiverAuditEntry {
  return {
    id: params.id,
    accessId: params.accessId,
    action: params.action,
    accountId: params.accountId,
    timestamp: params.now,
    details: params.details ?? '',
  };
}

/**
 * Filters audit entries for a specific access grant.
 *
 * @param entries - All audit entries
 * @param accessId - Access grant ID
 * @returns Entries for the given grant
 */
export function getAuditEntriesForGrant(
  entries: readonly CaregiverAuditEntry[],
  accessId: string,
): readonly CaregiverAuditEntry[] {
  return entries.filter((e) => e.accessId === accessId);
}

/**
 * Filters audit entries for a specific account.
 *
 * @param entries - All audit entries
 * @param accountId - Account ID
 * @returns Entries for the given account
 */
export function getAuditEntriesForAccount(
  entries: readonly CaregiverAuditEntry[],
  accountId: string,
): readonly CaregiverAuditEntry[] {
  return entries.filter((e) => e.accountId === accountId);
}

/**
 * Returns all active grants for a list of accounts.
 *
 * @param grants - All caregiver grants
 * @param accountIds - Account IDs to check
 * @param now - Current ISO-8601 timestamp
 * @returns Active grants that cover at least one of the accounts
 */
export function getActiveGrantsForAccounts(
  grants: readonly CaregiverAccess[],
  accountIds: readonly string[],
  now: string,
): readonly CaregiverAccess[] {
  return grants.filter(
    (g) => isAccessValid(g, now) && g.accountIds.some((id) => accountIds.includes(id)),
  );
}
