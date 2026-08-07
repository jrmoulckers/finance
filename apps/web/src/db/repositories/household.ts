// SPDX-License-Identifier: BUSL-1.1

/**
 * Household repository — CRUD operations for household, members, invitations,
 * account sharing, shared budgets, and shared goals.
 *
 * Synced tables (`households`, `household_members`) carry no
 * `sync_version`/`is_synced` columns — those are server-managed and projected
 * away by the sync rules. Local-only tables (invitations, sharing, shared
 * budgets/goals) keep `sync_version`/`is_synced`. Reads always filter
 * `deleted_at IS NULL` (soft deletes).
 *
 * Monetary values are stored as integer cents.
 *
 * References: issues #1780, #1779, #1781, #1716, #1784, #1786
 */

import type {
  AccountSharing,
  AccountSharingMode,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  HouseholdPermission,
  HouseholdRole,
  InvitationStatus,
  SharedBudget,
  SharedBudgetMode,
  SharedGoal,
  SyncId,
  BudgetContribution,
  GoalContribution,
} from '../../kmp/bridge';
import { ROLE_PERMISSIONS, cents } from '../../kmp/bridge';
import { execute, query, queryOne, type AsyncDb, type Row } from '../async-db';
import {
  HOUSEHOLD_MEMBERS_KEY,
  HOUSEHOLD_SINGLETON_KEY,
  readHouseholdValue,
  writeHouseholdValue,
} from './householdData';
import {
  SQLITE_NOW_EXPRESSION,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

// ---------------------------------------------------------------------------
// Table initialization
// ---------------------------------------------------------------------------

/**
 * Create household-related tables if they don't already exist.
 *
 * Call this during database initialization to ensure the schema is ready.
 */
export async function initHouseholdTables(db: AsyncDb): Promise<void> {
  // `households` and `household_members` are synced tables (Postgres →
  // sync-rules → PowerSync). They carry no `sync_version`/`is_synced` columns
  // (server-managed) and `household_members` has no `display_name`. The
  // remaining tables have no synced counterpart and stay local-only with their
  // original singular names + columns. In live mode PowerSync owns all of these
  // (from schema.ts), so these CREATE IF NOT EXISTS statements are no-ops.
  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`,
    [],
  );

  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS household_members (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      joined_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`,
    [],
  );

  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS household_invitation (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      status TEXT NOT NULL DEFAULT 'PENDING',
      invite_code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 1,
      is_synced INTEGER NOT NULL DEFAULT 0
    )`,
    [],
  );

  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS account_sharing (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      sharing_mode TEXT NOT NULL DEFAULT 'PRIVATE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 1,
      is_synced INTEGER NOT NULL DEFAULT 0
    )`,
    [],
  );

  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS shared_budget (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      budget_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'CATEGORY',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 1,
      is_synced INTEGER NOT NULL DEFAULT 0
    )`,
    [],
  );

  await execute(
    db,
    `CREATE TABLE IF NOT EXISTS shared_goal (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      is_shared INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_version INTEGER NOT NULL DEFAULT 1,
      is_synced INTEGER NOT NULL DEFAULT 0
    )`,
    [],
  );
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapHousehold(row: Row): Household {
  return {
    id: requireString(row.id, 'household.id'),
    name: requireString(row.name, 'household.name'),
    ownerId: requireString(row.created_by, 'household.created_by'),
    ...mapSyncMetadata(row),
  };
}

function mapMember(row: Row): HouseholdMember {
  return {
    id: requireString(row.id, 'household_member.id'),
    householdId: requireString(row.household_id, 'household_member.household_id'),
    userId: requireString(row.user_id, 'household_member.user_id'),
    displayName: optionalString(row.display_name),
    role: requireString(row.role, 'household_member.role').toUpperCase() as HouseholdRole,
    joinedAt: requireString(row.joined_at, 'household_member.joined_at'),
    ...mapSyncMetadata(row),
  };
}

function mapInvitation(row: Row): HouseholdInvitation {
  return {
    id: requireString(row.id, 'household_invitation.id'),
    householdId: requireString(row.household_id, 'household_invitation.household_id'),
    invitedBy: requireString(row.invited_by, 'household_invitation.invited_by'),
    email: requireString(row.email, 'household_invitation.email'),
    role: requireString(row.role, 'household_invitation.role') as HouseholdRole,
    status: requireString(row.status, 'household_invitation.status') as InvitationStatus,
    inviteCode: requireString(row.invite_code, 'household_invitation.invite_code'),
    expiresAt: requireString(row.expires_at, 'household_invitation.expires_at'),
    ...mapSyncMetadata(row),
  };
}

function mapAccountSharing(row: Row): AccountSharing {
  return {
    id: requireString(row.id, 'account_sharing.id'),
    accountId: requireString(row.account_id, 'account_sharing.account_id'),
    householdId: requireString(row.household_id, 'account_sharing.household_id'),
    ownerId: requireString(row.owner_id, 'account_sharing.owner_id'),
    sharingMode: requireString(
      row.sharing_mode,
      'account_sharing.sharing_mode',
    ) as AccountSharingMode,
    ...mapSyncMetadata(row),
  };
}

function mapSharedBudget(row: Row): SharedBudget {
  return {
    id: requireString(row.id, 'shared_budget.id'),
    householdId: requireString(row.household_id, 'shared_budget.household_id'),
    budgetId: requireString(row.budget_id, 'shared_budget.budget_id'),
    mode: requireString(row.mode, 'shared_budget.mode') as SharedBudgetMode,
    isActive: toBoolean(row.is_active),
    ...mapSyncMetadata(row),
  };
}

function mapSharedGoal(row: Row): SharedGoal {
  return {
    id: requireString(row.id, 'shared_goal.id'),
    householdId: requireString(row.household_id, 'shared_goal.household_id'),
    goalId: requireString(row.goal_id, 'shared_goal.goal_id'),
    isShared: toBoolean(row.is_shared),
    ...mapSyncMetadata(row),
  };
}

function _mapBudgetContribution(row: Row): BudgetContribution {
  return {
    memberId: requireString(row.member_id, 'budget_contribution.member_id'),
    memberName: optionalString(row.member_name),
    spentAmount: cents(requireNumber(row.spent_amount, 'budget_contribution.spent_amount')),
  };
}

function _mapGoalContribution(row: Row): GoalContribution {
  return {
    memberId: requireString(row.member_id, 'goal_contribution.member_id'),
    memberName: optionalString(row.member_name),
    contributedAmount: cents(
      requireNumber(row.contributed_amount, 'goal_contribution.contributed_amount'),
    ),
  };
}

// ---------------------------------------------------------------------------
// Household CRUD
// ---------------------------------------------------------------------------

/** Input for creating a new household. */
export interface CreateHouseholdInput {
  name: string;
  ownerId: SyncId;
}

/** Retrieve the household for a given owner. Returns null if none exists. */
export async function getHouseholdByOwner(db: AsyncDb, ownerId: SyncId): Promise<Household | null> {
  const row = await queryOne(
    db,
    `SELECT * FROM households WHERE created_by = ? AND deleted_at IS NULL`,
    [ownerId],
  );
  return row ? mapHousehold(row) : null;
}

/** Retrieve a household by its ID. */
export async function getHouseholdById(db: AsyncDb, id: SyncId): Promise<Household | null> {
  const row = await queryOne(db, `SELECT * FROM households WHERE id = ? AND deleted_at IS NULL`, [
    id,
  ]);
  return row ? mapHousehold(row) : null;
}

/**
 * Returns the id of the primary (oldest, non-deleted) household, or `null` when
 * no household exists yet. Used to attach records created before any
 * household-scoped entity is available — e.g. savings goals saved during
 * onboarding, which happens before the first budget/account exists (#3405).
 */
export async function getPrimaryHouseholdId(db: AsyncDb): Promise<SyncId | null> {
  const row = await queryOne(
    db,
    `SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
  );
  return row ? requireString(row.id, 'household.id') : null;
}

