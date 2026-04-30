// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for household/family plan management.
 *
 * Provides household CRUD, member invitation, role management,
 * and shared vs personal budget toggling.
 *
 * Usage:
 * ```tsx
 * const { household, members, inviteMember, updateRole } = useHousehold();
 * ```
 *
 * References: issue #339
 */

import { useCallback, useEffect, useState } from 'react';

import type { Household, HouseholdMember, HouseholdRole, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HouseholdInvitation {
  readonly id: string;
  readonly householdId: SyncId;
  readonly email: string;
  readonly role: HouseholdRole;
  readonly status: 'pending' | 'accepted' | 'expired';
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CreateHouseholdInput {
  name: string;
}

export interface InviteMemberInput {
  email: string;
  role: HouseholdRole;
}

export interface BudgetVisibility {
  budgetId: SyncId;
  isShared: boolean;
}

export interface UseHouseholdResult {
  /** The current user's household, or null if none exists. */
  household: Household | null;
  /** All members of the current household. */
  members: HouseholdMember[];
  /** Pending invitations for the household. */
  invitations: HouseholdInvitation[];
  /** Budget visibility settings (shared vs personal). */
  budgetVisibility: BudgetVisibility[];
  /** True while loading data. */
  loading: boolean;
  /** Human-readable error message, or null. */
  error: string | null;
  /** Create a new household. */
  createHousehold: (input: CreateHouseholdInput) => Household | null;
  /** Invite a member to the household. */
  inviteMember: (input: InviteMemberInput) => HouseholdInvitation | null;
  /** Revoke a pending invitation. */
  revokeInvitation: (invitationId: string) => boolean;
  /** Update a member's role. */
  updateMemberRole: (memberId: SyncId, role: HouseholdRole) => boolean;
  /** Remove a member from the household. */
  removeMember: (memberId: SyncId) => boolean;
  /** Toggle a budget between shared and personal. */
  toggleBudgetVisibility: (budgetId: SyncId) => boolean;
  /** Refresh all household data. */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Simulated storage (local state — bridged to SQLite in production)
// ---------------------------------------------------------------------------

const STORAGE_KEY_HOUSEHOLD = 'finance-household';
const STORAGE_KEY_MEMBERS = 'finance-household-members';
const STORAGE_KEY_INVITATIONS = 'finance-household-invitations';
const STORAGE_KEY_BUDGET_VIS = 'finance-budget-visibility';

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHousehold(): UseHouseholdResult {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [budgetVisibility, setBudgetVisibility] = useState<BudgetVisibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const hh = loadFromStorage<Household | null>(STORAGE_KEY_HOUSEHOLD, null);
      const mems = loadFromStorage<HouseholdMember[]>(STORAGE_KEY_MEMBERS, []);
      const invs = loadFromStorage<HouseholdInvitation[]>(STORAGE_KEY_INVITATIONS, []);
      const vis = loadFromStorage<BudgetVisibility[]>(STORAGE_KEY_BUDGET_VIS, []);

      setHousehold(hh);
      setMembers(mems);
      setInvitations(invs);
      setBudgetVisibility(vis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load household data.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const createHousehold = useCallback((input: CreateHouseholdInput): Household | null => {
    try {
      const now = new Date().toISOString();
      const ownerId = crypto.randomUUID();
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
  }, []);

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
          email: input.email.trim().toLowerCase(),
          role: input.role,
          status: 'pending',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
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

  const revokeInvitation = useCallback(
    (invitationId: string): boolean => {
      try {
        const updated = invitations.filter((inv) => inv.id !== invitationId);
        if (updated.length === invitations.length) return false;
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

  const toggleBudgetVisibility = useCallback(
    (budgetId: SyncId): boolean => {
      try {
        const existing = budgetVisibility.find((bv) => bv.budgetId === budgetId);
        let updated: BudgetVisibility[];
        if (existing) {
          updated = budgetVisibility.map((bv) =>
            bv.budgetId === budgetId ? { ...bv, isShared: !bv.isShared } : bv,
          );
        } else {
          updated = [...budgetVisibility, { budgetId, isShared: true }];
        }
        saveToStorage(STORAGE_KEY_BUDGET_VIS, updated);
        setBudgetVisibility(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle budget visibility.');
        return false;
      }
    },
    [budgetVisibility],
  );

  return {
    household,
    members,
    invitations,
    budgetVisibility,
    loading,
    error,
    createHousehold,
    inviteMember,
    revokeInvitation,
    updateMemberRole,
    removeMember,
    toggleBudgetVisibility,
    refresh,
  };
}
