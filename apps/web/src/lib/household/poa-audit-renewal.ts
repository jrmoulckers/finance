// SPDX-License-Identifier: BUSL-1.1

import { getPoaGrantStatus } from './poa-access';
import type { PoaAccessGrant, PoaCapability, PoaScope } from './poa-access';

export interface PoaOwnerAuditEntry {
  readonly grantId: string;
  readonly caregiverMemberId: string;
  readonly scope: PoaScope;
  readonly action: PoaCapability;
  readonly occurredAt: string;
  readonly ownerSummary: string;
  readonly readOnlyLabel: string;
}

export interface PoaRenewalReminder {
  readonly grantId: string;
  readonly due: boolean;
  readonly daysUntilExpiration: number | null;
  readonly message: string;
}

export const POA_LEGAL_BOUNDARY_ONBOARDING_COPY =
  'This app can record read-only caregiver access, but it does not grant power of attorney or other legal authority.';

function wholeDaysBetween(startIso: string, endIso: string): number | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.ceil((end - start) / 86_400_000);
}

export function buildPoaOwnerAuditEntry(
  grant: Pick<PoaAccessGrant, 'id' | 'caregiverMemberId'>,
  scope: PoaScope,
  action: PoaCapability,
  occurredAt: string,
): PoaOwnerAuditEntry {
  const readableScope = scope.toLowerCase().replaceAll('_', ' ');
  const readableAction = action.toLowerCase().replaceAll('_', ' ');

  return {
    grantId: grant.id,
    caregiverMemberId: grant.caregiverMemberId,
    scope,
    action,
    occurredAt,
    ownerSummary: `Caregiver ${grant.caregiverMemberId} used ${readableAction} for ${readableScope}.`,
    readOnlyLabel: 'Read-only caregiver/POA view',
  };
}

export function getPoaRenewalReminder(
  grant: PoaAccessGrant,
  now: string,
  reminderWindowDays = 30,
): PoaRenewalReminder {
  const status = getPoaGrantStatus(grant, now);
  if (status !== 'ACTIVE' || !grant.expiresAt) {
    return {
      grantId: grant.id,
      due: false,
      daysUntilExpiration: null,
      message: 'No POA renewal reminder is due for this grant.',
    };
  }

  const daysUntilExpiration = wholeDaysBetween(now, grant.expiresAt);
  const due =
    daysUntilExpiration !== null &&
    daysUntilExpiration >= 0 &&
    daysUntilExpiration <= reminderWindowDays;

  return {
    grantId: grant.id,
    due,
    daysUntilExpiration,
    message: due
      ? 'Review or renew this read-only caregiver access before it expires.'
      : 'POA renewal reminder is outside the reminder window.',
  };
}

export function buildPoaImmediateRevokeCopy(caregiverName: string): string {
  const name = caregiverName.trim() || 'this caregiver';
  return `Revoke ${name}'s read-only access immediately; this does not change any legal documents outside the app.`;
}