/** Create a new household and add the creator as OWNER member. */
export async function createHousehold(
  db: AsyncDb,
  input: CreateHouseholdInput,
): Promise<Household> {
  const id = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    db,
    `INSERT INTO households (id, name, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION})`,
    [id, input.name.trim(), input.ownerId],
  );

  await execute(
    db,
    `INSERT INTO household_members (id, household_id, user_id, role, joined_at, created_at, updated_at)
     VALUES (?, ?, ?, 'OWNER', ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION})`,
    [memberId, id, input.ownerId, now],
  );

  const row = await queryOne(db, `SELECT * FROM households WHERE id = ?`, [id]);
  return mapHousehold(row!);
}

/** Input for {@link ensureSyncedHouseholdMembership}. */
export interface EnsureSyncedHouseholdInput {
  householdId: SyncId;
  name: string;
  userId: SyncId;
}

/**
 * Idempotently backfill a synced `households` + owner `household_members` row
 * for an authenticated user's household.
 *
 * The app's household is created in the local-only `hh_household` document
 * store (see `householdData.ts`), which never reaches the server. The
 * `bank-connection` edge function, however, authorizes `create_link_token` by
 * looking up a `household_members` row for `(household_id, user_id)` with a
 * role in `('owner','admin')`. Without a synced membership row the call returns
 * 403. This writes the relational rows so live bank connections are authorized
 * (they upload via PowerSync under the user's own RLS: `households.created_by =
 * auth.uid()` and the matching `household_members` insert policy).
 *
 * `userId` MUST be the authenticated Supabase user id (`auth.uid()`) or the
 * upload is rejected by RLS. Role is written lowercase (`owner`) to match the
 * server convention. No-ops when either id is missing.
 */
