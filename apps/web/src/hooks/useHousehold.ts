// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for household/family plan management.
 *
 * Provides household CRUD, member invitation with privacy-by-default,
 * trusted helper read-only access, role management, account sharing (mine/yours/ours), shared budgets
 * with flex/category modes, shared goals, roommate shared expenses, settle-up balances, and permission checks.
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
 * References: issues #1780, #1779, #1781, #1716, #1784, #1786, #2144, #2156
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import type {
  AddChildChoreInput,
  ChildProfile,
  Chore,
  CreateChildProfileInput,
  LinkChildCollegeFundInput,
  RecordChildWithdrawalInput,
} from './householdKids';
import {
  addChoreToChildren,
  applyHouseholdKidsWeeklyProcessing,
  buildChildProfile,
  linkCollegeFundGoalForChildren,
  normalizeChildProfile,
  recordChildWithdrawalForChildren,
  toggleChoreCompletionForChildren,
} from './householdKids';
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

/** Friendly local-first ways a read-only trusted helper can access shared finances. */
export type TrustedHelperAccessMethod = 'SHARED_DEVICE' | 'READ_ONLY_SUMMARY' | 'INVITE_LATER';

/** Input for adding a trusted helper as a read-only VIEWER household member. */
export interface AddTrustedHelperInput {
  name: string;
  accessMethod: TrustedHelperAccessMethod;
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

export type SharedExpenseSplitMode = 'EQUAL' | 'CUSTOM';

export interface SharedExpenseSplit {
  memberId: SyncId;
  amount: number;
}

export interface SharedExpense {
  id: SyncId;
  householdId: SyncId;
  description: string;
  amount: number;
  paidByMemberId: SyncId;
  splitMode: SharedExpenseSplitMode;
  splits: SharedExpenseSplit[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface SharedSettlement {
  id: SyncId;
  householdId: SyncId;
  fromMemberId: SyncId;
  toMemberId: SyncId;
  amount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface SharedExpenseBalance {
  memberId: SyncId;
  paid: number;
  share: number;
  settledPaid: number;
  settledReceived: number;
  netBalance: number;
}

export interface SettleUpSuggestion {
  fromMemberId: SyncId;
  toMemberId: SyncId;
  amount: number;
}

export interface LogSharedExpenseInput {
  description: string;
  amount: number;
  paidByMemberId: SyncId;
  splitMode: SharedExpenseSplitMode;
  splits: SharedExpenseSplit[];
}

export interface RecordSharedSettlementInput {
  fromMemberId: SyncId;
  toMemberId: SyncId;
  amount: number;
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
  /** Shared roommate expenses. */
  sharedExpenses: SharedExpense[];
  /** Recorded settle-up payments. */
  sharedSettlements: SharedSettlement[];
  /** Net member balances after expenses and settlements. Positive means the member is owed. */
  sharedExpenseBalances: SharedExpenseBalance[];
  /** Simplified payments that settle outstanding balances. */
  settleUpSuggestions: SettleUpSuggestion[];
  /** Child allowance and chore tracking profiles. */
  children: ChildProfile[];
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

  // -- Trusted helper flow (#2156) ---
  /** Add a trusted helper as a read-only VIEWER household member. */
  addTrustedHelper: (input: AddTrustedHelperInput) => HouseholdMember | null;

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

  // -- Shared expenses & settle-up (#2144) ---
  /** Log a shared expense split across household members. */
  logSharedExpense: (input: LogSharedExpenseInput) => SharedExpense | null;
  /** Record a settle-up payment between two members. */
  recordSharedSettlement: (input: RecordSharedSettlementInput) => SharedSettlement | null;

  // -- Kids & allowances (#2200) ---
  /** Create a child profile for chore and allowance tracking. */
  createChildProfile: (input: CreateChildProfileInput) => ChildProfile | null;
  /** Add a chore to a child profile. */
  addChildChore: (input: AddChildChoreInput) => Chore | null;
  /** Toggle a chore's completion state for the current week. */
  toggleChildChoreCompletion: (childId: SyncId, choreId: SyncId) => boolean;
  /** Record a balance withdrawal for a child. */
  recordChildWithdrawal: (input: RecordChildWithdrawalInput) => ChildProfile | null;
  /** Link a dedicated college fund goal to a child profile. */
  linkChildCollegeFundGoal: (input: LinkChildCollegeFundInput) => ChildProfile | null;

  /** Refresh all household data. */
  refresh: () => void;
}

/** Stable demo seed used to distribute shared-budget pace across members. */
export interface HouseholdScorecardSeed {
  readonly memberWeight: number;
  readonly paceOffset: number;
}

const SCORECARD_PACE_OFFSETS = [-0.1, 0.18, 0.08, -0.02] as const;

/**
 * Return deterministic local-first scorecard seeds for household members.
 *
 * The scorecard is currently demo-backed, so we use small role-aware weight
 * and pace offsets to create believable per-member pacing until real member-
 * level budget attribution lands.
 */
export function getHouseholdScorecardSeeds(
  members: readonly Pick<HouseholdMember, 'role'>[],
): HouseholdScorecardSeed[] {
  if (members.length === 0) {
    return [];
  }

  if (members.length === 1) {
    return [{ memberWeight: 1, paceOffset: 0 }];
  }

  const rawWeights = members.map((member, index) => {
    const roleBias = member.role === 'OWNER' ? 0.15 : member.role === 'ADMIN' ? 0.08 : 0;
    return Math.max(0.7, 1 + roleBias - index * 0.04);
  });
  const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0) || members.length;

  return members.map((_, index) => ({
    memberWeight: rawWeights[index] / totalWeight,
    paceOffset: SCORECARD_PACE_OFFSETS[index % SCORECARD_PACE_OFFSETS.length] ?? 0,
  }));
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
const STORAGE_KEY_SHARED_EXPENSES = 'finance-household-shared-expenses';
const STORAGE_KEY_SHARED_SETTLEMENTS = 'finance-household-shared-settlements';
const STORAGE_KEY_CHILDREN = 'finance-household-children';

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

function toCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function normalizeMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function createEqualSharedExpenseSplits(
  totalAmount: number,
  memberIds: readonly SyncId[],
): SharedExpenseSplit[] {
  const uniqueMemberIds = Array.from(new Set(memberIds.filter(Boolean)));
  const totalCents = toCents(totalAmount);

  if (totalCents <= 0) {
    throw new RangeError('Shared expense amount must be greater than zero.');
  }

  if (uniqueMemberIds.length === 0) {
    throw new RangeError('Select at least one member to split the expense.');
  }

  const baseCents = Math.floor(totalCents / uniqueMemberIds.length);
  const remainderCents = totalCents % uniqueMemberIds.length;

  return uniqueMemberIds.map((memberId, index) => ({
    memberId,
    amount: fromCents(baseCents + (index < remainderCents ? 1 : 0)),
  }));
}

export function calculateSharedExpenseBalances(
  memberIds: readonly SyncId[],
  expenses: readonly SharedExpense[],
  settlements: readonly SharedSettlement[],
): SharedExpenseBalance[] {
  const entries = new Map<
    SyncId,
    { paid: number; share: number; settledPaid: number; settledReceived: number; net: number }
  >();

  for (const memberId of memberIds) {
    if (memberId) {
      entries.set(memberId, { paid: 0, share: 0, settledPaid: 0, settledReceived: 0, net: 0 });
    }
  }

  for (const expense of expenses) {
    const amountCents = toCents(expense.amount);
    const payer = entries.get(expense.paidByMemberId);
    if (payer) {
      payer.paid += amountCents;
      payer.net += amountCents;
    }

    for (const split of expense.splits) {
      const member = entries.get(split.memberId);
      if (member) {
        const splitCents = toCents(split.amount);
        member.share += splitCents;
        member.net -= splitCents;
      }
    }
  }

  for (const settlement of settlements) {
    const amountCents = toCents(settlement.amount);
    const fromMember = entries.get(settlement.fromMemberId);
    const toMember = entries.get(settlement.toMemberId);

    if (fromMember) {
      fromMember.settledPaid += amountCents;
      fromMember.net += amountCents;
    }

    if (toMember) {
      toMember.settledReceived += amountCents;
      toMember.net -= amountCents;
    }
  }

  return Array.from(entries.entries()).map(([memberId, entry]) => ({
    memberId,
    paid: fromCents(entry.paid),
    share: fromCents(entry.share),
    settledPaid: fromCents(entry.settledPaid),
    settledReceived: fromCents(entry.settledReceived),
    netBalance: fromCents(entry.net),
  }));
}

export function simplifySettleUpBalances(
  balances: readonly Pick<SharedExpenseBalance, 'memberId' | 'netBalance'>[],
): SettleUpSuggestion[] {
  const debtors = balances
    .map((balance) => ({ memberId: balance.memberId, cents: toCents(balance.netBalance) }))
    .filter((balance) => balance.cents < 0)
    .sort((a, b) => a.cents - b.cents);
  const creditors = balances
    .map((balance) => ({ memberId: balance.memberId, cents: toCents(balance.netBalance) }))
    .filter((balance) => balance.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const suggestions: SettleUpSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    if (!debtor || !creditor) {
      break;
    }

    const amountCents = Math.min(-debtor.cents, creditor.cents);
    if (amountCents > 0) {
      suggestions.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: fromCents(amountCents),
      });
    }

    debtor.cents += amountCents;
    creditor.cents -= amountCents;

    if (debtor.cents === 0) {
      debtorIndex += 1;
    }
    if (creditor.cents === 0) {
      creditorIndex += 1;
    }
  }

  return suggestions;
}

function validateSharedExpenseInput(input: LogSharedExpenseInput): string | null {
  if (!input.description.trim()) {
    return 'Expense description is required.';
  }

  const amountCents = toCents(input.amount);
  if (amountCents <= 0) {
    return 'Shared expense amount must be greater than zero.';
  }

  if (!input.paidByMemberId) {
    return 'Choose who paid.';
  }

  if (input.splits.length === 0) {
    return 'Select at least one member to split the expense.';
  }

  const splitTotalCents = input.splits.reduce((sum, split) => sum + toCents(split.amount), 0);
  if (splitTotalCents !== amountCents) {
    return 'Split amounts must add up to the total expense.';
  }

  if (input.splits.some((split) => !split.memberId || toCents(split.amount) < 0)) {
    return 'Split amounts must be zero or more for selected members.';
  }

  return null;
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
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [sharedSettlements, setSharedSettlements] = useState<SharedSettlement[]>([]);
  const [children, setChildren] = useState<ChildProfile[]>([]);
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
      setSharedExpenses(loadFromStorage<SharedExpense[]>(STORAGE_KEY_SHARED_EXPENSES, []));
      setSharedSettlements(loadFromStorage<SharedSettlement[]>(STORAGE_KEY_SHARED_SETTLEMENTS, []));

      const storedChildren = loadFromStorage<ChildProfile[]>(STORAGE_KEY_CHILDREN, []).map(
        normalizeChildProfile,
      );
      const processedChildren = applyHouseholdKidsWeeklyProcessing(storedChildren);
      setChildren(processedChildren);

      if (JSON.stringify(storedChildren) !== JSON.stringify(processedChildren)) {
        saveToStorage(STORAGE_KEY_CHILDREN, processedChildren);
      }
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
        saveToStorage(STORAGE_KEY_SHARED_EXPENSES, []);
        saveToStorage(STORAGE_KEY_SHARED_SETTLEMENTS, []);

        setHousehold(newHousehold);
        setMembers([ownerMember]);
        setSharedExpenses([]);
        setSharedSettlements([]);
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

  // -- Trusted helper flow (#2156) --
  const addTrustedHelper = useCallback(
    (input: AddTrustedHelperInput): HouseholdMember | null => {
      if (!household) {
        setError('Create a household before adding a trusted helper.');
        return null;
      }

      const name = input.name.trim();
      if (!name) {
        setError('Trusted helper name is required.');
        return null;
      }

      try {
        const now = new Date().toISOString();
        const helper: HouseholdMember = {
          id: crypto.randomUUID(),
          householdId: household.id,
          userId: crypto.randomUUID(),
          displayName: name,
          role: 'VIEWER',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...members, helper];
        saveToStorage(STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        setError(null);
        return helper;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add trusted helper.');
        return null;
      }
    },
    [household, members],
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

  const sharedExpenseBalances = useMemo(
    () =>
      calculateSharedExpenseBalances(
        members.map((member) => member.id),
        sharedExpenses,
        sharedSettlements,
      ),
    [members, sharedExpenses, sharedSettlements],
  );

  const settleUpSuggestions = useMemo(
    () => simplifySettleUpBalances(sharedExpenseBalances),
    [sharedExpenseBalances],
  );

  const logSharedExpense = useCallback(
    (input: LogSharedExpenseInput): SharedExpense | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      const validationError = validateSharedExpenseInput(input);
      if (validationError) {
        setError(validationError);
        return null;
      }

      try {
        const now = new Date().toISOString();
        const expense: SharedExpense = {
          id: crypto.randomUUID(),
          householdId: household.id,
          description: input.description.trim(),
          amount: normalizeMoney(input.amount),
          paidByMemberId: input.paidByMemberId,
          splitMode: input.splitMode,
          splits: input.splits.map((split) => ({
            memberId: split.memberId,
            amount: normalizeMoney(split.amount),
          })),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...sharedExpenses, expense];
        saveToStorage(STORAGE_KEY_SHARED_EXPENSES, updated);
        setSharedExpenses(updated);
        setError(null);
        return expense;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to log shared expense.');
        return null;
      }
    },
    [household, sharedExpenses],
  );

  const recordSharedSettlement = useCallback(
    (input: RecordSharedSettlementInput): SharedSettlement | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      const amountCents = toCents(input.amount);
      if (!input.fromMemberId || !input.toMemberId || input.fromMemberId === input.toMemberId) {
        setError('Choose two different members for the settlement.');
        return null;
      }

      if (amountCents <= 0) {
        setError('Settlement amount must be greater than zero.');
        return null;
      }

      try {
        const now = new Date().toISOString();
        const settlement: SharedSettlement = {
          id: crypto.randomUUID(),
          householdId: household.id,
          fromMemberId: input.fromMemberId,
          toMemberId: input.toMemberId,
          amount: fromCents(amountCents),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updated = [...sharedSettlements, settlement];
        saveToStorage(STORAGE_KEY_SHARED_SETTLEMENTS, updated);
        setSharedSettlements(updated);
        setError(null);
        return settlement;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record settlement.');
        return null;
      }
    },
    [household, sharedSettlements],
  );

  const createChildProfile = useCallback(
    (input: CreateChildProfileInput): ChildProfile | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      try {
        const newChild = buildChildProfile(input, crypto.randomUUID());
        const updated = [...applyHouseholdKidsWeeklyProcessing(children), newChild];
        saveToStorage(STORAGE_KEY_CHILDREN, updated);
        setChildren(updated);
        return newChild;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create child profile.');
        return null;
      }
    },
    [children, household],
  );

  const addChildChore = useCallback(
    (input: AddChildChoreInput): Chore | null => {
      try {
        const { children: updated, chore } = addChoreToChildren(
          children,
          input,
          crypto.randomUUID(),
        );
        if (!chore) {
          setError('Child profile not found.');
          return null;
        }

        saveToStorage(STORAGE_KEY_CHILDREN, updated);
        setChildren(updated);
        return chore;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add child chore.');
        return null;
      }
    },
    [children],
  );

  const toggleChildChoreCompletion = useCallback(
    (childId: SyncId, choreId: SyncId): boolean => {
      try {
        const updated = toggleChoreCompletionForChildren(children, childId, choreId);
        if (JSON.stringify(updated) === JSON.stringify(children)) {
          return false;
        }

        saveToStorage(STORAGE_KEY_CHILDREN, updated);
        setChildren(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update chore completion.');
        return false;
      }
    },
    [children],
  );

  const recordChildWithdrawal = useCallback(
    (input: RecordChildWithdrawalInput): ChildProfile | null => {
      try {
        const updated = recordChildWithdrawalForChildren(children, input.childId, input.amount);
        const child = updated.find((entry) => entry.id === input.childId) ?? null;
        if (!child) {
          setError('Child profile not found.');
          return null;
        }

        saveToStorage(STORAGE_KEY_CHILDREN, updated);
        setChildren(updated);
        return child;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record withdrawal.');
        return null;
      }
    },
    [children],
  );

  const linkChildCollegeFundGoal = useCallback(
    (input: LinkChildCollegeFundInput): ChildProfile | null => {
      try {
        const updated = linkCollegeFundGoalForChildren(children, input);
        const child = updated.find((entry) => entry.id === input.childId) ?? null;
        if (!child) {
          setError('Child profile not found.');
          return null;
        }

        saveToStorage(STORAGE_KEY_CHILDREN, updated);
        setChildren(updated);
        return child;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to link college fund.');
        return null;
      }
    },
    [children],
  );

  return {
    household,
    members,
    invitations,
    accountSharings,
    sharedBudgets,
    sharedGoals,
    sharedExpenses,
    sharedSettlements,
    sharedExpenseBalances,
    settleUpSuggestions,
    children,
    loading,
    error,
    createHousehold,
    inviteMember,
    acceptInvitation,
    revokeInvitation,
    addTrustedHelper,
    updateMemberRole,
    removeMember,
    checkPermission,
    setAccountSharing: setAccountSharingFn,
    isAccountVisible,
    setSharedBudget: setSharedBudgetFn,
    removeSharedBudget,
    setSharedGoal: setSharedGoalFn,
    logSharedExpense,
    recordSharedSettlement,
    createChildProfile,
    addChildChore,
    toggleChildChoreCompletion,
    recordChildWithdrawal,
    linkChildCollegeFundGoal,
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
