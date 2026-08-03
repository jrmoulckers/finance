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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/auth-context';
import { useDatabase } from '../db/DatabaseProvider';
import { readHouseholdValue, writeHouseholdValue } from '../db/repositories/householdData';
import { ensureSyncedHouseholdMembership } from '../db/repositories/household';
import type { AsyncDb } from '../db/async-db';
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

/**
 * Discriminated outcome of an attempt to accept a household invitation (#3377).
 *
 * The accept screen needs to distinguish *why* an acceptance did or didn't
 * succeed so it can render precise, accessible messaging (not-found vs expired
 * vs revoked vs already-joined) instead of a single opaque error.
 */
export type AcceptInvitationResult =
  /** Joined successfully — `member` is the newly created membership. */
  | { status: 'ACCEPTED'; member: HouseholdMember }
  /** The current user was already a member of this household — idempotent no-op. */
  | { status: 'ALREADY_MEMBER'; member: HouseholdMember }
  /** No invitation matched the supplied code (wrong/expired link, not yet synced). */
  | { status: 'NOT_FOUND' }
  /** The invitation was already accepted (by this or another device). */
  | { status: 'ALREADY_ACCEPTED' }
  /** The invitation's expiry has passed. */
  | { status: 'EXPIRED' }
  /** The inviter revoked the invitation before it was accepted. */
  | { status: 'REVOKED' }
  /** An unexpected error occurred while accepting. */
  | { status: 'ERROR'; message: string };

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

export type HouseholdActivityType =
  | 'MEMBERS'
  | 'ACCOUNTS'
  | 'BUDGETS'
  | 'EXPENSES'
  | 'SETTLEMENTS'
  | 'GOALS'
  | 'KIDS'
  | 'BILLS'
  | 'RECONCILIATION'
  | 'SHOPPING';

export type HouseholdActivityPrivacy = 'PUBLIC' | 'AGGREGATED' | 'REDACTED';

export interface HouseholdActivityEvent {
  id: SyncId;
  householdId: SyncId;
  actorMemberId: SyncId | null;
  type: HouseholdActivityType;
  action: string;
  affectedObjectType: string;
  affectedObjectId: SyncId | null;
  summary: string;
  detail: string | null;
  privacy: HouseholdActivityPrivacy;
  createdAt: string;
  syncVersion: number;
  isSynced: boolean;
}

export type RecurringBillCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type PayerRotationMode = 'FIXED' | 'ROUND_ROBIN' | 'WEIGHTED';
export type RecurringBillCycleStatus = 'UPCOMING' | 'PAID' | 'SKIPPED';
export type RecurringBillSettlementStatus = 'NONE' | 'OPEN' | 'SETTLED';