export async function ensureSyncedHouseholdMembership(
  db: AsyncDb,
  input: EnsureSyncedHouseholdInput,
): Promise<void> {
  const householdId = input.householdId?.trim();
  const userId = input.userId?.trim();
  if (!householdId || !userId) return;

  const existingHousehold = await queryOne(db, `SELECT id FROM households WHERE id = ?`, [
    householdId,
  ]);
  if (!existingHousehold) {
    await execute(
      db,
      `INSERT INTO households (id, name, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION})`,
      [householdId, input.name?.trim() || 'Household', userId],
    );
  }

  const existingMember = await queryOne(
    db,
    `SELECT id FROM household_members
     WHERE household_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [householdId, userId],
  );
  if (!existingMember) {
    await execute(
      db,
      `INSERT INTO household_members (id, household_id, user_id, role, joined_at, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION})`,
      [crypto.randomUUID(), householdId, userId],
    );
  }
}

/** Minimal authenticated-user shape needed to seed a default household. */
export interface DefaultHouseholdAuthUser {
  /** The authenticated Supabase user id (`auth.uid()`). */
  id: SyncId;
  /** OAuth display name, used for the owner member's label when present. */
  name?: string | null;
  /** Account email, used as a fallback owner label. */
  email?: string | null;
}

/** Name given to the household provisioned for a brand-new account. */
export const DEFAULT_HOUSEHOLD_NAME = 'My Household';

/**
 * Ensure the signed-in user has a household, provisioning a sensible default
 * when they have none. Idempotent: when an `hh_household` already exists its id
 * is returned untouched, so this is safe to call on every mount/click.
 *
 * Bank data is household-scoped — the `by_household` sync bucket and the
 * `create_link_token` owner check both require a household + owner membership —
 * so a household must exist before the first bank connection. Rather than making
 * a fresh user hand-create one (the "create a household before connecting a
 * bank" wall), we seed a default they can rename later.
 *
 * Writes BOTH the local-only `hh_household` + `hh_member` document store (the
 * app's UI source of truth, shared with `useHousehold`) AND, via
 * {@link ensureSyncedHouseholdMembership}, the synced `households` /
 * `household_members` rows (server authorization + PowerSync). This keeps the
 * two stores in step exactly like `useHousehold.createHousehold`.
 *
 * Returns the resolved household id, or `null` when no authenticated user id is
 * available (a synced household cannot be owned without `auth.uid()`).
 */
export async function ensureDefaultHousehold(
  db: AsyncDb,
  authUser: DefaultHouseholdAuthUser,
): Promise<string | null> {
  const userId = authUser.id?.trim();
  if (!userId) return null;

  const existing = await readHouseholdValue<{ id?: unknown } | null>(
    db,
    HOUSEHOLD_SINGLETON_KEY,
    null,
  );
  if (existing && typeof existing.id === 'string' && existing.id.length > 0) {
    return existing.id;
  }

  const now = new Date().toISOString();
  const householdId = crypto.randomUUID();
  // Prefer the OAuth name, then email — never expose a raw UUID as the label.
  const displayName =
    (authUser.name && authUser.name.trim().length > 0 ? authUser.name.trim() : null) ??
    (authUser.email && authUser.email.trim().length > 0 ? authUser.email.trim() : null);

  const household: Household = {
    id: householdId,
    name: DEFAULT_HOUSEHOLD_NAME,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  };

  const ownerMember: HouseholdMember = {
    id: crypto.randomUUID(),
    householdId,
    userId,
    displayName,
    role: 'OWNER',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncVersion: 1,
    isSynced: false,
  };

  // Local doc store first: household before members so the members write can
  // resolve the owning household id for its promoted `household_id` column.
  await writeHouseholdValue(db, HOUSEHOLD_SINGLETON_KEY, household);
  await writeHouseholdValue(db, HOUSEHOLD_MEMBERS_KEY, [ownerMember]);

  // Mirror into the synced tables so `create_link_token` authorizes this owner
  // and the `by_household` bucket starts publishing their bank data.
  await ensureSyncedHouseholdMembership(db, {
    householdId,
    name: household.name,
    userId,
  });

  return householdId;
}

// ---------------------------------------------------------------------------
// Member CRUD
// ---------------------------------------------------------------------------

/** Retrieve all non-deleted members of a household. */
export async function getHouseholdMembers(
  db: AsyncDb,
  householdId: SyncId,
): Promise<HouseholdMember[]> {
  const { rows } = await query(
    db,
    `SELECT * FROM household_members WHERE household_id = ? AND deleted_at IS NULL ORDER BY joined_at ASC`,
    [householdId],
  );
  return rows.map(mapMember);
}

/** Update a member's role within the household. */
export async function updateMemberRole(
  db: AsyncDb,
  memberId: SyncId,
  role: HouseholdRole,
): Promise<HouseholdMember | null> {
  await execute(
    db,
    `UPDATE household_members
       SET role = ?, updated_at = ${SQLITE_NOW_EXPRESSION}
     WHERE id = ? AND deleted_at IS NULL`,
    [role, memberId],
  );
  const row = await queryOne(db, `SELECT * FROM household_members WHERE id = ?`, [memberId]);
  return row ? mapMember(row) : null;
}

/** Soft-delete a member from the household. */
export async function removeMember(db: AsyncDb, memberId: SyncId): Promise<boolean> {
  await execute(
    db,
    `UPDATE household_members
       SET deleted_at = ${SQLITE_NOW_EXPRESSION}, updated_at = ${SQLITE_NOW_EXPRESSION}
     WHERE id = ? AND deleted_at IS NULL`,
    [memberId],
  );
  return true;
}

// ---------------------------------------------------------------------------
// Invitation CRUD
// ---------------------------------------------------------------------------

/** Input for creating a new invitation. */
export interface CreateInvitationInput {
  householdId: SyncId;
  invitedBy: SyncId;
  email: string;
  role: HouseholdRole;
}

/** Generate a short invite code (8 hex characters). */
function generateInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Retrieve all non-deleted invitations for a household. */
export async function getHouseholdInvitations(
  db: AsyncDb,
  householdId: SyncId,
): Promise<HouseholdInvitation[]> {
  const { rows } = await query(
    db,
    `SELECT * FROM household_invitation WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    [householdId],
  );
  return rows.map(mapInvitation);
}

