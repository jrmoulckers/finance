// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for household/family plan management.
 *
 * Provides household CRUD, member invitation with privacy-by-default,
 * role management, account sharing (mine/yours/ours), shared budgets
 * with flex/category modes, shared goals, and permission checks.
 *
 * Usage:
 * ```tsx
 * const {
 *   household,
 *   members,
 *   invitations,
 *   accountSharings,
 *   sharedBudgets,
 *   sharedGoals,
 *   inviteMember,
 *   updateMemberRole,
 *   setAccountSharing,
 * } = useHousehold();
 * ```
 *
 * References: issues #1780, #1779, #1781, #1716, #1784, #1786
 */

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type {
  AccountSharing,
  AccountSharingMode,
  Household,
  HouseholdInvitation,
  HouseholdMember,
  HouseholdPermission,
  HouseholdRole,
  SharedBudget,
  SharedBudgetMode,
  SharedGoal,
  SyncId,
} from '../kmp/bridge';
import { ROLE_PERMISSIONS } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for creating a new household. */
export interface CreateHouseholdInput {
  name: string;
}

/** Input for inviting a member to the household. */
export interface InviteMemberInput {
  email: string;
  role: HouseholdRole;
}

/** Input for setting account sharing mode. */
export interface SetAccountSharingInput {
  accountId: SyncId;
  sharingMode: AccountSharingMode;
}

/** Input for configuring a shared budget. */
export interface SetSharedBudgetInput {
  budgetId: SyncId;
  mode: SharedBudgetMode;
}

/** Input for sharing/unsharing a goal. */
export interface SetSharedGoalInput {
  goalId: SyncId;
  isShared: boolean;
}

/** Complete return shape of the useHousehold hook. */
export interface UseHouseholdResult {
  /** The current user's household, or null if none exists. */
  household: Household | null;
  /** All members of the current household. */
  members: HouseholdMember[];
  /** All invitations for the household. */
  invitations: HouseholdInvitation[];
  /** Account sharing configurations. */
  accountSharings: AccountSharing[];
  /** Shared budget configurations. */
  sharedBudgets: SharedBudget[];
  /** Shared goal configurations. */
  sharedGoals: SharedGoal[];
  /** True while loading data. */
  loading: boolean;
  /** Human-readable error message, or null. */
  error: string | null;

  // -- Household management ---
  /** Create a new household. */
  createHousehold: (input: CreateHouseholdInput) => Household | null;

  // -- Invitation flow (#1779) ---
  /** Invite a member to the household. */
  inviteMember: (input: InviteMemberInput) => HouseholdInvitation | null;
  /** Accept an invitation by invite code. */
  acceptInvitation: (inviteCode: string) => HouseholdMember | null;
  /** Revoke a pending invitation. */
  revokeInvitation: (invitationId: SyncId) => boolean;

  // -- Role management (#1780) ---
  /** Update a member's role. */
  updateMemberRole: (memberId: SyncId, role: HouseholdRole) => boolean;
  /** Remove a member from the household. */
  removeMember: (memberId: SyncId) => boolean;
  /** Check if a role has a specific permission. */
  checkPermission: (role: HouseholdRole, permission: HouseholdPermission) => boolean;

  // -- Account sharing (#1781, #1716) ---
  /** Set sharing mode for an account (PRIVATE or SHARED). */
  setAccountSharing: (input: SetAccountSharingInput) => AccountSharing | null;
  /** Check if an account is visible to the current user. */
  isAccountVisible: (accountId: SyncId) => boolean;

  // -- Shared budgets (#1784) ---
  /** Configure a shared budget with flex or category mode. */
  setSharedBudget: (input: SetSharedBudgetInput) => SharedBudget | null;
  /** Remove a shared budget configuration. */
  removeSharedBudget: (sharedBudgetId: SyncId) => boolean;

  // -- Shared goals (#1786) ---
  /** Share or unshare a goal with the household. */
  setSharedGoal: (input: SetSharedGoalInput) => SharedGoal | null;

