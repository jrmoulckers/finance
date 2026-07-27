// SPDX-License-Identifier: BUSL-1.1

import { clearEncryptedData } from '../../db/encryption';
import { clearQueue } from '../../db/mutation-queue';
import {
  getHouseholdById,
  getHouseholdInvitations,
  getHouseholdMembers,
} from '../../db/repositories/household';
import type { AsyncDb } from '../../db/async-db';
import type { SyncId } from '../../kmp/bridge';

export interface HouseholdDeletionImpact {
  soloOwnedHouseholds: number;
  memberHouseholds: number;
  pendingInvites: number;
}

const LOCAL_TABLE_DELETE_ORDER = [
  'shared_goal',
  'shared_budget',
  'account_sharing',
  'household_invitation',
  '"transaction"',
  'budget',
  'goal',
  'category',
  'account',
  'household_member',
  'household',
  'user',
  'widget_privacy_config',
] as const;

export async function getHouseholdDeletionImpact(
  db: AsyncDb | null,
  userId: SyncId | null | undefined,
): Promise<HouseholdDeletionImpact> {
  if (!db || !userId) {
    return { soloOwnedHouseholds: 0, memberHouseholds: 0, pendingInvites: 0 };
  }

  const membershipRows = await db.getAll(
    `SELECT DISTINCT household_id FROM household_member WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const ownedRows = await db.getAll(
    `SELECT id FROM household WHERE owner_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  const householdIds = new Set<string>();
  for (const row of membershipRows) {
    if (typeof row.household_id === 'string') householdIds.add(row.household_id);
  }
  for (const row of ownedRows) {
    if (typeof row.id === 'string') householdIds.add(row.id);
  }

  let soloOwnedHouseholds = 0;
  let memberHouseholds = 0;
  let pendingInvites = 0;

  for (const householdId of householdIds) {
    const household = await getHouseholdById(db, householdId);
    if (!household) continue;

    const members = await getHouseholdMembers(db, householdId);
    const otherMembers = members.filter((member) => member.userId !== userId);
    const isOwner = household.ownerId === userId;

    if (isOwner && otherMembers.length === 0) {
      soloOwnedHouseholds += 1;
    } else {
      memberHouseholds += 1;
    }

    pendingInvites += (await getHouseholdInvitations(db, householdId)).filter(
      (invite) =>
        invite.status === 'PENDING' &&
        (invite.invitedBy === userId || household.ownerId === userId),
    ).length;
  }

  return { soloOwnedHouseholds, memberHouseholds, pendingInvites };
}

export async function clearLocalAccountData(db: AsyncDb | null): Promise<void> {
  if (db) {
    for (const table of LOCAL_TABLE_DELETE_ORDER) {
      try {
        await db.execute(`DELETE FROM ${table}`);
      } catch {
        // Older local schemas may not have every optional feature table.
      }
    }
  }

  await Promise.all([
    clearQueue().catch(() => undefined),
    clearEncryptedData().catch(() => undefined),
  ]);
}
