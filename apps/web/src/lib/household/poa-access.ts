// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure helpers for POA/caregiver scoped read-only household access.
 *
 * References: issue #2241
 */

export type PoaScope = 'BILLS' | 'BALANCES' | 'CASH_FLOW' | 'ALERTS' | 'NET_WORTH_SUMMARY';
export type PoaCapability = 'VIEW' | 'EDIT' | 'EXPORT' | 'MANAGE_SHARING';
export type PoaGrantStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NOT_YET_ACTIVE';

export interface PoaAccessGrant {
  readonly id: string;
  readonly householdId: string;
  readonly caregiverMemberId: string;
  readonly scopes: readonly PoaScope[];
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly allowSummaryExport: boolean;
  readonly authorizationNote: string;
  readonly createdAt: string;
}

export interface CreatePoaGrantInput {
  readonly id: string;
  readonly householdId: string;
  readonly caregiverMemberId: string;
  readonly scopes: readonly PoaScope[];
  readonly startsAt: string;
  readonly expiresAt?: string | null;
  readonly allowSummaryExport?: boolean;
  readonly authorizationNote?: string;
  readonly createdAt: string;
}

export interface PoaAccessDecision {
  readonly allowed: boolean;
  readonly status: PoaGrantStatus;
  readonly watermark: string;
  readonly reason: string;
}

export interface PoaAuditEvent {
  readonly grantId: string;
  readonly caregiverMemberId: string;
  readonly scope: PoaScope;
  readonly action: PoaCapability;
  readonly occurredAt: string;
  readonly summary: string;
}

function uniqueScopes(scopes: readonly PoaScope[]): PoaScope[] {
  return Array.from(new Set(scopes));
}

export function createPoaAccessGrant(input: CreatePoaGrantInput): PoaAccessGrant {
  return {
    id: input.id,
    householdId: input.householdId,
    caregiverMemberId: input.caregiverMemberId,
    scopes: uniqueScopes(input.scopes),
    startsAt: input.startsAt,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
    allowSummaryExport: input.allowSummaryExport ?? false,
    authorizationNote:
      input.authorizationNote?.trim() ||
      'Authorization evidence should be verified outside the app; this access does not grant legal authority.',
    createdAt: input.createdAt,
  };
}

export function revokePoaAccessGrant(grant: PoaAccessGrant, revokedAt: string): PoaAccessGrant {
  return { ...grant, revokedAt };
}

export function getPoaGrantStatus(
  grant: Pick<PoaAccessGrant, 'startsAt' | 'expiresAt' | 'revokedAt'>,
  now: string,
): PoaGrantStatus {
  if (grant.revokedAt) return 'REVOKED';
  if (grant.startsAt.localeCompare(now) > 0) return 'NOT_YET_ACTIVE';
  if (grant.expiresAt && grant.expiresAt.localeCompare(now) < 0) return 'EXPIRED';
  return 'ACTIVE';
}

export function evaluatePoaAccess(
  grant: PoaAccessGrant,
  scope: PoaScope,
  capability: PoaCapability,
  now: string,
): PoaAccessDecision {
  const status = getPoaGrantStatus(grant, now);
  const watermark = 'Read-only caregiver/POA view';

  if (status !== 'ACTIVE') {
    return {
      allowed: false,
      status,
      watermark,
      reason: `Grant is ${status.toLowerCase().replaceAll('_', ' ')}.`,
    };
  }

  if (!grant.scopes.includes(scope)) {
    return {
      allowed: false,
      status,
      watermark,
      reason: 'This view is outside the caregiver scope.',
    };
  }

  if (capability === 'VIEW') {
    return { allowed: true, status, watermark, reason: 'Scoped read-only access is allowed.' };
  }

  if (capability === 'EXPORT' && grant.allowSummaryExport) {
    return {
      allowed: true,
      status,
      watermark,
      reason: 'Summary export was explicitly allowed by the owner.',
    };
  }

  return {
    allowed: false,
    status,
    watermark,
    reason: 'POA-scoped access blocks edits, sharing changes, and unapproved exports.',
  };
}

export function buildPoaAuditEvent(
  grant: Pick<PoaAccessGrant, 'id' | 'caregiverMemberId'>,
  scope: PoaScope,
  action: PoaCapability,
  occurredAt: string,
): PoaAuditEvent {
  return {
    grantId: grant.id,
    caregiverMemberId: grant.caregiverMemberId,
    scope,
    action,
    occurredAt,
    summary: `${action.toLowerCase()} ${scope.toLowerCase().replaceAll('_', ' ')} via POA-scoped access`,
  };
}