export interface RecurringSharedBillCycle {
  id: SyncId;
  billId: SyncId;
  dueDate: string;
  payerMemberId: SyncId;
  amount: number;
  status: RecurringBillCycleStatus;
  skippedReason: string | null;
  sharedExpenseId: SyncId | null;
  settlementStatus: RecurringBillSettlementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSharedBill {
  id: SyncId;
  householdId: SyncId;
  name: string;
  estimatedAmount: number;
  dueDay: number;
  cadence: RecurringBillCadence;
  splitMode: SharedExpenseSplitMode;
  splitMemberIds: SyncId[];
  /**
   * Per-member custom split amounts (dollars) used when `splitMode` is `CUSTOM`
   * (#3384). Amounts are relative to `estimatedAmount` and scaled to each cycle's
   * actual amount when a payment is recorded. Absent for EQUAL bills.
   */
  customSplits?: SharedExpenseSplit[];
  defaultPayerMemberId: SyncId;
  rotationMode: PayerRotationMode;
  payerRotationMemberIds: SyncId[];
  rotationWeights: Record<SyncId, number>;
  paused: boolean;
  cycles: RecurringSharedBillCycle[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface CreateRecurringSharedBillInput {
  name: string;
  estimatedAmount: number;
  dueDay: number;
  cadence: RecurringBillCadence;
  splitMode?: SharedExpenseSplitMode;
  splitMemberIds: SyncId[];
  /** Per-member custom split amounts (dollars) when `splitMode` is `CUSTOM` (#3384). */
  customSplits?: SharedExpenseSplit[];
  defaultPayerMemberId: SyncId;
  rotationMode: PayerRotationMode;
  payerRotationMemberIds?: SyncId[];
  rotationWeights?: Record<SyncId, number>;
}

/**
 * Fields that can be edited on an existing recurring shared bill (#3385). Every
 * field is optional; only provided fields are changed.
 */
export interface UpdateRecurringBillInput {
  billId: SyncId;
  name?: string;
  estimatedAmount?: number;
  dueDay?: number;
  cadence?: RecurringBillCadence;
  splitMode?: SharedExpenseSplitMode;
  splitMemberIds?: SyncId[];
  customSplits?: SharedExpenseSplit[];
  defaultPayerMemberId?: SyncId;
}

export interface UpdateRecurringBillCycleInput {
  billId: SyncId;
  cycleId: SyncId;
  status?: RecurringBillCycleStatus;
  payerMemberId?: SyncId;
  amount?: number;
  skippedReason?: string | null;
  settlementStatus?: RecurringBillSettlementStatus;
}

export interface MarkRecurringBillCyclePaidInput {
  billId: SyncId;
  cycleId: SyncId;
  amount?: number;
}

export interface RecurringBillReminder {
  billId: SyncId;
  cycleId: SyncId | null;
  name: string;
  dueDate: string;
  payerMemberId: SyncId;
  amount: number;
  participantMemberIds: SyncId[];
  paused: boolean;
  status: RecurringBillCycleStatus;
}

export type GoalPledgeType = 'FIXED' | 'PERCENTAGE' | 'SCHEDULE';
export type GoalPledgeCadence = 'MONTHLY' | 'ONE_TIME' | 'CUSTOM';

export interface GoalPledgeScheduleEntry {
  dueDate: string;
  amount: number;
}

export interface GoalPledgeHistoryEntry {
  changedAt: string;
  changedByMemberId: SyncId | null;
  summary: string;
}

export interface GoalContributionPledge {
  id: SyncId;
  householdId: SyncId;
  goalId: SyncId;
  memberId: SyncId;
  pledgeType: GoalPledgeType;
  pledgedAmount: number;
  pledgedPercent: number | null;
  cadence: GoalPledgeCadence;
  schedule: GoalPledgeScheduleEntry[];
  contributedAmount: number;
  nextDueDate: string | null;
  history: GoalPledgeHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface SetGoalContributionPledgeInput {
  goalId: SyncId;
  memberId: SyncId;
  pledgeType: GoalPledgeType;
  pledgedAmount: number;
  pledgedPercent?: number | null;
  cadence?: GoalPledgeCadence;
  schedule?: GoalPledgeScheduleEntry[];
  nextDueDate?: string | null;
}

export interface RecordGoalContributionInput {
  goalId: SyncId;
  memberId: SyncId;
  amount: number;
  contributedAt?: string;
  note?: string;
}

export interface GoalPledgeMemberProgress {
  memberId: SyncId;
  pledgedAmount: number;
  contributedAmount: number;
  remainingAmount: number;
  catchUpRecommendation: number;
}

export interface GoalPledgeProgress {
  goalId: SyncId;
  totalPledged: number;
  totalContributed: number;
  totalRemaining: number;
  members: GoalPledgeMemberProgress[];
}

export type ShoppingTripAllocation = 'REIMBURSABLE' | 'SHARED' | 'PERSONAL';

export interface SharedShoppingTrip {
  id: SyncId;
  shoppingBudgetId: SyncId;
  store: string;
  receiptTotal: number;
  payerMemberId: SyncId;
  allocation: ShoppingTripAllocation;
  receiptRef: string | null;
  sharedExpenseId: SyncId | null;
  purchasedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedShoppingBudget {
  id: SyncId;
  householdId: SyncId;
  budgetId: SyncId;
  name: string;
  categoryIds: SyncId[];
  monthlyLimit: number;
  trips: SharedShoppingTrip[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface CreateShoppingBudgetInput {
  budgetId: SyncId;
  name: string;
  categoryIds: SyncId[];
  monthlyLimit: number;
}

export interface LogShoppingTripInput {
  shoppingBudgetId: SyncId;
  store: string;
  receiptTotal: number;
  payerMemberId: SyncId;
  allocation: ShoppingTripAllocation;
  receiptRef?: string | null;
  purchasedAt?: string;
  generateSharedExpense?: boolean;
  splitMemberIds?: SyncId[];
}

export interface ShoppingBudgetSummary {
  shoppingBudgetId: SyncId;
  spentThisMonth: number;
  remainingAmount: number;
  recentTrips: SharedShoppingTrip[];
  averageTripSize: number;
  projectedMonthEndSpend: number;
}

export type ReconciliationPeriodType = 'MONTHLY' | 'CUSTOM';
export type ReconciliationSourceType = 'CATEGORY' | 'BILL' | 'BUDGET';
export type ReconciliationShareMode = 'EQUAL' | 'CUSTOM';
export type ReconciliationContributionVisibility = 'AGGREGATE_ONLY' | 'DETAILS_REVEALED';

export interface HouseholdReconciliationObligation {
  id: SyncId;
  sourceType: ReconciliationSourceType;
  sourceId: SyncId;
  label: string;
  amount: number;
  memberIds: SyncId[];
  shareMode: ReconciliationShareMode;
  shares: SharedExpenseSplit[];
}

export interface HouseholdReconciliationContribution {
  memberId: SyncId;
  amount: number;
  label: string;
  visibility: ReconciliationContributionVisibility;
}

export interface HouseholdReconciliationPlan {
  id: SyncId;
  householdId: SyncId;
  name: string;
  periodType: ReconciliationPeriodType;
  startDate: string | null;
  endDate: string | null;
  participantMemberIds: SyncId[];
  obligations: HouseholdReconciliationObligation[];
  contributions: HouseholdReconciliationContribution[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: boolean;
}

export interface SetReconciliationPlanInput {
  name: string;
  periodType: ReconciliationPeriodType;
  startDate?: string | null;
  endDate?: string | null;
  participantMemberIds: SyncId[];
  obligations: Omit<HouseholdReconciliationObligation, 'id'>[];
  contributions: HouseholdReconciliationContribution[];
}

export interface ReconciliationMemberSummary {
  memberId: SyncId;
  paidAmount: number;
  agreedShare: number;
  variance: number;
  trueUpAmount: number;
  privacyLabel: string;
}

export interface ReconciliationSummary {
  planId: SyncId;
  totalObligation: number;
  totalPaid: number;
  memberSummaries: ReconciliationMemberSummary[];
  trueUpSuggestions: SettleUpSuggestion[];
}

export interface ReconciliationSnapshot {
  id: SyncId;
  householdId: SyncId;
  planId: SyncId;
  periodLabel: string;
  startDate: string;
  endDate: string;
  summary: ReconciliationSummary;
  createdAt: string;
  syncVersion: number;
  isSynced: boolean;
}

export interface MarkReconciliationPeriodInput {
  planId: SyncId;
  periodLabel: string;
  startDate: string;
  endDate: string;
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
  /** Durable activity feed for household changes. */
  activityEvents: HouseholdActivityEvent[];
  /** Recurring shared bill templates and cycle history. */
  recurringBills: RecurringSharedBill[];
  /** Contribution pledges for shared goals. */
  goalPledges: GoalContributionPledge[];
  /** Trip/receipt-level shopping budgets. */
  shoppingBudgets: SharedShoppingBudget[];
  /** Yours/mine/ours reconciliation plans. */
  reconciliationPlans: HouseholdReconciliationPlan[];
  /** Immutable reconciled period snapshots. */
  reconciliationSnapshots: ReconciliationSnapshot[];
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
  /**
   * Look up a single invitation by its invite code, reading directly from the
   * synced store so it resolves on the invitee's own device (#3377). Returns
   * the invitation regardless of status so the accept screen can distinguish
   * pending / accepted / expired / revoked. `null` when no invitation matches.
   */
  getInvitationByCode: (inviteCode: string) => Promise<HouseholdInvitation | null>;
  /**
   * Accept an invitation by invite code, joining the current authenticated user
   * to the invitation's household. Reads the invitation from the synced store
   * (not just in-memory state) so acceptance works cross-device (#3377).
   */
  acceptInvitation: (inviteCode: string) => Promise<AcceptInvitationResult>;
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

  // -- Household beta (#2228, #2232, #2234, #2244, #2246) ---
  /** Create a recurring shared bill with payer rotation. */
  createRecurringSharedBill: (input: CreateRecurringSharedBillInput) => RecurringSharedBill | null;
  /** Pause or resume a recurring bill without deleting it. */
  setRecurringBillPaused: (billId: SyncId, paused: boolean) => boolean;
  /** Edit a recurring bill's name, amount, cadence, due day, or split settings (#3385). */
  updateRecurringBill: (input: UpdateRecurringBillInput) => RecurringSharedBill | null;
  /** Permanently delete a recurring bill (#3385). */
  removeRecurringBill: (billId: SyncId) => boolean;
  /** Override, skip, or settle a single recurring bill cycle. */
  updateRecurringBillCycle: (
    input: UpdateRecurringBillCycleInput,
  ) => RecurringSharedBillCycle | null;
  /** Mark a recurring bill cycle paid and generate a shared expense for it. */
  markRecurringBillCyclePaid: (input: MarkRecurringBillCyclePaidInput) => SharedExpense | null;
  /** Create or update a member-level contribution pledge for a shared goal. */
  setGoalContributionPledge: (
    input: SetGoalContributionPledgeInput,
  ) => GoalContributionPledge | null;
  /** Record an attributed contribution toward a shared goal pledge. */
  recordGoalContribution: (input: RecordGoalContributionInput) => GoalContributionPledge | null;
  /** Create or update a shared shopping budget. */
  createShoppingBudget: (input: CreateShoppingBudgetInput) => SharedShoppingBudget | null;
  /** Log a receipt/trip against a shopping budget, optionally generating a shared expense. */
  logShoppingTrip: (input: LogShoppingTripInput) => SharedShoppingTrip | null;
  /** Create or replace a reconciliation plan. */
  setReconciliationPlan: (input: SetReconciliationPlanInput) => HouseholdReconciliationPlan | null;
  /** Preserve an immutable reconciliation snapshot for a period. */
  markReconciliationPeriodReconciled: (
    input: MarkReconciliationPeriodInput,
  ) => ReconciliationSnapshot | null;

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

// ---------------------------------------------------------------------------
// Persistence (encrypted SQLite/OPFS via the household data repository, #3378)
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
const STORAGE_KEY_ACTIVITY_EVENTS = 'finance-household-activity-events';
const STORAGE_KEY_RECURRING_BILLS = 'finance-household-recurring-bills';
const STORAGE_KEY_GOAL_PLEDGES = 'finance-household-goal-pledges';
const STORAGE_KEY_SHOPPING_BUDGETS = 'finance-household-shopping-budgets';
const STORAGE_KEY_RECONCILIATION_PLANS = 'finance-household-reconciliation-plans';
const STORAGE_KEY_RECONCILIATION_SNAPSHOTS = 'finance-household-reconciliation-snapshots';

async function loadFromStorage<T>(db: AsyncDb | null, key: string, fallback: T): Promise<T> {
  if (!db) {
    return fallback;
  }
  try {
    return await readHouseholdValue<T>(db, key, fallback);
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(db: AsyncDb | null, key: string, value: T): void {
  if (!db) {
    return;
  }
  writeHouseholdValue(db, key, value);
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

function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.min(Math.max(1, day), new Date(year, month + 1, 0).getDate());
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getRecurringBillCyclePayer(
  bill: Pick<
    RecurringSharedBill,
    'defaultPayerMemberId' | 'rotationMode' | 'payerRotationMemberIds' | 'rotationWeights'
  >,
  cycleIndex: number,
): SyncId {
  const rotationIds = bill.payerRotationMemberIds.length
    ? bill.payerRotationMemberIds
    : [bill.defaultPayerMemberId];

  if (bill.rotationMode === 'FIXED' || rotationIds.length === 0) {
    return bill.defaultPayerMemberId;
  }

  if (bill.rotationMode === 'WEIGHTED') {
    const weightedIds = rotationIds.flatMap((memberId) =>
      Array.from(
        { length: Math.max(1, Math.round(bill.rotationWeights[memberId] ?? 1)) },
        () => memberId,
      ),
    );
    return weightedIds[cycleIndex % weightedIds.length] ?? bill.defaultPayerMemberId;
  }

  return rotationIds[cycleIndex % rotationIds.length] ?? bill.defaultPayerMemberId;
}

export function buildRecurringBillCycle(
  bill: Pick<
    RecurringSharedBill,
    | 'id'
    | 'estimatedAmount'
    | 'dueDay'
    | 'cadence'
    | 'defaultPayerMemberId'
    | 'rotationMode'
    | 'payerRotationMemberIds'
    | 'rotationWeights'
  >,
  cycleIndex: number,
  referenceDate = new Date(),
  id: SyncId = 'pending-cycle',
): RecurringSharedBillCycle {
  const dueDate = new Date(referenceDate);
  if (bill.cadence === 'MONTHLY') {
    dueDate.setMonth(referenceDate.getMonth() + cycleIndex);
    dueDate.setDate(clampDayOfMonth(dueDate.getFullYear(), dueDate.getMonth(), bill.dueDay));
  } else {
    const days = bill.cadence === 'BIWEEKLY' ? 14 : 7;
    dueDate.setDate(referenceDate.getDate() + cycleIndex * days);
  }

  const now = new Date().toISOString();
  return {
    id,
    billId: bill.id,
    dueDate: toIsoDate(dueDate),
    payerMemberId: getRecurringBillCyclePayer(bill, cycleIndex),
    amount: normalizeMoney(bill.estimatedAmount),
    status: 'UPCOMING',
    skippedReason: null,
    sharedExpenseId: null,
    settlementStatus: 'NONE',
    createdAt: now,
    updatedAt: now,
  };
}

export function buildRecurringBillReminders(
  bills: readonly RecurringSharedBill[],
  referenceDate = new Date(),
): RecurringBillReminder[] {
  return bills.map((bill) => {
    const existing = bill.cycles.find((cycle) => cycle.status === 'UPCOMING') ?? null;
    const cycle = existing ?? buildRecurringBillCycle(bill, bill.cycles.length, referenceDate);
    return {
      billId: bill.id,
      cycleId: existing?.id ?? null,
      name: bill.name,
      dueDate: cycle.dueDate,
      payerMemberId: cycle.payerMemberId,
      amount: cycle.amount,
      participantMemberIds: bill.splitMemberIds,
      paused: bill.paused,
      status: cycle.status,
    };
  });
}

export function calculateGoalPledgeProgress(
  pledges: readonly GoalContributionPledge[],
  goalId: SyncId,
): GoalPledgeProgress {
  const activePledges = pledges.filter((pledge) => pledge.goalId === goalId && !pledge.deletedAt);
  const members = activePledges.map((pledge) => {
    const remainingAmount = Math.max(
      0,
      normalizeMoney(pledge.pledgedAmount - pledge.contributedAmount),
    );
    return {
      memberId: pledge.memberId,
      pledgedAmount: normalizeMoney(pledge.pledgedAmount),
      contributedAmount: normalizeMoney(pledge.contributedAmount),
      remainingAmount,
      catchUpRecommendation: pledge.nextDueDate ? remainingAmount : 0,
    };
  });

  return {
    goalId,
    totalPledged: normalizeMoney(members.reduce((sum, member) => sum + member.pledgedAmount, 0)),
    totalContributed: normalizeMoney(
      members.reduce((sum, member) => sum + member.contributedAmount, 0),
    ),
    totalRemaining: normalizeMoney(
      members.reduce((sum, member) => sum + member.remainingAmount, 0),
    ),
    members,
  };
}

export function calculateShoppingBudgetSummary(
  budget: SharedShoppingBudget,
  referenceDate = new Date(),
): ShoppingBudgetSummary {
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  const monthTrips = budget.trips.filter((trip) => {
    const purchasedAt = new Date(trip.purchasedAt);
    return purchasedAt.getMonth() === month && purchasedAt.getFullYear() === year;
  });
  const spentThisMonth = normalizeMoney(
    monthTrips.reduce((sum, trip) => sum + trip.receiptTotal, 0),
  );
  const dayOfMonth = referenceDate.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return {
    shoppingBudgetId: budget.id,
    spentThisMonth,
    remainingAmount: normalizeMoney(budget.monthlyLimit - spentThisMonth),
    recentTrips: [...budget.trips]
      .sort((left, right) => right.purchasedAt.localeCompare(left.purchasedAt))
      .slice(0, 5),
    averageTripSize: monthTrips.length ? normalizeMoney(spentThisMonth / monthTrips.length) : 0,
    projectedMonthEndSpend: dayOfMonth
      ? normalizeMoney((spentThisMonth / dayOfMonth) * daysInMonth)
      : spentThisMonth,
  };
}

export function calculateReconciliationSummary(
  plan: HouseholdReconciliationPlan,
): ReconciliationSummary {
  const participantIds = Array.from(new Set(plan.participantMemberIds.filter(Boolean)));
  const sharesByMember = new Map<SyncId, number>();
  const paidByMember = new Map<SyncId, number>();
  const privacyByMember = new Map<SyncId, ReconciliationContributionVisibility>();

  for (const memberId of participantIds) {
    sharesByMember.set(memberId, 0);
    paidByMember.set(memberId, 0);
  }

  for (const obligation of plan.obligations) {
    const shares =
      obligation.shareMode === 'CUSTOM' && obligation.shares.length > 0
        ? obligation.shares
        : createEqualSharedExpenseSplits(obligation.amount, obligation.memberIds);
    for (const share of shares) {
      sharesByMember.set(share.memberId, (sharesByMember.get(share.memberId) ?? 0) + share.amount);
    }
  }

  for (const contribution of plan.contributions) {
    paidByMember.set(
      contribution.memberId,
      (paidByMember.get(contribution.memberId) ?? 0) + contribution.amount,
    );
    if (contribution.visibility === 'AGGREGATE_ONLY') {
      privacyByMember.set(contribution.memberId, 'AGGREGATE_ONLY');
    } else if (!privacyByMember.has(contribution.memberId)) {
      privacyByMember.set(contribution.memberId, 'DETAILS_REVEALED');
    }
  }

  const memberSummaries = participantIds.map((memberId) => {
    const paidAmount = normalizeMoney(paidByMember.get(memberId) ?? 0);
    const agreedShare = normalizeMoney(sharesByMember.get(memberId) ?? 0);
    const variance = normalizeMoney(paidAmount - agreedShare);
    return {
      memberId,
      paidAmount,
      agreedShare,
      variance,
      trueUpAmount: variance < 0 ? normalizeMoney(Math.abs(variance)) : 0,
      privacyLabel:
        privacyByMember.get(memberId) === 'AGGREGATE_ONLY'
          ? 'Private details hidden; aggregate totals only'
          : 'Details revealed for reconciliation',
    };
  });

  return {
    planId: plan.id,
    totalObligation: normalizeMoney(plan.obligations.reduce((sum, item) => sum + item.amount, 0)),
    totalPaid: normalizeMoney(plan.contributions.reduce((sum, item) => sum + item.amount, 0)),
    memberSummaries,
    trueUpSuggestions: simplifySettleUpBalances(
      memberSummaries.map((summary) => ({
        memberId: summary.memberId,
        netBalance: summary.variance,
      })),
    ),
  };
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

/**
 * Scale a recurring bill's stored custom split amounts to a specific cycle
 * amount (#3384). Custom amounts are defined relative to the bill's estimated
 * amount, so when a cycle's actual amount differs we distribute proportionally
 * and assign any rounding remainder to the largest share, guaranteeing the
 * member shares sum exactly to the target amount.
 */
export function scaleCustomSharedExpenseSplits(
  customSplits: readonly SharedExpenseSplit[],
  targetAmount: number,
): SharedExpenseSplit[] {
  const targetCents = toCents(targetAmount);
  if (targetCents <= 0) {
    throw new RangeError('Shared expense amount must be greater than zero.');
  }

  const entries = customSplits
    .filter((split) => Boolean(split.memberId) && toCents(split.amount) > 0)
    .map((split) => ({ memberId: split.memberId, cents: toCents(split.amount) }));

  if (entries.length === 0) {
    throw new RangeError('Custom split needs at least one member with a positive amount.');
  }

  const totalCustomCents = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const scaled = entries.map((entry) => ({
    memberId: entry.memberId,
    cents: Math.floor((entry.cents * targetCents) / totalCustomCents),
  }));

  const assigned = scaled.reduce((sum, entry) => sum + entry.cents, 0);
  let remainder = targetCents - assigned;
  // Hand out the remaining cents one at a time, starting with the largest
  // shares so the distribution stays proportional and deterministic.
  const order = scaled
    .map((entry, index) => ({ index, cents: entry.cents }))
    .sort((a, b) => b.cents - a.cents);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = scaled[order[cursor % order.length].index];
    target.cents += 1;
    remainder -= 1;
    cursor += 1;
  }

  return scaled.map((entry) => ({ memberId: entry.memberId, amount: fromCents(entry.cents) }));
}

/**
 * Build the member splits for a recurring-bill payment, honoring a CUSTOM split
 * when one is configured (#3384). Falls back to an equal split for EQUAL bills or
 * when custom data is missing/invalid.
 */
export function buildRecurringBillSplits(
  bill: Pick<RecurringSharedBill, 'splitMode' | 'splitMemberIds' | 'customSplits'>,
  amount: number,
): SharedExpenseSplit[] {
  if (bill.splitMode === 'CUSTOM' && bill.customSplits && bill.customSplits.length > 0) {
    try {
      return scaleCustomSharedExpenseSplits(bill.customSplits, amount);
    } catch {
      // Fall through to an equal split if custom data is unusable.
    }
  }
  return createEqualSharedExpenseSplits(amount, bill.splitMemberIds);
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

  // Household data is persisted in the encrypted SQLite/OPFS database (issue
  // #3378). Access the database defensively: if the household screen is ever
  // mounted without a `DatabaseProvider` (e.g. isolated unit tests, or the
  // guarded reads elsewhere on this page), the hook still renders with
  // in-memory-only state instead of throwing. `dbRef` lets the memoized
  // mutation callbacks reach the current database handle without adding it to
  // every dependency array.
  const db = useOptionalDatabase();
  const dbRef = useRef<AsyncDb | null>(db);
  dbRef.current = db;

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [accountSharings, setAccountSharings] = useState<AccountSharing[]>([]);
  const [sharedBudgets, setSharedBudgets] = useState<SharedBudget[]>([]);
  const [sharedGoals, setSharedGoals] = useState<SharedGoal[]>([]);
  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [sharedSettlements, setSharedSettlements] = useState<SharedSettlement[]>([]);
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [activityEvents, setActivityEvents] = useState<HouseholdActivityEvent[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringSharedBill[]>([]);
  const [goalPledges, setGoalPledges] = useState<GoalContributionPledge[]>([]);
  const [shoppingBudgets, setShoppingBudgets] = useState<SharedShoppingBudget[]>([]);
  const [reconciliationPlans, setReconciliationPlans] = useState<HouseholdReconciliationPlan[]>([]);
  const [reconciliationSnapshots, setReconciliationSnapshots] = useState<ReconciliationSnapshot[]>(
    [],
  );
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

    const load = async () => {
      try {
        setHousehold(
          await loadFromStorage<Household | null>(dbRef.current, STORAGE_KEY_HOUSEHOLD, null),
        );
        setMembers(
          await loadFromStorage<HouseholdMember[]>(dbRef.current, STORAGE_KEY_MEMBERS, []),
        );
        setInvitations(
          await loadFromStorage<HouseholdInvitation[]>(dbRef.current, STORAGE_KEY_INVITATIONS, []),
        );
        setAccountSharings(
          await loadFromStorage<AccountSharing[]>(dbRef.current, STORAGE_KEY_ACCOUNT_SHARINGS, []),
        );
        setSharedBudgets(
          await loadFromStorage<SharedBudget[]>(dbRef.current, STORAGE_KEY_SHARED_BUDGETS, []),
        );
        setSharedGoals(
          await loadFromStorage<SharedGoal[]>(dbRef.current, STORAGE_KEY_SHARED_GOALS, []),
        );
        setSharedExpenses(
          await loadFromStorage<SharedExpense[]>(dbRef.current, STORAGE_KEY_SHARED_EXPENSES, []),
        );
        setSharedSettlements(
          await loadFromStorage<SharedSettlement[]>(
            dbRef.current,
            STORAGE_KEY_SHARED_SETTLEMENTS,
            [],
          ),
        );
        setActivityEvents(
          await loadFromStorage<HouseholdActivityEvent[]>(
            dbRef.current,
            STORAGE_KEY_ACTIVITY_EVENTS,
            [],
          ),
        );
        setRecurringBills(
          await loadFromStorage<RecurringSharedBill[]>(
            dbRef.current,
            STORAGE_KEY_RECURRING_BILLS,
            [],
          ),
        );
        setGoalPledges(
          await loadFromStorage<GoalContributionPledge[]>(
            dbRef.current,
            STORAGE_KEY_GOAL_PLEDGES,
            [],
          ),
        );
        setShoppingBudgets(
          await loadFromStorage<SharedShoppingBudget[]>(
            dbRef.current,
            STORAGE_KEY_SHOPPING_BUDGETS,
            [],
          ),
        );
        setReconciliationPlans(
          await loadFromStorage<HouseholdReconciliationPlan[]>(
            dbRef.current,
            STORAGE_KEY_RECONCILIATION_PLANS,
            [],
          ),
        );
        setReconciliationSnapshots(
          await loadFromStorage<ReconciliationSnapshot[]>(
            dbRef.current,
            STORAGE_KEY_RECONCILIATION_SNAPSHOTS,
            [],
          ),
        );

        const storedChildren = (
          await loadFromStorage<ChildProfile[]>(dbRef.current, STORAGE_KEY_CHILDREN, [])
        ).map(normalizeChildProfile);
        const processedChildren = applyHouseholdKidsWeeklyProcessing(storedChildren);
        setChildren(processedChildren);

        if (JSON.stringify(storedChildren) !== JSON.stringify(processedChildren)) {
          saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, processedChildren);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load household data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [db, refreshToken]);

  const getActorMemberId = useCallback((): SyncId | null => {
    return (
      members.find((member) => authUser?.id && member.userId === authUser.id)?.id ??
      members[0]?.id ??
      null
    );
  }, [authUser?.id, members]);

  const appendActivity = useCallback(
    (
      input: Omit<
        HouseholdActivityEvent,
        'id' | 'householdId' | 'actorMemberId' | 'createdAt' | 'syncVersion' | 'isSynced'
      > & { householdId?: SyncId; actorMemberId?: SyncId | null; createdAt?: string },
    ): HouseholdActivityEvent | null => {
      const householdId = input.householdId ?? household?.id;
      if (!householdId) {
        return null;
      }

      const event: HouseholdActivityEvent = {
        id: crypto.randomUUID(),
        householdId,
        actorMemberId: input.actorMemberId ?? getActorMemberId(),
        type: input.type,
        action: input.action,
        affectedObjectType: input.affectedObjectType,
        affectedObjectId: input.affectedObjectId,
        summary: input.summary,
        detail: input.detail,
        privacy: input.privacy,
        createdAt: input.createdAt ?? new Date().toISOString(),
        syncVersion: 1,
        isSynced: false,
      };

      setActivityEvents((current) => {
        const updated = [event, ...current].slice(0, 100);
        saveToStorage(dbRef.current, STORAGE_KEY_ACTIVITY_EVENTS, updated);
        return updated;
      });
      return event;
    },
    [getActorMemberId, household?.id],
  );

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

        saveToStorage(dbRef.current, STORAGE_KEY_HOUSEHOLD, newHousehold);
        saveToStorage(dbRef.current, STORAGE_KEY_MEMBERS, [ownerMember]);
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_EXPENSES, []);
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_SETTLEMENTS, []);
        saveToStorage(dbRef.current, STORAGE_KEY_ACTIVITY_EVENTS, []);
        saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, []);
        saveToStorage(dbRef.current, STORAGE_KEY_GOAL_PLEDGES, []);
        saveToStorage(dbRef.current, STORAGE_KEY_SHOPPING_BUDGETS, []);
        saveToStorage(dbRef.current, STORAGE_KEY_RECONCILIATION_PLANS, []);
        saveToStorage(dbRef.current, STORAGE_KEY_RECONCILIATION_SNAPSHOTS, []);

        const createdEvent: HouseholdActivityEvent = {
          id: crypto.randomUUID(),
          householdId: newHousehold.id,
          actorMemberId: ownerMember.id,
          type: 'MEMBERS',
          action: 'HOUSEHOLD_CREATED',
          affectedObjectType: 'household',
          affectedObjectId: newHousehold.id,
          summary: newHousehold.name + ' household was created',
          detail: 'Initial owner member created with privacy-by-default sharing.',
          privacy: 'PUBLIC',
          createdAt: now,
          syncVersion: 1,
          isSynced: false,
        };
        saveToStorage(dbRef.current, STORAGE_KEY_ACTIVITY_EVENTS, [createdEvent]);

        // Mirror the new household into the synced `households` +
        // `household_members` tables so the bank-connection edge function can
        // authorize this owner (create_link_token). Fire-and-forget — the
        // local-first doc store above remains the UI source of truth.
        const syncDb = dbRef.current;
        if (syncDb && authUser?.id?.trim()) {
          void ensureSyncedHouseholdMembership(syncDb, {
            householdId: newHousehold.id,
            name: newHousehold.name,
            userId: authUser.id,
          }).catch(() => {
            // Best-effort; ConnectBankButton re-attempts the backfill on mount.
          });
        }

        setHousehold(newHousehold);
        setMembers([ownerMember]);
        setSharedExpenses([]);
        setSharedSettlements([]);
        setActivityEvents([createdEvent]);
        setRecurringBills([]);
        setGoalPledges([]);
        setShoppingBudgets([]);
        setReconciliationPlans([]);
        setReconciliationSnapshots([]);
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
        saveToStorage(dbRef.current, STORAGE_KEY_INVITATIONS, updated);
        setInvitations(updated);
        appendActivity({
          type: 'MEMBERS',
          action: 'INVITATION_SENT',
          affectedObjectType: 'invitation',
          affectedObjectId: invitation.id,
          summary: 'Invitation sent to ' + invitation.email,
          detail: 'Pending invite created with privacy-by-default onboarding.',
          privacy: 'PUBLIC',
        });
        return invitation;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to invite member.');
        return null;
      }
    },
    [appendActivity, household, invitations],
  );

  // Read the freshest invitation snapshot from the synced store. Acceptance
  // happens on the *invitee's* device, whose in-memory `invitations` state is
  // empty until sync delivers the row — so we must read the store directly
  // rather than trust the render-time snapshot (#3377). Falls back to in-memory
  // state when no database is mounted (isolated tests / provider-less renders).
  const readStoredInvitations = useCallback(
    (): Promise<HouseholdInvitation[]> =>
      loadFromStorage<HouseholdInvitation[]>(dbRef.current, STORAGE_KEY_INVITATIONS, invitations),
    [invitations],
  );

  const getInvitationByCode = useCallback(
    async (inviteCode: string): Promise<HouseholdInvitation | null> => {
      const code = inviteCode.trim();
      if (!code) {
        return null;
      }
      const stored = await readStoredInvitations();
      return (
        stored.find((inv) => inv.inviteCode === code) ??
        invitations.find((inv) => inv.inviteCode === code) ??
        null
      );
    },
    [invitations, readStoredInvitations],
  );

  const acceptInvitation = useCallback(
    async (inviteCode: string): Promise<AcceptInvitationResult> => {
      const code = inviteCode.trim();
      if (!code) {
        setError('Invalid or expired invitation code.');
        return { status: 'NOT_FOUND' };
      }

      try {
        // Authoritative, freshest view of the synced store (see note above).
        const invitationList = await readStoredInvitations();
        const memberList = await loadFromStorage<HouseholdMember[]>(
          dbRef.current,
          STORAGE_KEY_MEMBERS,
          members,
        );

        const invitation = invitationList.find((inv) => inv.inviteCode === code);
        if (!invitation) {
          setError('Invalid or expired invitation code.');
          return { status: 'NOT_FOUND' };
        }

        if (invitation.status === 'REVOKED' || invitation.deletedAt) {
          setError('This invitation has been revoked.');
          return { status: 'REVOKED' };
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const isExpired =
          invitation.status === 'EXPIRED' ||
          new Date(invitation.expiresAt).getTime() < now.getTime();
        if (isExpired) {
          if (invitation.status !== 'EXPIRED') {
            const updatedInvs = invitationList.map((inv) =>
              inv.id === invitation.id
                ? {
                    ...inv,
                    status: 'EXPIRED' as const,
                    updatedAt: nowIso,
                    syncVersion: inv.syncVersion + 1,
                    isSynced: false,
                  }
                : inv,
            );
            saveToStorage(dbRef.current, STORAGE_KEY_INVITATIONS, updatedInvs);
            setInvitations(updatedInvs);
          }
          setError('This invitation has expired.');
          return { status: 'EXPIRED' };
        }

        const currentUserId = authUser?.id?.trim() ? authUser.id : null;

        // Idempotency: if this user already belongs to the invitation's
        // household, don't mint a duplicate membership — just return it.
        const existingMember = currentUserId
          ? memberList.find(
              (member) =>
                member.householdId === invitation.householdId &&
                member.userId === currentUserId &&
                !member.deletedAt,
            )
          : undefined;

        if (invitation.status === 'ACCEPTED') {
          if (existingMember) {
            return { status: 'ALREADY_MEMBER', member: existingMember };
          }
          setError('This invitation has already been accepted.');
          return { status: 'ALREADY_ACCEPTED' };
        }

        const acceptedInvitations = invitationList.map((inv) =>
          inv.id === invitation.id
            ? {
                ...inv,
                status: 'ACCEPTED' as const,
                updatedAt: nowIso,
                syncVersion: inv.syncVersion + 1,
                isSynced: false,
              }
            : inv,
        );

        if (existingMember) {
          saveToStorage(dbRef.current, STORAGE_KEY_INVITATIONS, acceptedInvitations);
          setInvitations(acceptedInvitations);
          return { status: 'ALREADY_MEMBER', member: existingMember };
        }

        // Privacy-by-default: new member joins with no shared accounts. Bind the
        // membership to the *authenticated* invitee so it maps back to their
        // account (falling back to a random id only for anonymous/demo flows).
        const newMember: HouseholdMember = {
          id: crypto.randomUUID(),
          householdId: invitation.householdId,
          userId: currentUserId ?? crypto.randomUUID(),
          displayName:
            (authUser?.name && authUser.name.trim().length > 0 ? authUser.name.trim() : null) ??
            (authUser?.email && authUser.email.trim().length > 0 ? authUser.email.trim() : null),
          role: invitation.role,
          joinedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };

        const updatedMembers = [...memberList, newMember];

        saveToStorage(dbRef.current, STORAGE_KEY_INVITATIONS, acceptedInvitations);
        saveToStorage(dbRef.current, STORAGE_KEY_MEMBERS, updatedMembers);
        setInvitations(acceptedInvitations);
        setMembers(updatedMembers);
        appendActivity({
          type: 'MEMBERS',
          action: 'INVITATION_ACCEPTED',
          affectedObjectType: 'member',
          affectedObjectId: newMember.id,
          householdId: invitation.householdId,
          actorMemberId: newMember.id,
          summary: 'Invitation accepted',
          detail: 'New member joined without sharing private accounts by default.',
          privacy: 'PUBLIC',
        });

        return { status: 'ACCEPTED', member: newMember };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to accept invitation.';
        setError(message);
        return { status: 'ERROR', message };
      }
    },
    [appendActivity, authUser?.email, authUser?.id, authUser?.name, members, readStoredInvitations],
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
        saveToStorage(dbRef.current, STORAGE_KEY_INVITATIONS, updated);
        setInvitations(updated);
        appendActivity({
          type: 'MEMBERS',
          action: 'INVITATION_REVOKED',
          affectedObjectType: 'invitation',
          affectedObjectId: invitationId,
          summary: 'Invitation revoked',
          detail: null,
          privacy: 'PUBLIC',
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke invitation.');
        return false;
      }
    },
    [appendActivity, invitations],
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
        saveToStorage(dbRef.current, STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        appendActivity({
          type: 'MEMBERS',
          action: 'TRUSTED_HELPER_ADDED',
          affectedObjectType: 'member',
          affectedObjectId: helper.id,
          summary: name + ' was added as a trusted helper',
          detail: 'Viewer role grants read-only summary access.',
          privacy: 'PUBLIC',
        });
        setError(null);
        return helper;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add trusted helper.');
        return null;
      }
    },
    [appendActivity, household, members],
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
        saveToStorage(dbRef.current, STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        appendActivity({
          type: 'MEMBERS',
          action: 'MEMBER_ROLE_UPDATED',
          affectedObjectType: 'member',
          affectedObjectId: memberId,
          summary: 'Member role changed to ' + role,
          detail: null,
          privacy: 'PUBLIC',
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update member role.');
        return false;
      }
    },
    [appendActivity, members],
  );

  const removeMember = useCallback(
    (memberId: SyncId): boolean => {
      try {
        const updated = members.filter((m) => m.id !== memberId);
        if (updated.length === members.length) return false;
        saveToStorage(dbRef.current, STORAGE_KEY_MEMBERS, updated);
        setMembers(updated);
        appendActivity({
          type: 'MEMBERS',
          action: 'MEMBER_REMOVED',
          affectedObjectType: 'member',
          affectedObjectId: memberId,
          summary: 'Household member removed',
          detail: null,
          privacy: 'PUBLIC',
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove member.');
        return false;
      }
    },
    [appendActivity, members],
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
          saveToStorage(dbRef.current, STORAGE_KEY_ACCOUNT_SHARINGS, updated);
          setAccountSharings(updated);
          appendActivity({
            type: 'ACCOUNTS',
            action: 'ACCOUNT_SHARING_UPDATED',
            affectedObjectType: 'accountSharing',
            affectedObjectId: existing.id,
            summary: 'Account sharing changed to ' + input.sharingMode,
            detail:
              input.sharingMode === 'PRIVATE'
                ? 'Account details are hidden.'
                : 'Account is visible to the household.',
            privacy: input.sharingMode === 'PRIVATE' ? 'REDACTED' : 'PUBLIC',
          });
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
        saveToStorage(dbRef.current, STORAGE_KEY_ACCOUNT_SHARINGS, updated);
        setAccountSharings(updated);
        appendActivity({
          type: 'ACCOUNTS',
          action: 'ACCOUNT_SHARING_CREATED',
          affectedObjectType: 'accountSharing',
          affectedObjectId: newSharing.id,
          summary: 'Account sharing set to ' + input.sharingMode,
          detail:
            input.sharingMode === 'PRIVATE'
              ? 'Account details are hidden.'
              : 'Account is visible to the household.',
          privacy: input.sharingMode === 'PRIVATE' ? 'REDACTED' : 'PUBLIC',
        });
        return newSharing;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update account sharing.');
        return null;
      }
    },
    [appendActivity, household, accountSharings],
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
          saveToStorage(dbRef.current, STORAGE_KEY_SHARED_BUDGETS, updated);
          setSharedBudgets(updated);
          appendActivity({
            type: 'BUDGETS',
            action: 'SHARED_BUDGET_UPDATED',
            affectedObjectType: 'sharedBudget',
            affectedObjectId: existing.id,
            summary: 'Shared budget mode changed to ' + input.mode,
            detail: null,
            privacy: 'PUBLIC',
          });
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
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_BUDGETS, updated);
        setSharedBudgets(updated);
        appendActivity({
          type: 'BUDGETS',
          action: 'SHARED_BUDGET_CREATED',
          affectedObjectType: 'sharedBudget',
          affectedObjectId: newSharedBudget.id,
          summary: 'Budget shared with household',
          detail: 'Shared budget participation is distinct from account sharing.',
          privacy: 'PUBLIC',
        });
        return newSharedBudget;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set shared budget.');
        return null;
      }
    },
    [appendActivity, household, sharedBudgets],
  );

  const removeSharedBudget = useCallback(
    (sharedBudgetId: SyncId): boolean => {
      try {
        const updated = sharedBudgets.filter((sb) => sb.id !== sharedBudgetId);
        if (updated.length === sharedBudgets.length) return false;
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_BUDGETS, updated);
        setSharedBudgets(updated);
        appendActivity({
          type: 'BUDGETS',
          action: 'SHARED_BUDGET_REMOVED',
          affectedObjectType: 'sharedBudget',
          affectedObjectId: sharedBudgetId,
          summary: 'Budget removed from household sharing',
          detail: null,
          privacy: 'PUBLIC',
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove shared budget.');
        return false;
      }
    },
    [appendActivity, sharedBudgets],
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
          saveToStorage(dbRef.current, STORAGE_KEY_SHARED_GOALS, updated);
          setSharedGoals(updated);
          appendActivity({
            type: 'GOALS',
            action: 'SHARED_GOAL_UPDATED',
            affectedObjectType: 'sharedGoal',
            affectedObjectId: existing.id,
            summary: input.isShared ? 'Goal shared with household' : 'Goal made personal',
            detail: null,
            privacy: input.isShared ? 'PUBLIC' : 'REDACTED',
          });
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
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_GOALS, updated);
        setSharedGoals(updated);
        appendActivity({
          type: 'GOALS',
          action: 'SHARED_GOAL_CREATED',
          affectedObjectType: 'sharedGoal',
          affectedObjectId: newSharedGoal.id,
          summary: input.isShared ? 'Goal shared with household' : 'Goal kept personal',
          detail: null,
          privacy: input.isShared ? 'PUBLIC' : 'REDACTED',
        });
        return newSharedGoal;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set shared goal.');
        return null;
      }
    },
    [appendActivity, household, sharedGoals],
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
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_EXPENSES, updated);
        setSharedExpenses(updated);
        appendActivity({
          type: 'EXPENSES',
          action: 'SHARED_EXPENSE_LOGGED',
          affectedObjectType: 'sharedExpense',
          affectedObjectId: expense.id,
          summary: expense.description + ' shared expense logged',
          detail: 'Only shared split totals are recorded in household history.',
          privacy: 'AGGREGATED',
        });
        setError(null);
        return expense;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to log shared expense.');
        return null;
      }
    },
    [appendActivity, household, sharedExpenses],
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
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_SETTLEMENTS, updated);
        setSharedSettlements(updated);
        appendActivity({
          type: 'SETTLEMENTS',
          action: 'SETTLEMENT_RECORDED',
          affectedObjectType: 'sharedSettlement',
          affectedObjectId: settlement.id,
          summary: 'Settle-up payment recorded',
          detail: null,
          privacy: 'AGGREGATED',
        });
        setError(null);
        return settlement;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record settlement.');
        return null;
      }
    },
    [appendActivity, household, sharedSettlements],
  );

  // -- Household beta (#2228, #2232, #2234, #2244, #2246) --
  const createRecurringSharedBill = useCallback(
    (input: CreateRecurringSharedBillInput): RecurringSharedBill | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      const name = input.name.trim();
      const amountCents = toCents(input.estimatedAmount);
      const splitMemberIds = Array.from(new Set(input.splitMemberIds.filter(Boolean)));
      const rotationIds = Array.from(
        new Set(
          (input.payerRotationMemberIds?.length
            ? input.payerRotationMemberIds
            : [input.defaultPayerMemberId]
          ).filter(Boolean),
        ),
      );

      if (!name || amountCents <= 0 || splitMemberIds.length === 0 || !input.defaultPayerMemberId) {
        setError('Recurring bill needs a name, amount, payer, and at least one split member.');
        return null;
      }

      const now = new Date().toISOString();
      const bill: RecurringSharedBill = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name,
        estimatedAmount: fromCents(amountCents),
        dueDay: Math.min(Math.max(1, Math.round(input.dueDay)), 31),
        cadence: input.cadence,
        splitMode: input.splitMode ?? 'EQUAL',
        splitMemberIds,
        ...(input.splitMode === 'CUSTOM' && input.customSplits?.length
          ? { customSplits: input.customSplits }
          : {}),
        defaultPayerMemberId: input.defaultPayerMemberId,
        rotationMode: input.rotationMode,
        payerRotationMemberIds: rotationIds.length ? rotationIds : [input.defaultPayerMemberId],
        rotationWeights: input.rotationWeights ?? {},
        paused: false,
        cycles: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncVersion: 1,
        isSynced: false,
      };
      bill.cycles = [buildRecurringBillCycle(bill, 0, new Date(), crypto.randomUUID())];

      const updated = [...recurringBills, bill];
      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updated);
      setRecurringBills(updated);
      appendActivity({
        type: 'BILLS',
        action: 'RECURRING_BILL_CREATED',
        affectedObjectType: 'recurringBill',
        affectedObjectId: bill.id,
        summary: name + ' recurring bill was created',
        detail: 'Upcoming reminders include payer rotation and split participants.',
        privacy: 'PUBLIC',
      });
      setError(null);
      return bill;
    },
    [appendActivity, household, recurringBills],
  );

  const setRecurringBillPaused = useCallback(
    (billId: SyncId, paused: boolean): boolean => {
      const now = new Date().toISOString();
      const updated = recurringBills.map((bill) =>
        bill.id === billId ? { ...bill, paused, updatedAt: now } : bill,
      );
      const changed = updated.some((bill, index) => bill !== recurringBills[index]);
      if (!changed) return false;
      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updated);
      setRecurringBills(updated);
      appendActivity({
        type: 'BILLS',
        action: paused ? 'RECURRING_BILL_PAUSED' : 'RECURRING_BILL_RESUMED',
        affectedObjectType: 'recurringBill',
        affectedObjectId: billId,
        summary: paused ? 'Recurring bill paused' : 'Recurring bill resumed',
        detail: null,
        privacy: 'PUBLIC',
      });
      return true;
    },
    [appendActivity, recurringBills],
  );

  const updateRecurringBill = useCallback(
    (input: UpdateRecurringBillInput): RecurringSharedBill | null => {
      const existing = recurringBills.find((bill) => bill.id === input.billId);
      if (!existing) {
        setError('Recurring bill not found.');
        return null;
      }

      const nextName = input.name === undefined ? existing.name : input.name.trim();
      if (!nextName) {
        setError('Recurring bill needs a name.');
        return null;
      }

      const nextAmountCents =
        input.estimatedAmount === undefined
          ? toCents(existing.estimatedAmount)
          : toCents(input.estimatedAmount);
      if (nextAmountCents <= 0) {
        setError('Recurring bill amount must be greater than zero.');
        return null;
      }

      const nextSplitMemberIds =
        input.splitMemberIds === undefined
          ? existing.splitMemberIds
          : Array.from(new Set(input.splitMemberIds.filter(Boolean)));
      if (nextSplitMemberIds.length === 0) {
        setError('Recurring bill needs at least one split member.');
        return null;
      }

      const nextSplitMode = input.splitMode ?? existing.splitMode;
      const nextCustomSplits =
        input.customSplits === undefined ? existing.customSplits : input.customSplits;
      if (nextSplitMode === 'CUSTOM' && !(nextCustomSplits && nextCustomSplits.length > 0)) {
        setError('A custom split needs per-member amounts.');
        return null;
      }

      const now = new Date().toISOString();
      let updatedBill: RecurringSharedBill | null = null;
      const updatedBills = recurringBills.map((bill) => {
        if (bill.id !== input.billId) return bill;
        const next: RecurringSharedBill = {
          ...bill,
          name: nextName,
          estimatedAmount: fromCents(nextAmountCents),
          dueDay:
            input.dueDay === undefined
              ? bill.dueDay
              : Math.min(Math.max(1, Math.round(input.dueDay)), 31),
          cadence: input.cadence ?? bill.cadence,
          splitMode: nextSplitMode,
          splitMemberIds: nextSplitMemberIds,
          defaultPayerMemberId: input.defaultPayerMemberId ?? bill.defaultPayerMemberId,
          updatedAt: now,
          syncVersion: bill.syncVersion + 1,
          isSynced: false,
        };
        if (nextSplitMode === 'CUSTOM' && nextCustomSplits && nextCustomSplits.length > 0) {
          next.customSplits = nextCustomSplits;
        } else {
          delete next.customSplits;
        }
        updatedBill = next;
        return next;
      });

      if (!updatedBill) {
        setError('Recurring bill not found.');
        return null;
      }

      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updatedBills);
      setRecurringBills(updatedBills);
      appendActivity({
        type: 'BILLS',
        action: 'RECURRING_BILL_UPDATED',
        affectedObjectType: 'recurringBill',
        affectedObjectId: input.billId,
        summary: nextName + ' recurring bill was updated',
        detail: 'Name, amount, cadence, or split settings changed.',
        privacy: 'PUBLIC',
      });
      setError(null);
      return updatedBill;
    },
    [appendActivity, recurringBills],
  );

  const removeRecurringBill = useCallback(
    (billId: SyncId): boolean => {
      const existing = recurringBills.find((bill) => bill.id === billId);
      if (!existing) {
        setError('Recurring bill not found.');
        return false;
      }

      const updatedBills = recurringBills.filter((bill) => bill.id !== billId);
      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updatedBills);
      setRecurringBills(updatedBills);
      appendActivity({
        type: 'BILLS',
        action: 'RECURRING_BILL_DELETED',
        affectedObjectType: 'recurringBill',
        affectedObjectId: billId,
        summary: existing.name + ' recurring bill was deleted',
        detail: null,
        privacy: 'PUBLIC',
      });
      setError(null);
      return true;
    },
    [appendActivity, recurringBills],
  );

  const updateRecurringBillCycle = useCallback(
    (input: UpdateRecurringBillCycleInput): RecurringSharedBillCycle | null => {
      const now = new Date().toISOString();
      let updatedCycle: RecurringSharedBillCycle | null = null;
      const updatedBills = recurringBills.map((bill) => {
        if (bill.id !== input.billId) return bill;
        return {
          ...bill,
          updatedAt: now,
          cycles: bill.cycles.map((cycle) => {
            if (cycle.id !== input.cycleId) return cycle;
            updatedCycle = {
              ...cycle,
              status: input.status ?? cycle.status,
              payerMemberId: input.payerMemberId ?? cycle.payerMemberId,
              amount: input.amount === undefined ? cycle.amount : normalizeMoney(input.amount),
              skippedReason:
                input.skippedReason === undefined ? cycle.skippedReason : input.skippedReason,
              settlementStatus: input.settlementStatus ?? cycle.settlementStatus,
              updatedAt: now,
            };
            return updatedCycle;
          }),
        };
      });

      if (!updatedCycle) {
        setError('Recurring bill cycle not found.');
        return null;
      }

      const activityCycle = updatedCycle as RecurringSharedBillCycle;
      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updatedBills);
      setRecurringBills(updatedBills);
      appendActivity({
        type: 'BILLS',
        action:
          activityCycle.status === 'SKIPPED'
            ? 'RECURRING_BILL_SKIPPED'
            : 'RECURRING_BILL_CYCLE_UPDATED',
        affectedObjectType: 'recurringBillCycle',
        affectedObjectId: activityCycle.id,
        summary: 'Recurring bill cycle updated',
        detail: activityCycle.skippedReason,
        privacy: 'PUBLIC',
      });
      setError(null);
      return activityCycle;
    },
    [appendActivity, recurringBills],
  );

  const markRecurringBillCyclePaid = useCallback(
    (input: MarkRecurringBillCyclePaidInput): SharedExpense | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }

      const bill = recurringBills.find((entry) => entry.id === input.billId);
      const cycle = bill?.cycles.find((entry) => entry.id === input.cycleId);
      if (!bill || !cycle) {
        setError('Recurring bill cycle not found.');
        return null;
      }

      const amount = normalizeMoney(input.amount ?? cycle.amount);
      const splits = buildRecurringBillSplits(bill, amount);
      const now = new Date().toISOString();
      const expense: SharedExpense = {
        id: crypto.randomUUID(),
        householdId: household.id,
        description: bill.name + ' recurring bill',
        amount,
        paidByMemberId: cycle.payerMemberId,
        splitMode: bill.splitMode,
        splits,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncVersion: 1,
        isSynced: false,
      };

      const updatedExpenses = [...sharedExpenses, expense];
      const updatedBills = recurringBills.map((entry) =>
        entry.id === bill.id
          ? {
              ...entry,
              updatedAt: now,
              cycles: entry.cycles.map((entryCycle) =>
                entryCycle.id === cycle.id
                  ? {
                      ...entryCycle,
                      amount,
                      status: 'PAID' as const,
                      sharedExpenseId: expense.id,
                      settlementStatus: 'OPEN' as const,
                      updatedAt: now,
                    }
                  : entryCycle,
              ),
            }
          : entry,
      );

      saveToStorage(dbRef.current, STORAGE_KEY_SHARED_EXPENSES, updatedExpenses);
      saveToStorage(dbRef.current, STORAGE_KEY_RECURRING_BILLS, updatedBills);
      setSharedExpenses(updatedExpenses);
      setRecurringBills(updatedBills);
      appendActivity({
        type: 'BILLS',
        action: 'RECURRING_BILL_PAID',
        affectedObjectType: 'sharedExpense',
        affectedObjectId: expense.id,
        summary: bill.name + ' was marked paid and added to shared expenses',
        detail: 'Receipt details are not required; shared expense uses the current cycle payer.',
        privacy: 'AGGREGATED',
      });
      setError(null);
      return expense;
    },
    [appendActivity, household, recurringBills, sharedExpenses],
  );

  const setGoalContributionPledge = useCallback(
    (input: SetGoalContributionPledgeInput): GoalContributionPledge | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }
      if (!input.goalId || !input.memberId || toCents(input.pledgedAmount) <= 0) {
        setError('Goal pledge needs a goal, member, and positive amount.');
        return null;
      }

      const now = new Date().toISOString();
      const existing = goalPledges.find(
        (pledge) => pledge.goalId === input.goalId && pledge.memberId === input.memberId,
      );
      let saved: GoalContributionPledge;
      if (existing) {
        saved = {
          ...existing,
          pledgeType: input.pledgeType,
          pledgedAmount: normalizeMoney(input.pledgedAmount),
          pledgedPercent: input.pledgedPercent ?? null,
          cadence: input.cadence ?? existing.cadence,
          schedule: input.schedule ?? existing.schedule,
          nextDueDate: input.nextDueDate ?? existing.nextDueDate,
          updatedAt: now,
          history: [
            ...existing.history,
            {
              changedAt: now,
              changedByMemberId: getActorMemberId(),
              summary: 'Pledge rule updated',
            },
          ],
        };
      } else {
        saved = {
          id: crypto.randomUUID(),
          householdId: household.id,
          goalId: input.goalId,
          memberId: input.memberId,
          pledgeType: input.pledgeType,
          pledgedAmount: normalizeMoney(input.pledgedAmount),
          pledgedPercent: input.pledgedPercent ?? null,
          cadence: input.cadence ?? 'MONTHLY',
          schedule: input.schedule ?? [],
          contributedAmount: 0,
          nextDueDate: input.nextDueDate ?? null,
          history: [
            { changedAt: now, changedByMemberId: getActorMemberId(), summary: 'Pledge created' },
          ],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };
      }

      const updated = existing
        ? goalPledges.map((pledge) => (pledge.id === existing.id ? saved : pledge))
        : [...goalPledges, saved];
      saveToStorage(dbRef.current, STORAGE_KEY_GOAL_PLEDGES, updated);
      setGoalPledges(updated);
      appendActivity({
        type: 'GOALS',
        action: existing ? 'GOAL_PLEDGE_UPDATED' : 'GOAL_PLEDGE_CREATED',
        affectedObjectType: 'goalPledge',
        affectedObjectId: saved.id,
        summary: 'Goal contribution pledge saved',
        detail: 'Private account details remain hidden; only contribution commitment is shared.',
        privacy: 'AGGREGATED',
      });
      setError(null);
      return saved;
    },
    [appendActivity, getActorMemberId, goalPledges, household],
  );

  const recordGoalContribution = useCallback(
    (input: RecordGoalContributionInput): GoalContributionPledge | null => {
      const amountCents = toCents(input.amount);
      if (amountCents <= 0) {
        setError('Contribution amount must be greater than zero.');
        return null;
      }

      const now = input.contributedAt ?? new Date().toISOString();
      let saved: GoalContributionPledge | null = null;
      const updated = goalPledges.map((pledge) => {
        if (pledge.goalId !== input.goalId || pledge.memberId !== input.memberId) return pledge;
        saved = {
          ...pledge,
          contributedAmount: normalizeMoney(pledge.contributedAmount + input.amount),
          updatedAt: now,
          history: [
            ...pledge.history,
            {
              changedAt: now,
              changedByMemberId: getActorMemberId(),
              summary: input.note ?? 'Contribution recorded',
            },
          ],
        };
        return saved;
      });

      if (!saved) {
        setError('Goal pledge not found.');
        return null;
      }

      const savedPledge = saved as GoalContributionPledge;
      saveToStorage(dbRef.current, STORAGE_KEY_GOAL_PLEDGES, updated);
      setGoalPledges(updated);
      appendActivity({
        type: 'GOALS',
        action: 'GOAL_CONTRIBUTION_RECORDED',
        affectedObjectType: 'goalPledge',
        affectedObjectId: savedPledge.id,
        summary: 'Goal contribution recorded',
        detail: 'Only the attributed contribution amount is shared.',
        privacy: 'AGGREGATED',
      });
      setError(null);
      return savedPledge;
    },
    [appendActivity, getActorMemberId, goalPledges],
  );

  const createShoppingBudget = useCallback(
    (input: CreateShoppingBudgetInput): SharedShoppingBudget | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }
      const name = input.name.trim();
      if (!name || !input.budgetId || toCents(input.monthlyLimit) <= 0) {
        setError('Shopping budget needs a name, linked budget, and monthly limit.');
        return null;
      }

      const now = new Date().toISOString();
      const existing = shoppingBudgets.find((budget) => budget.budgetId === input.budgetId);
      const saved: SharedShoppingBudget = existing
        ? {
            ...existing,
            name,
            categoryIds: Array.from(new Set(input.categoryIds.filter(Boolean))),
            monthlyLimit: normalizeMoney(input.monthlyLimit),
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            householdId: household.id,
            budgetId: input.budgetId,
            name,
            categoryIds: Array.from(new Set(input.categoryIds.filter(Boolean))),
            monthlyLimit: normalizeMoney(input.monthlyLimit),
            trips: [],
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            syncVersion: 1,
            isSynced: false,
          };
      const updated = existing
        ? shoppingBudgets.map((budget) => (budget.id === existing.id ? saved : budget))
        : [...shoppingBudgets, saved];
      saveToStorage(dbRef.current, STORAGE_KEY_SHOPPING_BUDGETS, updated);
      setShoppingBudgets(updated);
      appendActivity({
        type: 'SHOPPING',
        action: existing ? 'SHOPPING_BUDGET_UPDATED' : 'SHOPPING_BUDGET_CREATED',
        affectedObjectType: 'shoppingBudget',
        affectedObjectId: saved.id,
        summary: name + ' shopping budget saved',
        detail:
          'Trips can be shared, reimbursable, or personal without exposing private transactions.',
        privacy: 'PUBLIC',
      });
      setError(null);
      return saved;
    },
    [appendActivity, household, shoppingBudgets],
  );

  const logShoppingTrip = useCallback(
    (input: LogShoppingTripInput): SharedShoppingTrip | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }
      const budget = shoppingBudgets.find((entry) => entry.id === input.shoppingBudgetId);
      const store = input.store.trim();
      const amount = normalizeMoney(input.receiptTotal);
      if (!budget || !store || toCents(amount) <= 0 || !input.payerMemberId) {
        setError('Shopping trip needs a budget, store, payer, and positive receipt total.');
        return null;
      }

      const now = new Date().toISOString();
      let sharedExpenseId: SyncId | null = null;
      if (input.generateSharedExpense && input.allocation !== 'PERSONAL') {
        const splitMemberIds = input.splitMemberIds?.length
          ? input.splitMemberIds
          : members.map((member) => member.id);
        const expense: SharedExpense = {
          id: crypto.randomUUID(),
          householdId: household.id,
          description: store + ' shopping trip',
          amount,
          paidByMemberId: input.payerMemberId,
          splitMode: 'EQUAL',
          splits: createEqualSharedExpenseSplits(amount, splitMemberIds),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncVersion: 1,
          isSynced: false,
        };
        sharedExpenseId = expense.id;
        const updatedExpenses = [...sharedExpenses, expense];
        saveToStorage(dbRef.current, STORAGE_KEY_SHARED_EXPENSES, updatedExpenses);
        setSharedExpenses(updatedExpenses);
      }

      const trip: SharedShoppingTrip = {
        id: crypto.randomUUID(),
        shoppingBudgetId: budget.id,
        store,
        receiptTotal: amount,
        payerMemberId: input.payerMemberId,
        allocation: input.allocation,
        receiptRef: input.receiptRef ?? null,
        sharedExpenseId,
        purchasedAt: input.purchasedAt ?? now,
        createdAt: now,
        updatedAt: now,
      };
      const updatedBudgets = shoppingBudgets.map((entry) =>
        entry.id === budget.id
          ? { ...entry, trips: [...entry.trips, trip], updatedAt: now }
          : entry,
      );
      saveToStorage(dbRef.current, STORAGE_KEY_SHOPPING_BUDGETS, updatedBudgets);
      setShoppingBudgets(updatedBudgets);
      appendActivity({
        type: 'SHOPPING',
        action: 'SHOPPING_TRIP_LOGGED',
        affectedObjectType: 'shoppingTrip',
        affectedObjectId: trip.id,
        summary: store + ' shopping trip logged',
        detail:
          input.allocation === 'PERSONAL'
            ? 'Marked personal; no shared expense generated.'
            : 'Receipt total added to shared shopping budget.',
        privacy: input.allocation === 'PERSONAL' ? 'REDACTED' : 'AGGREGATED',
      });
      setError(null);
      return trip;
    },
    [appendActivity, household, members, sharedExpenses, shoppingBudgets],
  );

  const setReconciliationPlan = useCallback(
    (input: SetReconciliationPlanInput): HouseholdReconciliationPlan | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }
      const name = input.name.trim();
      const participantMemberIds = Array.from(new Set(input.participantMemberIds.filter(Boolean)));
      if (!name || participantMemberIds.length === 0 || input.obligations.length === 0) {
        setError('Reconciliation needs a name, participants, and obligations.');
        return null;
      }

      const now = new Date().toISOString();
      const plan: HouseholdReconciliationPlan = {
        id: crypto.randomUUID(),
        householdId: household.id,
        name,
        periodType: input.periodType,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        participantMemberIds,
        obligations: input.obligations.map((obligation) => ({
          ...obligation,
          id: crypto.randomUUID(),
          amount: normalizeMoney(obligation.amount),
          memberIds: Array.from(new Set(obligation.memberIds.filter(Boolean))),
          shares: obligation.shares.map((share) => ({
            ...share,
            amount: normalizeMoney(share.amount),
          })),
        })),
        contributions: input.contributions.map((contribution) => ({
          ...contribution,
          amount: normalizeMoney(contribution.amount),
        })),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncVersion: 1,
        isSynced: false,
      };
      const updated = [plan, ...reconciliationPlans.filter((entry) => entry.name !== name)];
      saveToStorage(dbRef.current, STORAGE_KEY_RECONCILIATION_PLANS, updated);
      setReconciliationPlans(updated);
      appendActivity({
        type: 'RECONCILIATION',
        action: 'RECONCILIATION_PLAN_SAVED',
        affectedObjectType: 'reconciliationPlan',
        affectedObjectId: plan.id,
        summary: name + ' reconciliation plan saved',
        detail: 'Private contributions are stored as aggregate category totals unless revealed.',
        privacy: 'AGGREGATED',
      });
      setError(null);
      return plan;
    },
    [appendActivity, household, reconciliationPlans],
  );

  const markReconciliationPeriodReconciled = useCallback(
    (input: MarkReconciliationPeriodInput): ReconciliationSnapshot | null => {
      if (!household) {
        setError('No household exists. Create one first.');
        return null;
      }
      const plan = reconciliationPlans.find((entry) => entry.id === input.planId);
      if (!plan) {
        setError('Reconciliation plan not found.');
        return null;
      }

      const now = new Date().toISOString();
      const snapshot: ReconciliationSnapshot = {
        id: crypto.randomUUID(),
        householdId: household.id,
        planId: plan.id,
        periodLabel: input.periodLabel,
        startDate: input.startDate,
        endDate: input.endDate,
        summary: calculateReconciliationSummary(plan),
        createdAt: now,
        syncVersion: 1,
        isSynced: false,
      };
      const updated = [snapshot, ...reconciliationSnapshots];
      saveToStorage(dbRef.current, STORAGE_KEY_RECONCILIATION_SNAPSHOTS, updated);
      setReconciliationSnapshots(updated);
      appendActivity({
        type: 'RECONCILIATION',
        action: 'RECONCILIATION_PERIOD_LOCKED',
        affectedObjectType: 'reconciliationSnapshot',
        affectedObjectId: snapshot.id,
        summary: input.periodLabel + ' reconciliation was marked complete',
        detail: 'Snapshot is immutable local-first history for this device.',
        privacy: 'AGGREGATED',
      });
      setError(null);
      return snapshot;
    },
    [appendActivity, household, reconciliationPlans, reconciliationSnapshots],
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
        saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, updated);
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

        saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, updated);
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

        saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, updated);
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

        saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, updated);
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

        saveToStorage(dbRef.current, STORAGE_KEY_CHILDREN, updated);
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
    activityEvents,
    recurringBills,
    goalPledges,
    shoppingBudgets,
    reconciliationPlans,
    reconciliationSnapshots,
    loading,
    error,
    createHousehold,
    inviteMember,
    getInvitationByCode,
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
    createRecurringSharedBill,
    setRecurringBillPaused,
    updateRecurringBill,
    removeRecurringBill,
    updateRecurringBillCycle,
    markRecurringBillCyclePaid,
    setGoalContributionPledge,
    recordGoalContribution,
    createShoppingBudget,
    logShoppingTrip,
    setReconciliationPlan,
    markReconciliationPeriodReconciled,
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

/**
 * Access the encrypted SQLite database without crashing if the household screen
 * is mounted outside a `DatabaseProvider`.
 *
 * `useDatabase` throws when no provider is mounted. The household feature keeps
 * all persistence behind this guard (mirroring the optional account/budget
 * reads on {@link ../pages/HouseholdPage}) so the hook degrades to in-memory
 * state — never throwing — in isolated tests or provider-less render paths.
 *
 * Issue #3378.
 */
function useOptionalDatabase(): AsyncDb | null {
  try {
    return useDatabase();
  } catch {
    return null;
  }
}