  /** Refresh all household data. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Simulated storage (local state — bridged to SQLite repositories in production)
// ---------------------------------------------------------------------------

const STORAGE_KEY_HOUSEHOLD = 'finance-household';
const STORAGE_KEY_MEMBERS = 'finance-household-members';
const STORAGE_KEY_INVITATIONS = 'finance-household-invitations';
const STORAGE_KEY_ACCOUNT_SHARINGS = 'finance-account-sharings';
const STORAGE_KEY_SHARED_BUDGETS = 'finance-shared-budgets';
const STORAGE_KEY_SHARED_GOALS = 'finance-shared-goals';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Generate a short invite code (8 hex characters). */
function generateInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Comprehensive household management hook.
 *
 * Covers all six household-related issues:
 * - #1780: Roles and permissions (OWNER, ADMIN, MEMBER, VIEWER)
 * - #1779: Invitation flow with privacy-by-default onboarding
 * - #1781: Selective account sharing (mine/yours/ours)
 * - #1716: "Mine only" privacy boundaries
 * - #1784: Shared household budgets (flex + category modes)
 * - #1786: Shared savings goals
 */
export function useHousehold(): UseHouseholdResult {
  // Issue #1931: capture the current authenticated user so we can stamp
  // the owner member's displayName at creation time (and avoid showing
  // the raw user UUID).  `useAuth` may throw if a provider is absent
  // (e.g. some isolated unit tests that don't mount AuthProvider), so we
  // guard with a try/catch and degrade gracefully to anonymous behaviour.
  const authUser = useOptionalAuthUser();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [accountSharings, setAccountSharings] = useState<AccountSharing[]>([]);
  const [sharedBudgets, setSharedBudgets] = useState<SharedBudget[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  // -- Load data from storage on mount / refresh --
  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      setHousehold(loadFromStorage<Household | null>(STORAGE_KEY_HOUSEHOLD, null));
      setMembers(loadFromStorage<HouseholdMember[]>(STORAGE_KEY_MEMBERS, []));
      setInvitations(loadFromStorage<HouseholdInvitation[]>(STORAGE_KEY_INVITATIONS, []));
      setAccountSharings(loadFromStorage<AccountSharing[]>(STORAGE_KEY_ACCOUNT_SHARINGS, []));
      setSharedBudgets(loadFromStorage<SharedBudget[]>(STORAGE_KEY_SHARED_BUDGETS, []));
      setSharedGoals(loadFromStorage<SharedGoal[]>(STORAGE_KEY_SHARED_GOALS, []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load household data.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  // -- Household creation --
  const createHousehold = useCallback(
    (input: CreateHouseholdInput): Household | null => {
      try {
        const now = new Date().toISOString();
        // Issue #1931: when an auth user is available, use *their* id so the
        // owner member maps back to the signed-in account.  Otherwise fall
        // back to a random UUID for demo/unauth flows.
        const ownerId = authUser?.id?.trim() ? authUser.id : crypto.randomUUID();
        // Prefer the OAuth name, then email — never expose a raw UUID.
        const ownerDisplayName =
          (authUser?.name && authUser.name.trim().length > 0 ? authUser.name.trim() : null) ??
          (authUser?.email && authUser.email.trim().length > 0 ? authUser.email.trim() : null);

        const newHousehold: Household = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          ownerId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const ownerMember: HouseholdMember = {
          id: crypto.randomUUID(),
          householdId: newHousehold.id,
          userId: ownerId,
          displayName: ownerDisplayName,
          role: 'OWNER',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        saveToStorage(STORAGE_KEY_HOUSEHOLD, newHousehold);
        saveToStorage(STORAGE_KEY_MEMBERS, [ownerMember]);

        setHousehold(newHousehold);
        setMembers([ownerMember]);
        return newHousehold;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create household.');
        return null;
      }
    },
    [authUser?.id, authUser?.name, authUser?.email],
  );

  // -- Invitation flow (#1779) --
  const inviteMember = useCallback(
    (input: InviteMemberInput): HouseholdInvitation | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const invitation: HouseholdInvitation = {
          id: crypto.randomUUID(),
          householdId: household.id,
          invitedBy: household.ownerId,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          status: 'PENDING',
          inviteCode: generateInviteCode(),
          expiresAt: expiresAt.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...invitations, invitation];
        saveToStorage(STORAGE_KEY_INVITATIONS, updated);
        setInvitations(updated);
        return invitation;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to invite member.');
        return null;
      }
    },
    [household, invitations],
  );

  const acceptInvitation = useCallback(
    (inviteCode: string): HouseholdMember | null => {
      try {
        const invitation = invitations.find(
          (inv) => inv.inviteCode === inviteCode && inv.status === 'PENDING',
        );

        if (!invitation) {
          setError('Invalid or expired invitation code.');
          return null;
        }

        // Check expiry
        if (new Date(invitation.expiresAt) < new Date()) {
          const updatedInvs = invitations.map((inv) =>
            inv.id === invitation.id
              ? { ...inv, status: 'EXPIRED' as const, updatedAt: new Date().toISOString() }
              : inv,
          );
          saveToStorage(STORAGE_KEY_INVITATIONS, updatedInvs);
          setInvitations(updatedInvs);
          setError('This invitation has expired.');
          return null;
        }

        const now = new Date().toISOString();

        // Privacy-by-default: new member joins with no shared accounts
        const newMember: HouseholdMember = {
          id: crypto.randomUUID(),
          householdId: invitation.householdId,
          userId: crypto.randomUUID(),
          displayName: null,
          role: invitation.role,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        // Mark invitation as accepted
        const updatedInvs = invitations.map((inv) =>
          inv.id === invitation.id ? { ...inv, status: 'ACCEPTED' as const, updatedAt: now } : inv,
        );

        const updatedMembers = [...members, newMember];

        saveToStorage(STORAGE_KEY_INVITATIONS, updatedInvs);
        saveToStorage(STORAGE_KEY_MEMBERS, updatedMembers);
        setInvitations(updatedInvs);
        setMembers(updatedMembers);

        return newMember;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept invitation.');
        return null;
      }
    },
    [invitations, members],
  );

  const revokeInvitation = useCallback(
    (invitationId: SyncId): boolean => {
      try {
        const updated = invitations.map((inv) =>
          inv.id === invitationId && inv.status === 'PENDING'
            ? {
                ...inv,
                status: 'REVOKED' as const,
                updatedAt: new Date().toISOString(),
                deletedAt: new Date().toISOString(),
              }
            : inv,
        );
        const changed = updated.some((inv, i) => inv !== invitations[i]);
        if (!changed) return false;
        saveToStorage(STORAGE_KEY_INVITATIONS, updated);
        setInvitations(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke invitation.');
        return false;
      }
    },
    [invitations],
  );

  // -- Role management (#1780) --
  const updateMemberRole = useCallback(
    (memberId: SyncId, role: HouseholdRole): boolean => {
      try {
        const updated = members.map((m) =>
          m.id === memberId ? { ...m, role, updatedAt: new Date().toISOString() } : m,
        );
        const changed = updated.some((m, i) => m !== members[i]);
        if (!changed) return false;
        saveToStorage(STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update member role.');
        return false;
      }
    },
    [members],
  );

  const removeMember = useCallback(
    (memberId: SyncId): boolean => {
      try {
        const updated = members.filter((m) => m.id !== memberId);
        if (updated.length === members.length) return false;
        saveToStorage(STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove member.');
        return false;
      }
    },
    [members],
  );

  const checkPermission = useCallback(
    (role: HouseholdRole, permission: HouseholdPermission): boolean => {
      return ROLE_PERMISSIONS[role].includes(permission);
    },
    [],
  );

  // -- Account sharing (#1781, #1716) --
  const setAccountSharingFn = useCallback(
    (input: SetAccountSharingInput): AccountSharing | null => {
      if (!household) {
        setError('No household exists.');
        return null;
      }

      try {
        const now = new Date().toISOString();
        const existing = accountSharings.find((as) => as.accountId === input.accountId);

        if (existing) {
          const updated = accountSharings.map((as) =>
            as.accountId === input.accountId
              ? { ...as, sharingMode: input.sharingMode, updatedAt: now }
              : as,
          );
          saveToStorage(STORAGE_KEY_ACCOUNT_SHARINGS, updated);
          setAccountSharings(updated);
          return updated.find((as) => as.accountId === input.accountId) ?? null;
        }

        const newSharing: AccountSharing = {
          id: crypto.randomUUID(),
          accountId: input.accountId,
          householdId: household.id,
          ownerId: household.ownerId,
          sharingMode: input.sharingMode,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...accountSharings, newSharing];
        saveToStorage(STORAGE_KEY_ACCOUNT_SHARINGS, updated);
        setAccountSharings(updated);
        return newSharing;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update account sharing.');
        return null;
      }
    },
    [household, accountSharings],
  );

  const isAccountVisible = useCallback(
    (accountId: SyncId): boolean => {
      const sharing = accountSharings.find((as) => as.accountId === accountId);
      // Privacy-by-default: no sharing config means PRIVATE
      if (!sharing) return false;
      if (sharing.sharingMode === 'SHARED') return true;
      // PRIVATE — only visible to owner
      return sharing.ownerId === household?.ownerId;
    },
    [accountSharings, household],
  );

  // -- Shared budgets (#1784) --
  const setSharedBudgetFn = useCallback(
    (input: SetSharedBudgetInput): SharedBudget | null => {
      if (!household) {
        setError('No household exists.');
        return null;
      }

      try {
        const now = new Date().toISOString();
        const existing = sharedBudgets.find((sb) => sb.budgetId === input.budgetId);

        if (existing) {
          const updated = sharedBudgets.map((sb) =>
            sb.budgetId === input.budgetId
              ? { ...sb, mode: input.mode, isActive: true, updatedAt: now }
              : sb,
          );
          saveToStorage(STORAGE_KEY_SHARED_BUDGETS, updated);
          setSharedBudgets(updated);
          return updated.find((sb) => sb.budgetId === input.budgetId) ?? null;
        }

        const newSharedBudget: SharedBudget = {
          id: crypto.randomUUID(),
          householdId: household.id,
          budgetId: input.budgetId,
          mode: input.mode,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...sharedBudgets, newSharedBudget];
        saveToStorage(STORAGE_KEY_SHARED_BUDGETS, updated);
        setSharedBudgets(updated);
        return newSharedBudget;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set shared budget.');
        return null;
      }
    },
    [household, sharedBudgets],
  );

  const removeSharedBudget = useCallback(
    (sharedBudgetId: SyncId): boolean => {
      try {
        const updated = sharedBudgets.filter((sb) => sb.id !== sharedBudgetId);
        if (updated.length === sharedBudgets.length) return false;
        saveToStorage(STORAGE_KEY_SHARED_BUDGETS, updated);
        setSharedBudgets(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove shared budget.');
        return false;
      }
    },
    [sharedBudgets],
  );

  // -- Shared goals (#1786) --
  const setSharedGoalFn = useCallback(
    (input: SetSharedGoalInput): SharedGoal | null => {
      if (!household) {
        setError('No household exists.');
        return null;
      }

      try {
        const now = new Date().toISOString();
        const existing = sharedGoals.find((sg) => sg.goalId === input.goalId);

        if (existing) {
          const updated = sharedGoals.map((sg) =>
            sg.goalId === input.goalId ? { ...sg, isShared: input.isShared, updatedAt: now } : sg,
          );
          saveToStorage(STORAGE_KEY_SHARED_GOALS, updated);
          setSharedGoals(updated);
          return updated.find((sg) => sg.goalId === input.goalId) ?? null;
        }

        const newSharedGoal: SharedGoal = {
          id: crypto.randomUUID(),
          householdId: household.id,
          goalId: input.goalId,
          isShared: input.isShared,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...sharedGoals, newSharedGoal];
        saveToStorage(STORAGE_KEY_SHARED_GOALS, updated);
        setSharedGoals(updated);
        return newSharedGoal;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set shared goal.');
        return null;
      }
    },
    [household, sharedGoals],
  );

  return {
    household,
    members,
    invitations,
    accountSharings,
    sharedBudgets,
    sharedGoals,
    loading,
    error,
    createHousehold,
    inviteMember,
    acceptInvitation,
    revokeInvitation,
    updateMemberRole,
    removeMember,
    checkPermission,
    setAccountSharing: setAccountSharingFn,
    isAccountVisible,
    setSharedBudget: setSharedBudgetFn,
    removeSharedBudget,
    setSharedGoal: setSharedGoalFn,
    refresh,
  };
}

/**
 * Read the current auth user without throwing when no AuthProvider is mounted.
 *
 * The auth context throws by design (so misuse is caught early), but the
 * household hook is also exercised in unit tests that intentionally mount
 * components in isolation.  We swallow that error and return `null` rather
 * than forcing every test to wrap children in `<AuthProvider>`.
 *
 * Issue #1931.
 */
function useOptionalAuthUser(): { id: string; email: string; name?: string } | null {
  try {
    return useAuth().user;
  } catch {
    return null;
  }
}