/** Create a new invitation with a 7-day expiry. */
export async function createInvitation(
  db: AsyncDb,
  input: CreateInvitationInput,
): Promise<HouseholdInvitation> {
  const id = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await execute(
    db,
    `INSERT INTO household_invitation (id, household_id, invited_by, email, role, status, invite_code, expires_at, created_at, updated_at, sync_version, is_synced)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION}, 1, 0)`,
    [
      id,
      input.householdId,
      input.invitedBy,
      input.email.trim().toLowerCase(),
      input.role,
      inviteCode,
      expiresAt,
    ],
  );

  const row = await queryOne(db, `SELECT * FROM household_invitation WHERE id = ?`, [id]);
  return mapInvitation(row!);
}

/** Accept a pending invitation by invite code. Creates a household member. */
export async function acceptInvitation(
  db: AsyncDb,
  inviteCode: string,
  userId: SyncId,
  _displayName: string | null,
): Promise<HouseholdMember | null> {
  const invRow = await queryOne(
    db,
    `SELECT * FROM household_invitation
     WHERE invite_code = ? AND status = 'PENDING' AND deleted_at IS NULL`,
    [inviteCode],
  );

  if (!invRow) return null;

  const invitation = mapInvitation(invRow);
  const now = new Date();

  // Check expiry
  if (new Date(invitation.expiresAt) < now) {
    await execute(
      db,
      `UPDATE household_invitation
         SET status = 'EXPIRED', updated_at = ${SQLITE_NOW_EXPRESSION}, sync_version = 1, is_synced = 0
       WHERE id = ?`,
      [invitation.id],
    );
    return null;
  }

  // Mark invitation as accepted
  await execute(
    db,
    `UPDATE household_invitation
       SET status = 'ACCEPTED', updated_at = ${SQLITE_NOW_EXPRESSION}, sync_version = 1, is_synced = 0
     WHERE id = ?`,
    [invitation.id],
  );

  // Create the member with privacy-by-default: no accounts shared
  const memberId = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO household_members (id, household_id, user_id, role, joined_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION})`,
    [memberId, invitation.householdId, userId, invitation.role, now.toISOString()],
  );

  const row = await queryOne(db, `SELECT * FROM household_members WHERE id = ?`, [memberId]);
  return row ? mapMember(row) : null;
}

/** Revoke a pending invitation (soft-delete). */
export async function revokeInvitation(db: AsyncDb, invitationId: SyncId): Promise<boolean> {
  await execute(
    db,
    `UPDATE household_invitation
       SET status = 'REVOKED', deleted_at = ${SQLITE_NOW_EXPRESSION},
           updated_at = ${SQLITE_NOW_EXPRESSION}, sync_version = 1, is_synced = 0
     WHERE id = ? AND status = 'PENDING' AND deleted_at IS NULL`,
    [invitationId],
  );
  return true;
}

// ---------------------------------------------------------------------------
// Account Sharing (#1781, #1716)
// ---------------------------------------------------------------------------

/** Input for setting account sharing mode. */
export interface SetAccountSharingInput {
  accountId: SyncId;
  householdId: SyncId;
  ownerId: SyncId;
  sharingMode: AccountSharingMode;
}

/** Get all account sharing settings for a household. */
export async function getAccountSharings(
  db: AsyncDb,
  householdId: SyncId,
): Promise<AccountSharing[]> {
  const { rows } = await query(
    db,
    `SELECT * FROM account_sharing WHERE household_id = ? AND deleted_at IS NULL`,
    [householdId],
  );
  return rows.map(mapAccountSharing);
}

/** Get sharing mode for a specific account. Returns null if not configured (defaults to PRIVATE). */
export async function getAccountSharingByAccount(
  db: AsyncDb,
  accountId: SyncId,
): Promise<AccountSharing | null> {
  const row = await queryOne(
    db,
    `SELECT * FROM account_sharing WHERE account_id = ? AND deleted_at IS NULL`,
    [accountId],
  );
  return row ? mapAccountSharing(row) : null;
}

/** Set or update sharing mode for an account. Upsert pattern. */
export async function setAccountSharing(
  db: AsyncDb,
  input: SetAccountSharingInput,
): Promise<AccountSharing> {
  const existing = await getAccountSharingByAccount(db, input.accountId);

  if (existing) {
    await execute(
      db,
      `UPDATE account_sharing
         SET sharing_mode = ?, updated_at = ${SQLITE_NOW_EXPRESSION},
             sync_version = 1, is_synced = 0
       WHERE id = ? AND deleted_at IS NULL`,
      [input.sharingMode, existing.id],
    );
    const row = await queryOne(db, `SELECT * FROM account_sharing WHERE id = ?`, [existing.id]);
    return mapAccountSharing(row!);
  }

  const id = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO account_sharing (id, account_id, household_id, owner_id, sharing_mode, created_at, updated_at, sync_version, is_synced)
     VALUES (?, ?, ?, ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION}, 1, 0)`,
    [id, input.accountId, input.householdId, input.ownerId, input.sharingMode],
  );

  const row = await queryOne(db, `SELECT * FROM account_sharing WHERE id = ?`, [id]);
  return mapAccountSharing(row!);
}

/**
 * Check whether an account is visible to a given user within a household.
 *
 * Privacy boundary enforcement (#1716):
 * - PRIVATE accounts are visible only to their owner
 * - SHARED accounts are visible to all household members
 * - Accounts with no sharing config default to PRIVATE (privacy-by-default)
 */
export async function isAccountVisibleToUser(
  db: AsyncDb,
  accountId: SyncId,
  userId: SyncId,
): Promise<boolean> {
  const sharing = await getAccountSharingByAccount(db, accountId);

  // Default to PRIVATE — privacy-by-default
  if (!sharing) return false;

  if (sharing.sharingMode === 'SHARED') return true;

  // PRIVATE — visible only to owner
  return sharing.ownerId === userId;
}

/**
 * Get all accounts visible to a user in a household context.
 * Enforces privacy boundaries: only shared accounts + user's own private accounts.
 */
export async function getVisibleAccountIds(
  db: AsyncDb,
  householdId: SyncId,
  userId: SyncId,
): Promise<SyncId[]> {
  const { rows } = await query(
    db,
    `SELECT account_id FROM account_sharing
     WHERE household_id = ? AND deleted_at IS NULL
       AND (sharing_mode = 'SHARED' OR owner_id = ?)`,
    [householdId, userId],
  );
  return rows.map((r: Row) => requireString(r.account_id, 'account_id'));
}

// ---------------------------------------------------------------------------
// Shared Budgets (#1784)
// ---------------------------------------------------------------------------

/** Input for creating or updating a shared budget. */
export interface SetSharedBudgetInput {
  householdId: SyncId;
  budgetId: SyncId;
  mode: SharedBudgetMode;
}

/** Get all shared budgets for a household. */
export async function getSharedBudgets(db: AsyncDb, householdId: SyncId): Promise<SharedBudget[]> {
  const { rows } = await query(
    db,
    `SELECT * FROM shared_budget WHERE household_id = ? AND deleted_at IS NULL`,
    [householdId],
  );
  return rows.map(mapSharedBudget);
}

/** Set or update a shared budget configuration. Upsert pattern. */
export async function setSharedBudget(
  db: AsyncDb,
  input: SetSharedBudgetInput,
): Promise<SharedBudget> {
  const existing = await queryOne(
    db,
    `SELECT * FROM shared_budget WHERE budget_id = ? AND household_id = ? AND deleted_at IS NULL`,
    [input.budgetId, input.householdId],
  );

  if (existing) {
    await execute(
      db,
      `UPDATE shared_budget
         SET mode = ?, is_active = 1, updated_at = ${SQLITE_NOW_EXPRESSION},
             sync_version = 1, is_synced = 0
       WHERE id = ?`,
      [input.mode, requireString(existing.id, 'shared_budget.id')],
    );
    const row = await queryOne(db, `SELECT * FROM shared_budget WHERE id = ?`, [
      requireString(existing.id, 'shared_budget.id'),
    ]);
    return mapSharedBudget(row!);
  }

  const id = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO shared_budget (id, household_id, budget_id, mode, is_active, created_at, updated_at, sync_version, is_synced)
     VALUES (?, ?, ?, ?, 1, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION}, 1, 0)`,
    [id, input.householdId, input.budgetId, input.mode],
  );

  const row = await queryOne(db, `SELECT * FROM shared_budget WHERE id = ?`, [id]);
  return mapSharedBudget(row!);
}

/** Deactivate (soft-delete) a shared budget. */
export async function removeSharedBudget(db: AsyncDb, sharedBudgetId: SyncId): Promise<boolean> {
  await execute(
    db,
    `UPDATE shared_budget
       SET is_active = 0, deleted_at = ${SQLITE_NOW_EXPRESSION},
           updated_at = ${SQLITE_NOW_EXPRESSION}, sync_version = 1, is_synced = 0
     WHERE id = ? AND deleted_at IS NULL`,
    [sharedBudgetId],
  );
  return true;
}

/**
 * Get budget contribution breakdown by member (stub).
 *
 * In production this joins transactions on shared accounts against
 * budget categories. For now returns an empty array — real implementation
 * requires transaction aggregation queries.
 */
export async function getBudgetContributions(
  _db: AsyncDb,
  _sharedBudgetId: SyncId,
): Promise<BudgetContribution[]> {
  // TODO: Implement transaction aggregation for contribution tracking
  return [];
}

// ---------------------------------------------------------------------------
// Shared Goals (#1786)
// ---------------------------------------------------------------------------

/** Input for sharing a goal with the household. */
export interface SetSharedGoalInput {
  householdId: SyncId;
  goalId: SyncId;
  isShared: boolean;
}

/** Get all shared goals for a household. */
export async function getSharedGoals(db: AsyncDb, householdId: SyncId): Promise<SharedGoal[]> {
  const { rows } = await query(
    db,
    `SELECT * FROM shared_goal WHERE household_id = ? AND deleted_at IS NULL AND is_shared = 1`,
    [householdId],
  );
  return rows.map(mapSharedGoal);
}

/** Set or update shared goal configuration. Upsert pattern. */
export async function setSharedGoal(db: AsyncDb, input: SetSharedGoalInput): Promise<SharedGoal> {
  const existing = await queryOne(
    db,
    `SELECT * FROM shared_goal WHERE goal_id = ? AND household_id = ? AND deleted_at IS NULL`,
    [input.goalId, input.householdId],
  );

  if (existing) {
    await execute(
      db,
      `UPDATE shared_goal
         SET is_shared = ?, updated_at = ${SQLITE_NOW_EXPRESSION},
             sync_version = 1, is_synced = 0
       WHERE id = ?`,
      [input.isShared ? 1 : 0, requireString(existing.id, 'shared_goal.id')],
    );
    const row = await queryOne(db, `SELECT * FROM shared_goal WHERE id = ?`, [
      requireString(existing.id, 'shared_goal.id'),
    ]);
    return mapSharedGoal(row!);
  }

  const id = crypto.randomUUID();
  await execute(
    db,
    `INSERT INTO shared_goal (id, household_id, goal_id, is_shared, created_at, updated_at, sync_version, is_synced)
     VALUES (?, ?, ?, ?, ${SQLITE_NOW_EXPRESSION}, ${SQLITE_NOW_EXPRESSION}, 1, 0)`,
    [id, input.householdId, input.goalId, input.isShared ? 1 : 0],
  );

  const row = await queryOne(db, `SELECT * FROM shared_goal WHERE id = ?`, [id]);
  return mapSharedGoal(row!);
}

/**
 * Get goal contribution breakdown by member (stub).
 *
 * In production this joins transaction/deposit data against goal accounts.
 * For now returns an empty array — real implementation requires
 * transaction aggregation queries.
 */
export async function getGoalContributions(
  _db: AsyncDb,
  _sharedGoalId: SyncId,
): Promise<GoalContribution[]> {
  // TODO: Implement contribution aggregation for shared goals
  return [];
}

// ---------------------------------------------------------------------------
// Permission helpers (#1780)
// ---------------------------------------------------------------------------

/** Check whether a role has a specific permission. */
export function hasPermission(role: HouseholdRole, permission: HouseholdPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Get all permissions for a role. */
export function getPermissionsForRole(role: HouseholdRole): readonly HouseholdPermission[] {
  return ROLE_PERMISSIONS[role];
}

/** Determine the role of a user within a household. Returns null if not a member. */
export async function getUserRole(
  db: AsyncDb,
  householdId: SyncId,
  userId: SyncId,
): Promise<HouseholdRole | null> {
  const row = await queryOne(
    db,
    `SELECT role FROM household_members
     WHERE household_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [householdId, userId],
  );
  return row ? (requireString(row.role, 'role') as HouseholdRole) : null;
}
