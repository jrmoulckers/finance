// SPDX-License-Identifier: BUSL-1.1

/**
 * Household management page.
 *
 * Provides household creation, member invitation with privacy-by-default,
 * role management (OWNER, ADMIN, MEMBER, VIEWER), trusted helper read-only access,
 * account sharing (mine/yours/ours), shared budget configuration, shared goals, and roommate settle-up.
 *
 * References: issues #1780, #1779, #1781, #1716, #1784, #1786, #2144, #2156
 */

import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AppIcon } from '../components/icons';

import { useAuth } from '../auth/auth-context';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { CurrencyDisplay } from '../components/common/CurrencyDisplay';
import { Checkbox } from '../components/common/Checkbox';
import { useToast } from '../components/common/Toast';
import {
  ALLOWANCE_DAY_OPTIONS,
  buildChildFinanceRollup,
  calculateChildWeeklyChoreEarnings,
  getChildTransactionUpdate,
  getTaggedTransactionChildId,
  type AllowanceDay,
  type ChildProfile,
  type ChoreFrequency,
} from '../hooks/householdKids';
import {
  buildRecurringBillReminders,
  calculateGoalPledgeProgress,
  calculateReconciliationSummary,
  calculateShoppingBudgetSummary,
  createEqualSharedExpenseSplits,
  type HouseholdActivityType,
  type PayerRotationMode,
  type RecurringBillCadence,
  type SharedExpenseSplit,
  type SharedExpenseSplitMode,
  type ShoppingTripAllocation,
  type TrustedHelperAccessMethod,
  useHousehold,
} from '../hooks/useHousehold';
import { getScorecardBudgetSnapshots, useBudgets } from '../hooks/useBudgets';
import type { ScorecardBudgetSnapshot, UseBudgetsResult } from '../hooks/useBudgets';
import { useAccounts } from '../hooks/useAccounts';
import type { UseAccountsResult } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import type { UseCategoriesResult } from '../hooks/useCategories';
import { useGoals } from '../hooks/useGoals';
import type { UseGoalsResult } from '../hooks/useGoals';
import { useTransactions } from '../hooks/useTransactions';
import type { UseTransactionsResult } from '../hooks/useTransactions';
import type {
  AccountSharing,
  HouseholdMember,
  HouseholdRole,
  AccountSharingMode,
  SharedBudgetMode,
  Transaction,
} from '../kmp/bridge';
import { ROLE_PERMISSIONS } from '../kmp/bridge';
import { buildInviteUrl, getMemberDisplayName } from '../lib/household/display-name';
import { buildTeenLearningRecordFromChild } from '../lib/household/teen-learning-local';
import {
  buildTeenParentReviewSummary,
  TEEN_LEARNING_HOUSEHOLD_COPY,
} from '../lib/household/teen-review-summaries';

import './HouseholdPage.css';

// Lazy-loaded so the supportive couples money check-in flow lands in its own
// sub-chunk and never grows this large route past the performance budget (#2150).
const MoneyCheckInDialog = lazy(() => import('../components/household/MoneyCheckInDialog'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Role options for assignment (excludes OWNER — assigned only on creation). */
const ROLE_OPTIONS: readonly { value: HouseholdRole; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Admin', description: 'Can manage members and shared finances' },
  { value: 'MEMBER', label: 'Member', description: 'Can view shared data and add transactions' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to shared data' },
];

const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const TRUSTED_HELPER_ACCESS_OPTIONS: readonly {
  value: TrustedHelperAccessMethod;
  label: string;
  description: string;
}[] = [
  {
    value: 'SHARED_DEVICE',
    label: 'Use this app with me on this device',
    description: 'Best for sitting together to review bills and balances.',
  },
  {
    value: 'READ_ONLY_SUMMARY',
    label: 'I will share a read-only summary',
    description: 'Best when they only need a snapshot to review outside the app.',
  },
  {
    value: 'INVITE_LATER',
    label: 'I will send access details later',
    description: 'Best when you want to set their read-only role now.',
  },
];

const SHARING_MODE_LABELS: Record<AccountSharingMode, string> = {
  PRIVATE: 'Private (Mine Only)',
  SHARED: 'Shared (Ours)',
};

const BUDGET_MODE_LABELS: Record<SharedBudgetMode, string> = {
  FLEX: 'Flex (overall limit)',
  CATEGORY: 'Category (per-category limits)',
};

const DEFAULT_CHORE_FREQUENCY: ChoreFrequency = 'weekly';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const ALLOWANCE_DAY_LABELS = Object.fromEntries(
  ALLOWANCE_DAY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AllowanceDay, string>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HouseholdPage() {
  const {
    household,
    members,
    invitations,
    accountSharings,
    sharedBudgets,
    sharedGoals,
    sharedExpenses,
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
    revokeInvitation,
    addTrustedHelper,
    updateMemberRole,
    removeMember,
    setAccountSharing,
    setSharedBudget,
    removeSharedBudget,
    setSharedGoal,
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
    checkPermission,
  } = useHousehold();

  // Issue #1931: pull the auth user as a fallback for the owner's display name
  // (so the user's own entry never shows a raw UUID).
  const authUser = useOptionalAuthUser();

  // Issue #1933: copy the full invite URL on click and confirm via toast.
  const toast = useOptionalToast();

  // Issue #2188: scorecard pace uses live budgets when available and falls
  // back to deterministic demo snapshots for local-first households.
  const budgetData = useOptionalBudgets();
  const accountData = useOptionalAccounts();

  // Issue #2191: child finance rollups combine existing child profiles with
  // local transactions and savings goals.
  const goalData = useOptionalGoals();
  const transactionData = useOptionalTransactions();
  const categoryData = useOptionalCategories();

  // Issues #3375/#3376: resolve real account/budget/goal names for household
  // sharing surfaces and reconciliation labels instead of hardcoded demo maps.
  const budgetNameById = useMemo(
    () => new Map(budgetData.budgets.map((budget) => [budget.id, budget.name])),
    [budgetData.budgets],
  );
  const goalNameById = useMemo(
    () => new Map(goalData.goals.map((goal) => [goal.id, goal.name])),
    [goalData.goals],
  );
  const childFinance = useMemo(
    () =>
      buildChildFinanceRollup({
        children,
        transactions: transactionData.transactions,
        goals: goalData.goals,
        categories: categoryData.categories,
      }),
    [categoryData.categories, children, goalData.goals, transactionData.transactions],
  );

  // -- Create household form state -----------------------------------------
  const [householdName, setHouseholdName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // -- Invite form state ---------------------------------------------------
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<HouseholdRole>('MEMBER');
  const [memberPendingRemoval, setMemberPendingRemoval] = useState<{
    id: string;
    name: string;
    isViewer: boolean;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  // The just-created invite's code, surfaced as a shareable link once the
  // invitation has actually been persisted to the synced store (#3377).
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);

  // -- Trusted helper form state -------------------------------------------
  const [trustedHelperName, setTrustedHelperName] = useState('');
  const [trustedHelperAccessMethod, setTrustedHelperAccessMethod] =
    useState<TrustedHelperAccessMethod>('SHARED_DEVICE');
  const [trustedHelperError, setTrustedHelperError] = useState<string | null>(null);
  const [trustedHelperSuccessName, setTrustedHelperSuccessName] = useState<string | null>(null);

  // -- Shared expenses form state ------------------------------------------
  const [sharedExpenseDescription, setSharedExpenseDescription] = useState('');
  const [sharedExpenseAmount, setSharedExpenseAmount] = useState('');
  const [sharedExpensePaidBy, setSharedExpensePaidBy] = useState('');
  const [sharedExpenseSplitMode, setSharedExpenseSplitMode] =
    useState<SharedExpenseSplitMode>('EQUAL');
  const [sharedExpenseSelectedMembers, setSharedExpenseSelectedMembers] = useState<
    Record<string, boolean>
  >({});
  const [customSplitAmounts, setCustomSplitAmounts] = useState<Record<string, string>>({});
  const [sharedExpenseError, setSharedExpenseError] = useState<string | null>(null);

  // -- Household beta form state -------------------------------------------
  const [recurringBillName, setRecurringBillName] = useState('');
  const [recurringBillAmount, setRecurringBillAmount] = useState('');
  const [recurringBillDueDay, setRecurringBillDueDay] = useState('1');
  const [recurringBillCadence, setRecurringBillCadence] = useState<RecurringBillCadence>('MONTHLY');
  const [recurringBillPayer, setRecurringBillPayer] = useState('');
  const [recurringBillRotation, setRecurringBillRotation] =
    useState<PayerRotationMode>('ROUND_ROBIN');
  // Split configuration for new recurring bills (#3384).
  const [recurringBillSplitMode, setRecurringBillSplitMode] =
    useState<SharedExpenseSplitMode>('EQUAL');
  const [recurringBillCustomSplits, setRecurringBillCustomSplits] = useState<
    Record<string, string>
  >({});
  // Inline edit state for existing recurring bills (#3385).
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillAmount, setEditBillAmount] = useState('');
  const [editBillDueDay, setEditBillDueDay] = useState('1');
  const [editBillCadence, setEditBillCadence] = useState<RecurringBillCadence>('MONTHLY');
  const [editBillSplitMode, setEditBillSplitMode] = useState<SharedExpenseSplitMode>('EQUAL');
  const [editBillCustomSplits, setEditBillCustomSplits] = useState<Record<string, string>>({});
  const [pendingDeleteBillId, setPendingDeleteBillId] = useState<string | null>(null);
  const [goalPledgeGoalId, setGoalPledgeGoalId] = useState('');
  const [goalPledgeMemberId, setGoalPledgeMemberId] = useState('');
  const [goalPledgeAmount, setGoalPledgeAmount] = useState('');
  const [shoppingBudgetName, setShoppingBudgetName] = useState('Groceries and supplies');
  const [shoppingBudgetLimit, setShoppingBudgetLimit] = useState('600');
  const [shoppingBudgetCategories, setShoppingBudgetCategories] = useState('groceries, household');
  const [shoppingTripBudgetId, setShoppingTripBudgetId] = useState('');
  const [shoppingTripStore, setShoppingTripStore] = useState('');
  const [shoppingTripTotal, setShoppingTripTotal] = useState('');
  const [shoppingTripPayer, setShoppingTripPayer] = useState('');
  const [shoppingTripAllocation, setShoppingTripAllocation] =
    useState<ShoppingTripAllocation>('SHARED');
  const [activityFilter, setActivityFilter] = useState<HouseholdActivityType | 'ALL'>('ALL');
  const [householdBetaError, setHouseholdBetaError] = useState<string | null>(null);

  // -- Kids & allowances form state ----------------------------------------
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('12');
  const [childWeeklyAllowance, setChildWeeklyAllowance] = useState('10');
  const [childStartingBalance, setChildStartingBalance] = useState('0');
  const [childAllowanceDay, setChildAllowanceDay] = useState<AllowanceDay>('friday');
  const [kidError, setKidError] = useState<string | null>(null);
  const [choreDrafts, setChoreDrafts] = useState<
    Record<string, { name: string; value: string; frequency: ChoreFrequency }>
  >({});
  const [withdrawalDrafts, setWithdrawalDrafts] = useState<Record<string, string>>({});
  const [collegeFundDrafts, setCollegeFundDrafts] = useState<
    Record<string, { target: string; current: string }>
  >({});
  const [transactionDrafts, setTransactionDrafts] = useState<Record<string, string>>({});

  // -- Couples money check-in (#2150) --------------------------------------
  const [checkInOpen, setCheckInOpen] = useState(false);

  // -- Handlers ------------------------------------------------------------

  const handleCreateHousehold = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setCreateError(null);

      const trimmed = householdName.trim();
      if (!trimmed) {
        setCreateError('Household name is required.');
        return;
      }

      const result = createHousehold({ name: trimmed });
      if (!result) {
        setCreateError('Failed to create household.');
      }
    },
    [householdName, createHousehold],
  );

  const handleInviteMember = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setInviteError(null);
      setInviteSuccess(false);
      setLastInviteCode(null);
      const trimmedEmail = inviteEmail.trim();
      if (!trimmedEmail) {
        setInviteError('Email address is required.');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setInviteError('Please enter a valid email address.');
        return;
      }

      const result = inviteMember({ email: trimmedEmail, role: inviteRole });
      if (result) {
        setInviteEmail('');
        setInviteSuccess(true);
        setLastInviteCode(result.inviteCode);
      } else {
        setInviteError('Failed to send invitation.');
      }
    },
    [inviteEmail, inviteRole, inviteMember],
  );

  const handleAddTrustedHelper = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setTrustedHelperError(null);
      setTrustedHelperSuccessName(null);

      const name = trustedHelperName.trim();
      if (!name) {
        setTrustedHelperError('Enter the name of the person helping you.');
        return;
      }

      const helper = addTrustedHelper({ name, accessMethod: trustedHelperAccessMethod });
      if (!helper) {
        setTrustedHelperError('Failed to add trusted helper.');
        return;
      }

      setTrustedHelperName('');
      setTrustedHelperAccessMethod('SHARED_DEVICE');
      setTrustedHelperSuccessName(name);
    },
    [addTrustedHelper, trustedHelperAccessMethod, trustedHelperName],
  );

  const handleToggleSharedExpenseMember = useCallback((memberId: string, checked: boolean) => {
    setSharedExpenseSelectedMembers((current) => ({ ...current, [memberId]: checked }));
  }, []);

  const handleLogSharedExpense = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setSharedExpenseError(null);

      const description = sharedExpenseDescription.trim();
      const amount = Number(sharedExpenseAmount);
      const paidByMemberId = sharedExpensePaidBy || members[0]?.id || '';
      const selectedMemberIds = members
        .filter((member) => sharedExpenseSelectedMembers[member.id] ?? true)
        .map((member) => member.id);

      if (!description) {
        setSharedExpenseError('Expense description is required.');
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        setSharedExpenseError('Total amount must be greater than zero.');
        return;
      }

      if (!paidByMemberId) {
        setSharedExpenseError('Choose who paid.');
        return;
      }

      if (selectedMemberIds.length === 0) {
        setSharedExpenseError('Select at least one member to split the expense.');
        return;
      }

      let splits: SharedExpenseSplit[];
      try {
        splits =
          sharedExpenseSplitMode === 'EQUAL'
            ? createEqualSharedExpenseSplits(amount, selectedMemberIds)
            : selectedMemberIds.map((memberId) => ({
                memberId,
                amount: Number(customSplitAmounts[memberId] ?? '0'),
              }));
      } catch (err) {
        setSharedExpenseError(err instanceof Error ? err.message : 'Unable to split this expense.');
        return;
      }

      if (splits.some((split) => !Number.isFinite(split.amount) || split.amount < 0)) {
        setSharedExpenseError('Custom split amounts must be zero or more.');
        return;
      }

      if (
        sharedExpenseSplitMode === 'CUSTOM' &&
        splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0) !==
          Math.round(amount * 100)
      ) {
        setSharedExpenseError('Custom split amounts must add up to the total expense.');
        return;
      }

      const result = logSharedExpense({
        description,
        amount,
        paidByMemberId,
        splitMode: sharedExpenseSplitMode,
        splits,
      });

      if (!result) {
        setSharedExpenseError('Failed to log shared expense.');
        return;
      }

      setSharedExpenseDescription('');
      setSharedExpenseAmount('');
      setSharedExpensePaidBy('');
      setCustomSplitAmounts({});
    },
    [
      customSplitAmounts,
      logSharedExpense,
      members,
      sharedExpenseAmount,
      sharedExpenseDescription,
      sharedExpensePaidBy,
      sharedExpenseSelectedMembers,
      sharedExpenseSplitMode,
    ],
  );

  const handleRecordSharedSettlement = useCallback(
    (fromMemberId: string, toMemberId: string, amount: number) => {
      setSharedExpenseError(null);
      const result = recordSharedSettlement({ fromMemberId, toMemberId, amount });
      if (!result) {
        setSharedExpenseError('Failed to mark the debt as settled.');
      }
    },
    [recordSharedSettlement],
  );

  const handleCreateRecurringBill = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setHouseholdBetaError(null);
      const payer = recurringBillPayer || members[0]?.id || '';
      const amount = Number(recurringBillAmount);
      const dueDay = Number(recurringBillDueDay);
      if (!recurringBillName.trim() || !Number.isFinite(amount) || amount <= 0 || !payer) {
        setHouseholdBetaError('Recurring bill needs a name, amount, and payer.');
        return;
      }
      const memberIds = members.map((member) => member.id);
      let customSplits: SharedExpenseSplit[] | undefined;
      if (recurringBillSplitMode === 'CUSTOM') {
        customSplits = memberIds.map((memberId) => ({
          memberId,
          amount: Number(recurringBillCustomSplits[memberId] ?? '0'),
        }));
        if (customSplits.some((split) => !Number.isFinite(split.amount) || split.amount < 0)) {
          setHouseholdBetaError('Custom split amounts must be zero or more.');
          return;
        }
        const customTotalCents = customSplits.reduce(
          (sum, split) => sum + Math.round(split.amount * 100),
          0,
        );
        if (customTotalCents !== Math.round(amount * 100)) {
          setHouseholdBetaError('Custom split amounts must add up to the estimated amount.');
          return;
        }
      }
      const bill = createRecurringSharedBill({
        name: recurringBillName,
        estimatedAmount: amount,
        dueDay,
        cadence: recurringBillCadence,
        splitMode: recurringBillSplitMode,
        splitMemberIds: memberIds,
        ...(customSplits ? { customSplits } : {}),
        defaultPayerMemberId: payer,
        rotationMode: recurringBillRotation,
        payerRotationMemberIds: memberIds,
      });
      if (!bill) {
        setHouseholdBetaError('Failed to create recurring bill.');
        return;
      }
      setRecurringBillName('');
      setRecurringBillAmount('');
      setRecurringBillDueDay('1');
      setRecurringBillSplitMode('EQUAL');
      setRecurringBillCustomSplits({});
    },
    [
      createRecurringSharedBill,
      members,
      recurringBillAmount,
      recurringBillCadence,
      recurringBillCustomSplits,
      recurringBillDueDay,
      recurringBillName,
      recurringBillPayer,
      recurringBillRotation,
      recurringBillSplitMode,
    ],
  );

  const beginEditRecurringBill = useCallback(
    (billId: string) => {
      const bill = recurringBills.find((entry) => entry.id === billId);
      if (!bill) return;
      setEditingBillId(billId);
      setEditBillName(bill.name);
      setEditBillAmount(String(bill.estimatedAmount));
      setEditBillDueDay(String(bill.dueDay));
      setEditBillCadence(bill.cadence);
      setEditBillSplitMode(bill.splitMode);
      setEditBillCustomSplits(
        Object.fromEntries(
          (bill.customSplits ?? []).map((split) => [split.memberId, String(split.amount)]),
        ),
      );
      setPendingDeleteBillId(null);
      setHouseholdBetaError(null);
    },
    [recurringBills],
  );

  const cancelEditRecurringBill = useCallback(() => {
    setEditingBillId(null);
    setEditBillCustomSplits({});
  }, []);

  const handleSaveRecurringBillEdit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!editingBillId) return;
      setHouseholdBetaError(null);
      const amount = Number(editBillAmount);
      const dueDay = Number(editBillDueDay);
      if (!editBillName.trim() || !Number.isFinite(amount) || amount <= 0) {
        setHouseholdBetaError('Recurring bill needs a name and a positive amount.');
        return;
      }
      const memberIds = members.map((member) => member.id);
      let customSplits: SharedExpenseSplit[] | undefined;
      if (editBillSplitMode === 'CUSTOM') {
        customSplits = memberIds.map((memberId) => ({
          memberId,
          amount: Number(editBillCustomSplits[memberId] ?? '0'),
        }));
        if (customSplits.some((split) => !Number.isFinite(split.amount) || split.amount < 0)) {
          setHouseholdBetaError('Custom split amounts must be zero or more.');
          return;
        }
        const customTotalCents = customSplits.reduce(
          (sum, split) => sum + Math.round(split.amount * 100),
          0,
        );
        if (customTotalCents !== Math.round(amount * 100)) {
          setHouseholdBetaError('Custom split amounts must add up to the estimated amount.');
          return;
        }
      }
      const updated = updateRecurringBill({
        billId: editingBillId,
        name: editBillName,
        estimatedAmount: amount,
        dueDay,
        cadence: editBillCadence,
        splitMode: editBillSplitMode,
        splitMemberIds: memberIds,
        customSplits: editBillSplitMode === 'CUSTOM' ? customSplits : [],
      });
      if (!updated) {
        setHouseholdBetaError('Failed to update recurring bill.');
        return;
      }
      setEditingBillId(null);
      setEditBillCustomSplits({});
    },
    [
      editBillAmount,
      editBillCadence,
      editBillCustomSplits,
      editBillDueDay,
      editBillName,
      editBillSplitMode,
      editingBillId,
      members,
      updateRecurringBill,
    ],
  );

  const handleDeleteRecurringBill = useCallback(
    (billId: string) => {
      const removed = removeRecurringBill(billId);
      if (!removed) {
        setHouseholdBetaError('Failed to delete recurring bill.');
        return;
      }
      setPendingDeleteBillId(null);
      if (editingBillId === billId) {
        setEditingBillId(null);
      }
    },
    [editingBillId, removeRecurringBill],
  );

  const handleSaveGoalPledge = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setHouseholdBetaError(null);
      const memberId = goalPledgeMemberId || members[0]?.id || '';
      const amount = Number(goalPledgeAmount);
      if (!goalPledgeGoalId || !memberId || !Number.isFinite(amount) || amount <= 0) {
        setHouseholdBetaError('Goal pledge needs a goal, member, and amount.');
        return;
      }
      const pledge = setGoalContributionPledge({
        goalId: goalPledgeGoalId,
        memberId,
        pledgeType: 'FIXED',
        pledgedAmount: amount,
        cadence: 'MONTHLY',
        nextDueDate: new Date().toISOString().slice(0, 10),
      });
      if (!pledge) {
        setHouseholdBetaError('Failed to save goal pledge.');
        return;
      }
      setGoalPledgeAmount('');
    },
    [goalPledgeAmount, goalPledgeGoalId, goalPledgeMemberId, members, setGoalContributionPledge],
  );

  const handleRecordGoalContribution = useCallback(
    (goalId: string, memberId: string, remainingAmount: number) => {
      setHouseholdBetaError(null);
      const pledge = recordGoalContribution({
        goalId,
        memberId,
        amount: Math.min(25, Math.max(1, remainingAmount || 25)),
        note: 'Quick contribution from household page',
      });
      if (!pledge) {
        setHouseholdBetaError('Failed to record goal contribution.');
      }
    },
    [recordGoalContribution],
  );

  const handleCreateShoppingBudget = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setHouseholdBetaError(null);
      const monthlyLimit = Number(shoppingBudgetLimit);
      if (!shoppingBudgetName.trim() || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
        setHouseholdBetaError('Shopping budget needs a name and monthly limit.');
        return;
      }
      const budget = createShoppingBudget({
        budgetId:
          'shopping-' +
          shoppingBudgetName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-'),
        name: shoppingBudgetName,
        monthlyLimit,
        categoryIds: shoppingBudgetCategories
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      });
      if (!budget) {
        setHouseholdBetaError('Failed to create shopping budget.');
        return;
      }
      setShoppingTripBudgetId(budget.id);
    },
    [createShoppingBudget, shoppingBudgetCategories, shoppingBudgetLimit, shoppingBudgetName],
  );

  const handleLogShoppingTrip = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setHouseholdBetaError(null);
      const budgetId = shoppingTripBudgetId || shoppingBudgets[0]?.id || '';
      const payer = shoppingTripPayer || members[0]?.id || '';
      const receiptTotal = Number(shoppingTripTotal);
      if (
        !budgetId ||
        !shoppingTripStore.trim() ||
        !Number.isFinite(receiptTotal) ||
        receiptTotal <= 0 ||
        !payer
      ) {
        setHouseholdBetaError('Shopping trip needs a budget, store, total, and payer.');
        return;
      }
      const trip = logShoppingTrip({
        shoppingBudgetId: budgetId,
        store: shoppingTripStore,
        receiptTotal,
        payerMemberId: payer,
        allocation: shoppingTripAllocation,
        generateSharedExpense: shoppingTripAllocation !== 'PERSONAL',
        splitMemberIds: members.map((member) => member.id),
      });
      if (!trip) {
        setHouseholdBetaError('Failed to log shopping trip.');
        return;
      }
      setShoppingTripStore('');
      setShoppingTripTotal('');
    },
    [
      logShoppingTrip,
      members,
      shoppingBudgets,
      shoppingTripAllocation,
      shoppingTripBudgetId,
      shoppingTripPayer,
      shoppingTripStore,
      shoppingTripTotal,
    ],
  );

  const handleCreateReconciliationPlan = useCallback(() => {
    setHouseholdBetaError(null);
    const participantMemberIds = members.map((member) => member.id);
    if (participantMemberIds.length === 0) {
      setHouseholdBetaError('Add members before creating reconciliation.');
      return;
    }
    const obligationSeeds = [
      ...sharedBudgets.map((budget) => ({
        label: budgetNameById.get(budget.budgetId) ?? 'Shared budget',
        amount: 300,
        sourceId: budget.budgetId,
        sourceType: 'BUDGET' as const,
      })),
      ...recurringBills.map((bill) => ({
        label: bill.name,
        amount: bill.estimatedAmount,
        sourceId: bill.id,
        sourceType: 'BILL' as const,
      })),
    ];
    const obligations = (
      obligationSeeds.length
        ? obligationSeeds
        : [
            {
              label: 'Shared household obligation',
              amount: 200,
              sourceId: 'demo-shared',
              sourceType: 'CATEGORY' as const,
            },
          ]
    ).map((entry) => ({
      ...entry,
      memberIds: participantMemberIds,
      shareMode: 'EQUAL' as const,
      shares: [],
    }));
    const plan = setReconciliationPlan({
      name: 'Current month true-up',
      periodType: 'MONTHLY',
      participantMemberIds,
      obligations,
      contributions: participantMemberIds.map((memberId) => ({
        memberId,
        amount: sharedExpenseBalances.find((balance) => balance.memberId === memberId)?.paid ?? 0,
        label: 'Private-account aggregate payments',
        visibility: 'AGGREGATE_ONLY',
      })),
    });
    if (!plan) {
      setHouseholdBetaError('Failed to create reconciliation plan.');
    }
  }, [
    budgetNameById,
    members,
    recurringBills,
    setReconciliationPlan,
    sharedBudgets,
    sharedExpenseBalances,
  ]);

  const handleMarkReconciled = useCallback(
    (planId: string) => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const snapshot = markReconciliationPeriodReconciled({
        planId,
        periodLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        startDate: start,
        endDate: end,
      });
      if (!snapshot) {
        setHouseholdBetaError('Failed to mark reconciliation complete.');
      }
    },
    [markReconciliationPeriodReconciled],
  );

  const getChoreDraft = useCallback(
    (childId: ChildProfile['id']) =>
      choreDrafts[childId] ?? { name: '', value: '', frequency: DEFAULT_CHORE_FREQUENCY },
    [choreDrafts],
  );

  const getCollegeFundDraft = useCallback(
    (childId: ChildProfile['id']) =>
      collegeFundDrafts[childId] ?? { target: '50000', current: '0' },
    [collegeFundDrafts],
  );

  const updateCollegeFundDraft = useCallback(
    (childId: string, field: 'target' | 'current', value: string) => {
      setCollegeFundDrafts((current) => ({
        ...current,
        [childId]: {
          ...(current[childId] ?? { target: '50000', current: '0' }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleCreateChild = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setKidError(null);

      const trimmedName = childName.trim();
      const parsedAge = Number(childAge);
      const parsedAllowance = Number(childWeeklyAllowance);
      const parsedStartingBalance = Number(childStartingBalance || '0');

      if (!trimmedName) {
        setKidError('Child name is required.');
        return;
      }

      if (!Number.isInteger(parsedAge) || parsedAge < 0) {
        setKidError('Enter a valid age (0 for under one year).');
        return;
      }

      if (!Number.isFinite(parsedAllowance) || parsedAllowance < 0) {
        setKidError('Weekly allowance must be zero or more.');
        return;
      }

      if (!Number.isFinite(parsedStartingBalance) || parsedStartingBalance < 0) {
        setKidError('Starting balance must be zero or more.');
        return;
      }

      const result = createChildProfile({
        name: trimmedName,
        age: parsedAge,
        weeklyAllowance: parsedAllowance,
        allowanceDay: childAllowanceDay,
        balance: parsedStartingBalance,
      });

      if (!result) {
        setKidError('Failed to create child profile.');
        return;
      }

      setChildName('');
      setChildAge('12');
      setChildWeeklyAllowance('10');
      setChildStartingBalance('0');
      setChildAllowanceDay('friday');
    },
    [
      childAge,
      childAllowanceDay,
      childName,
      childStartingBalance,
      childWeeklyAllowance,
      createChildProfile,
    ],
  );

  const updateChoreDraft = useCallback(
    (childId: string, field: 'name' | 'value' | 'frequency', value: string) => {
      setChoreDrafts((current) => ({
        ...current,
        [childId]: {
          ...(current[childId] ?? {
            name: '',
            value: '',
            frequency: DEFAULT_CHORE_FREQUENCY,
          }),
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleAddChore = useCallback(
    (e: FormEvent, childId: string) => {
      e.preventDefault();
      setKidError(null);

      const draft = getChoreDraft(childId);
      const trimmedName = draft.name.trim();
      const parsedValue = Number(draft.value);

      if (!trimmedName) {
        setKidError('Chore name is required.');
        return;
      }

      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        setKidError('Chore value must be zero or more.');
        return;
      }

      const result = addChildChore({
        childId,
        name: trimmedName,
        value: parsedValue,
        frequency: draft.frequency,
      });

      if (!result) {
        setKidError('Failed to add chore.');
        return;
      }

      setChoreDrafts((current) => ({
        ...current,
        [childId]: { name: '', value: '', frequency: DEFAULT_CHORE_FREQUENCY },
      }));
    },
    [addChildChore, getChoreDraft],
  );

  const handleRecordWithdrawal = useCallback(
    (e: FormEvent, childId: string) => {
      e.preventDefault();
      setKidError(null);

      const parsedAmount = Number(withdrawalDrafts[childId] ?? '0');
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setKidError('Withdrawal amount must be greater than zero.');
        return;
      }

      const result = recordChildWithdrawal({ childId, amount: parsedAmount });
      if (!result) {
        setKidError('Failed to record withdrawal.');
        return;
      }

      setWithdrawalDrafts((current) => ({ ...current, [childId]: '' }));
    },
    [recordChildWithdrawal, withdrawalDrafts],
  );

  const handleCreateCollegeFund = useCallback(
    async (e: FormEvent, child: ChildProfile) => {
      e.preventDefault();
      setKidError(null);

      if (!household) {
        setKidError('Create a household before adding college funds.');
        return;
      }

      const draft = getCollegeFundDraft(child.id);
      const targetAmount = Number(draft.target);
      const currentAmount = Number(draft.current || '0');

      if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        setKidError('College fund target must be greater than zero.');
        return;
      }

      if (!Number.isFinite(currentAmount) || currentAmount < 0) {
        setKidError('College fund starting balance must be zero or more.');
        return;
      }

      const yearsUntilCollege = Math.max(18 - child.age, 1);
      const collegeStartDate = new Date();
      collegeStartDate.setFullYear(collegeStartDate.getFullYear() + yearsUntilCollege);
      const targetDate = collegeStartDate.toISOString().slice(0, 10);

      const createdGoal = await goalData.createGoal({
        householdId: household.id,
        name: `${child.name} College Fund`,
        description: `Dedicated college fund for ${child.name}.`,
        targetAmount: { amount: dollarsToCents(targetAmount) },
        currentAmount: { amount: dollarsToCents(currentAmount) },
        targetDate,
        status: 'ACTIVE',
        icon: '🎓',
        color: '#7c3aed',
      });

      if (!createdGoal) {
        setKidError('Failed to create college fund goal.');
        return;
      }

      const linkedChild = linkChildCollegeFundGoal({ childId: child.id, goalId: createdGoal.id });
      if (!linkedChild) {
        setKidError('Failed to link college fund to child profile.');
        return;
      }

      setCollegeFundDrafts((current) => ({
        ...current,
        [child.id]: { target: '50000', current: '0' },
      }));
    },
    [getCollegeFundDraft, goalData, household, linkChildCollegeFundGoal],
  );

  const handleTagTransaction = useCallback(
    (e: FormEvent, childId: string) => {
      e.preventDefault();
      setKidError(null);

      const transactionId = transactionDrafts[childId];
      const transaction = transactionData.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        setKidError('Choose an expense transaction to tag.');
        return;
      }

      const update = getChildTransactionUpdate(transaction, childId);
      const updated = transactionData.updateTransaction(transaction.id, update);
      if (!updated) {
        setKidError('Failed to tag expense transaction.');
        return;
      }

      setTransactionDrafts((current) => ({ ...current, [childId]: '' }));
    },
    [transactionData, transactionDrafts],
  );

  /**
   * Resolve a member to a human-readable label.
   *
   * For the OWNER specifically we also fall back to the current
   * signed-in user's OAuth name / email so the user's *own* row
   * never displays a raw UUID (issue #1931).
   */
  const resolveMemberName = useCallback(
    (member: { displayName?: string | null; userId?: string | null; role: HouseholdRole }) => {
      const isCurrentUser =
        member.role === 'OWNER' || (authUser?.id && member.userId === authUser.id);
      const profile = isCurrentUser
        ? { name: authUser?.name ?? null, email: authUser?.email ?? null }
        : null;
      return getMemberDisplayName(member, profile);
    },
    [authUser?.id, authUser?.name, authUser?.email],
  );

  /**
   * Click handler for the invite-code chip.
   *
   * Issue #1933: copies the full invite URL (not just the bare code) to
   * the clipboard and shows a brief "Invite link copied" toast.  Falls
   * back to `document.execCommand('copy')` on browsers that don't expose
   * `navigator.clipboard.writeText` (older Safari, file://, http://, etc.).
   */
  const handleCopyInvite = useCallback(
    async (code: string) => {
      const url = buildInviteUrl(code);
      const success = await copyToClipboard(url);
      if (success) {
        toast?.showToast({
          type: 'success',
          message: 'Invite link copied',
          duration: 2000,
        });
      } else {
        toast?.showToast({
          type: 'error',
          message: `Couldn't copy automatically. Copy this link manually: ${url}`,
          duration: 6000,
        });
      }
    },
    [toast],
  );

  const trustedHelperAccessOption = TRUSTED_HELPER_ACCESS_OPTIONS.find(
    (option) => option.value === trustedHelperAccessMethod,
  );

  // -- Loading state -------------------------------------------------------

  if (loading) {
    return (
      <div className="household-page" role="status" aria-live="polite" aria-label="Loading">
        <p className="household-page__loading">Loading household data…</p>
      </div>
    );
  }

  // -- No household yet — show creation form --------------------------------

  if (!household) {
    return (
      <main className="household-page" aria-labelledby="create-household-title">
        <section className="household-card">
          <h1 id="create-household-title" className="household-card__title">
            Create Your Household
          </h1>
          <p className="household-card__description">
            Set up a household to share budgets and track finances together with family members.
            Privacy-by-default: nothing is shared until you explicitly opt in.
          </p>

          {createError && (
            <div className="household-banner--error" role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateHousehold} noValidate>
            <div className="household-form-group">
              <label
                htmlFor="household-name"
                className="household-form-group__label household-form-group__label--required"
              >
                Household Name
              </label>
              <input
                id="household-name"
                className="household-form-input"
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Smith Family"
                aria-required="true"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="household-button household-button--primary">
              Create Household
            </button>
          </form>
        </section>
      </main>
    );
  }

  // -- Filter pending invitations for display
  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');
  const scorecard = useMemo(
    () =>
      buildHouseholdScorecard({
        members,
        budgetSnapshots: getScorecardBudgetSnapshots(budgetData.budgets, household.id),
        transactions: transactionData.transactions,
        accountSharings,
        resolveMemberName,
        referenceDate: new Date(),
      }),
    [
      accountSharings,
      budgetData.budgets,
      household.id,
      members,
      resolveMemberName,
      transactionData.transactions,
    ],
  );

  const recurringBillReminders = useMemo(
    () => buildRecurringBillReminders(recurringBills),
    [recurringBills],
  );
  const goalPledgeProgress = useMemo(() => {
    const pledgedGoalIds = Array.from(new Set(goalPledges.map((pledge) => pledge.goalId)));
    return pledgedGoalIds.map((goalId) => calculateGoalPledgeProgress(goalPledges, goalId));
  }, [goalPledges]);
  const shoppingBudgetSummaries = useMemo(
    () =>
      shoppingBudgets.map((budget) => ({
        budget,
        summary: calculateShoppingBudgetSummary(budget),
      })),
    [shoppingBudgets],
  );
  const activeReconciliationPlan = reconciliationPlans[0] ?? null;
  const activeReconciliationSummary = activeReconciliationPlan
    ? calculateReconciliationSummary(activeReconciliationPlan)
    : null;
  const filteredActivityEvents = activityEvents.filter(
    (event) => activityFilter === 'ALL' || event.type === activityFilter,
  );
  const activityFilterOptions = Array.from(
    new Set<HouseholdActivityType>(activityEvents.map((event) => event.type)),
  );

  // -- Couples money check-in: derive supportive, neutral facts (#2150) -----
  // The two partners default to the first two household members; the neutral
  // facts reuse the same budget snapshots that power the scorecard plus any
  // logged shared expenses (e.g. wedding spending).
  const checkInPartners = members.slice(0, 2).map((member) => ({
    id: member.id,
    name: resolveMemberName(member),
  }));
  const checkInSnapshots = getScorecardBudgetSnapshots(budgetData.budgets, household.id);
  const checkInFacts = {
    categoryTotals: checkInSnapshots.map((snapshot) => ({
      label: snapshot.name,
      amountCents: snapshot.spentAmount,
    })),
    budgetDriftByCategory: checkInSnapshots.map((snapshot) => ({
      label: snapshot.name,
      amountCents: snapshot.spentAmount - snapshot.budgetAmount,
    })),
    sharedSpendingChanges: sharedExpenses.map((expense) => ({
      label: expense.description,
      amountCents: expense.amount,
    })),
  };

  // -- Household exists — full management UI --------------------------------

  return (
    <main className="household-page" aria-labelledby="household-title">
      {error && (
        <div className="household-banner--error" role="alert">
          {error}
        </div>
      )}

      {/* Header */}
      <header className="household-header">
        <h1 id="household-title" className="household-header__title">
          {household.name}
        </h1>
        <span className="household-header__badge">Family Plan</span>
      </header>

      {/* Couples money check-in (#2150) — supportive, opt-in, never policing. */}
      <section className="household-card" aria-labelledby="money-check-in-title">
        <h2 id="money-check-in-title" className="household-card__title">
          Money check-in
        </h2>
        <p className="household-card__description">
          A supportive, opt-in space to talk money together. You will see neutral summaries first
          (category totals, budget drift, and shared-spending changes) before any line items, and
          you each choose what to share. No surveillance, no scorekeeping.
        </p>
        <button
          type="button"
          className="household-button household-button--primary"
          onClick={() => setCheckInOpen(true)}
        >
          Start a money check-in
        </button>
      </section>

      <section className="household-card household-scorecard" aria-labelledby="scorecard-title">
        <div className="household-scorecard__header">
          <div>
            <h2 id="scorecard-title" className="household-card__title">
              Mid-Month Scorecard
            </h2>
            <p className="household-card__description">
              See who is pacing well this month so you can celebrate wins early and course-correct
              fast.
            </p>
          </div>
          <div
            className={`household-scorecard__summary ${
              scorecard.householdVariance >= 0
                ? 'household-scorecard__summary--positive'
                : 'household-scorecard__summary--negative'
            }`}
          >
            <span className="household-scorecard__summary-label">Household pace</span>
            <p className="household-scorecard__summary-copy">
              Your household is{' '}
              <CurrencyDisplay
                amount={Math.abs(scorecard.householdVariance)}
                className="household-scorecard__summary-amount"
              />{' '}
              {scorecard.householdVariance >= 0 ? 'under' : 'over'} budget this month
            </p>
            <span className="household-scorecard__summary-meta">
              {scorecard.dayOfMonth} of {scorecard.daysInMonth} days in ·{' '}
              {formatPercent(scorecard.householdSpendPace)} spent vs{' '}
              {formatPercent(scorecard.timePace)} of the month elapsed
            </span>
          </div>
        </div>

        <ul className="household-scorecard__members" role="list" aria-label="Household scorecard">
          {scorecard.members.map((member) => (
            <li key={member.id} className="household-scorecard-member">
              <div className="household-scorecard-member__header">
                <div className="household-scorecard-member__identity">
                  <span className="household-scorecard-member__avatar" aria-hidden="true">
                    {member.avatar}
                  </span>
                  <div>
                    <span className="household-scorecard-member__name">{member.name}</span>
                    <span className="household-scorecard-member__role">
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>
                </div>
                <span
                  className={`household-scorecard-member__status household-scorecard-member__status--${member.statusTone}`}
                >
                  {member.statusLabel}
                </span>
              </div>

              <p className="household-scorecard-member__pace">
                {formatPercent(member.spendPace)} of budget used vs{' '}
                {formatPercent(scorecard.timePace)} of month elapsed
              </p>
              <div className="household-scorecard-member__amounts">
                <span>
                  <CurrencyDisplay amount={member.spentAmount} /> spent
                </span>
                <span>
                  <CurrencyDisplay amount={member.budgetAmount} /> budget
                </span>
              </div>

              <div className="household-scorecard-member__bar-group">
                <div className="household-scorecard-member__bar-row">
                  <div className="household-scorecard-member__bar-meta">
                    <span>Spending pace</span>
                    <span>{formatPercent(member.spendPace)}</span>
                  </div>
                  <div
                    className="household-scorecard-member__progress"
                    role="progressbar"
                    aria-label={`${member.name} spending pace`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={toProgressValue(member.spendPace)}
                  >
                    <span
                      className={`household-scorecard-member__progress-fill household-scorecard-member__progress-fill--${member.statusTone}`}
                      style={{ width: `${toProgressValue(member.spendPace)}%` }}
                    />
                  </div>
                </div>

                <div className="household-scorecard-member__bar-row">
                  <div className="household-scorecard-member__bar-meta">
                    <span>Time pace</span>
                    <span>{formatPercent(scorecard.timePace)}</span>
                  </div>
                  <div
                    className="household-scorecard-member__progress"
                    role="progressbar"
                    aria-label={`${member.name} month pace`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={toProgressValue(scorecard.timePace)}
                  >
                    <span
                      className="household-scorecard-member__progress-fill household-scorecard-member__progress-fill--time"
                      style={{ width: `${toProgressValue(scorecard.timePace)}%` }}
                    />
                  </div>
                </div>
              </div>

              {member.topOverspendingCategory ? (
                <p className="household-scorecard-member__category">
                  Top overspending category: <strong>{member.topOverspendingCategory.name}</strong>
                </p>
              ) : (
                <p className="household-scorecard-member__category household-scorecard-member__category--clear">
                  No categories are running ahead of pace.
                </p>
              )}
              <p className="household-scorecard-member__motivation">{member.motivation}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="household-card household-beta" aria-labelledby="household-beta-title">
        <h2 id="household-beta-title" className="household-card__title">
          Household Beta Tools
        </h2>
        <p className="household-card__description">
          Coordinate month-end true-ups, recurring bills, goal pledges, shopping trips, and a
          privacy-aware activity feed without exposing private transactions.
        </p>
        {householdBetaError && (
          <div className="household-banner--error" role="alert">
            {householdBetaError}
          </div>
        )}

        <section className="household-beta-panel" aria-labelledby="reconciliation-title">
          <div className="household-beta-panel__header">
            <h3 id="reconciliation-title">Yours / Mine / Ours Reconciliation</h3>
            <button
              type="button"
              className="household-button household-button--secondary household-button--small"
              onClick={handleCreateReconciliationPlan}
            >
              Build monthly true-up
            </button>
          </div>
          {activeReconciliationPlan && activeReconciliationSummary ? (
            <div>
              <p className="household-card__note">
                {activeReconciliationPlan.periodType === 'MONTHLY' ? 'Monthly' : 'Custom'} period ·
                private contributions are aggregate-only unless revealed.
              </p>
              <ul className="household-beta-list" role="list">
                {activeReconciliationSummary.memberSummaries.map((summary) => {
                  const member = members.find((entry) => entry.id === summary.memberId);
                  const name = member ? resolveMemberName(member) : 'Unknown member';
                  return (
                    <li key={summary.memberId} className="household-beta-list__item">
                      <span>
                        <strong>{name}</strong> paid{' '}
                        <CurrencyDisplay amount={dollarsToCents(summary.paidAmount)} /> · agreed{' '}
                        <CurrencyDisplay amount={dollarsToCents(summary.agreedShare)} />
                      </span>
                      <span>{summary.privacyLabel}</span>
                    </li>
                  );
                })}
              </ul>
              {activeReconciliationSummary.trueUpSuggestions.length > 0 && (
                <ul className="household-beta-list" role="list" aria-label="True-up suggestions">
                  {activeReconciliationSummary.trueUpSuggestions.map((suggestion) => {
                    const from = members.find((member) => member.id === suggestion.fromMemberId);
                    const to = members.find((member) => member.id === suggestion.toMemberId);
                    return (
                      <li
                        key={suggestion.fromMemberId + suggestion.toMemberId}
                        className="household-beta-list__item"
                      >
                        <strong>
                          {(from && resolveMemberName(from)) || 'Someone'} pays{' '}
                          {(to && resolveMemberName(to)) || 'someone'}{' '}
                          <CurrencyDisplay amount={dollarsToCents(suggestion.amount)} />
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                className="household-button household-button--primary household-button--small"
                onClick={() => handleMarkReconciled(activeReconciliationPlan.id)}
              >
                Mark period reconciled
              </button>
              <p className="household-card__note">
                {reconciliationSnapshots.length} immutable snapshot
                {reconciliationSnapshots.length === 1 ? '' : 's'} saved.
              </p>
            </div>
          ) : (
            <p className="household-card__empty">
              No reconciliation plan yet. Build one from shared budgets, bills, and aggregate paid
              totals.
            </p>
          )}
        </section>

        <section className="household-beta-panel" aria-labelledby="recurring-bills-title">
          <h3 id="recurring-bills-title">Recurring Shared Bills</h3>
          <form onSubmit={handleCreateRecurringBill} className="household-beta-form" noValidate>
            <input
              className="household-form-input"
              value={recurringBillName}
              onChange={(e) => setRecurringBillName(e.target.value)}
              placeholder="Internet, utilities, pet food"
              aria-label="Recurring bill name"
            />
            <input
              className="household-form-input"
              type="number"
              min="0.01"
              step="0.01"
              value={recurringBillAmount}
              onChange={(e) => setRecurringBillAmount(e.target.value)}
              placeholder="Estimated amount"
              aria-label="Recurring bill amount"
            />
            <input
              className="household-form-input"
              type="number"
              min="1"
              max="31"
              value={recurringBillDueDay}
              onChange={(e) => setRecurringBillDueDay(e.target.value)}
              aria-label="Recurring bill due day"
            />
            <select
              className="household-form-select"
              value={recurringBillCadence}
              onChange={(e) => setRecurringBillCadence(e.target.value as RecurringBillCadence)}
              aria-label="Recurring bill cadence"
            >
              <option value="MONTHLY">Monthly</option>
              <option value="BIWEEKLY">Biweekly</option>
              <option value="WEEKLY">Weekly</option>
            </select>
            <select
              className="household-form-select"
              value={recurringBillPayer || members[0]?.id || ''}
              onChange={(e) => setRecurringBillPayer(e.target.value)}
              aria-label="Recurring bill default payer"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {resolveMemberName(member)}
                </option>
              ))}
            </select>
            <select
              className="household-form-select"
              value={recurringBillRotation}
              onChange={(e) => setRecurringBillRotation(e.target.value as PayerRotationMode)}
              aria-label="Payer rotation"
            >
              <option value="ROUND_ROBIN">Rotate each cycle</option>
              <option value="FIXED">Fixed payer</option>
              <option value="WEIGHTED">Weighted rotation</option>
            </select>
            <select
              className="household-form-select"
              value={recurringBillSplitMode}
              onChange={(e) => setRecurringBillSplitMode(e.target.value as SharedExpenseSplitMode)}
              aria-label="Recurring bill split mode"
            >
              <option value="EQUAL">Split equally</option>
              <option value="CUSTOM">Custom split</option>
            </select>
            {recurringBillSplitMode === 'CUSTOM' && (
              <fieldset className="household-custom-split" style={{ gridColumn: '1 / -1' }}>
                <legend>Custom split amounts (must total the estimated amount)</legend>
                {members.map((member) => {
                  const inputId = `recurring-bill-split-${member.id}`;
                  return (
                    <div key={member.id} className="household-custom-split__row">
                      <label htmlFor={inputId}>{resolveMemberName(member)}</label>
                      <input
                        id={inputId}
                        className="household-form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={recurringBillCustomSplits[member.id] ?? ''}
                        onChange={(e) =>
                          setRecurringBillCustomSplits((current) => ({
                            ...current,
                            [member.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </fieldset>
            )}
            <button type="submit" className="household-button household-button--primary">
              Add recurring bill
            </button>
          </form>
          {recurringBillReminders.length === 0 ? (
            <p className="household-card__empty">No recurring bills yet.</p>
          ) : (
            <ul className="household-beta-list" role="list">
              {recurringBillReminders.map((reminder) => {
                const bill = recurringBills.find((entry) => entry.id === reminder.billId);
                const payer = members.find((member) => member.id === reminder.payerMemberId);
                return (
                  <li key={reminder.billId} className="household-beta-list__item">
                    {editingBillId === reminder.billId ? (
                      <form
                        onSubmit={handleSaveRecurringBillEdit}
                        className="household-beta-form"
                        aria-label={`Edit ${reminder.name}`}
                        noValidate
                      >
                        <input
                          className="household-form-input"
                          value={editBillName}
                          onChange={(e) => setEditBillName(e.target.value)}
                          aria-label="Bill name"
                        />
                        <input
                          className="household-form-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={editBillAmount}
                          onChange={(e) => setEditBillAmount(e.target.value)}
                          aria-label="Bill estimated amount"
                        />
                        <input
                          className="household-form-input"
                          type="number"
                          min="1"
                          max="31"
                          value={editBillDueDay}
                          onChange={(e) => setEditBillDueDay(e.target.value)}
                          aria-label="Bill due day"
                        />
                        <select
                          className="household-form-select"
                          value={editBillCadence}
                          onChange={(e) =>
                            setEditBillCadence(e.target.value as RecurringBillCadence)
                          }
                          aria-label="Bill cadence"
                        >
                          <option value="MONTHLY">Monthly</option>
                          <option value="BIWEEKLY">Biweekly</option>
                          <option value="WEEKLY">Weekly</option>
                        </select>
                        <select
                          className="household-form-select"
                          value={editBillSplitMode}
                          onChange={(e) =>
                            setEditBillSplitMode(e.target.value as SharedExpenseSplitMode)
                          }
                          aria-label="Bill split mode"
                        >
                          <option value="EQUAL">Split equally</option>
                          <option value="CUSTOM">Custom split</option>
                        </select>
                        {editBillSplitMode === 'CUSTOM' && (
                          <fieldset
                            className="household-custom-split"
                            style={{ gridColumn: '1 / -1' }}
                          >
                            <legend>Custom split amounts (must total the estimated amount)</legend>
                            {members.map((member) => {
                              const inputId = `edit-bill-split-${member.id}`;
                              return (
                                <div key={member.id} className="household-custom-split__row">
                                  <label htmlFor={inputId}>{resolveMemberName(member)}</label>
                                  <input
                                    id={inputId}
                                    className="household-form-input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={editBillCustomSplits[member.id] ?? ''}
                                    onChange={(e) =>
                                      setEditBillCustomSplits((current) => ({
                                        ...current,
                                        [member.id]: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              );
                            })}
                          </fieldset>
                        )}
                        <span className="household-beta-list__actions">
                          <button
                            type="submit"
                            className="household-button household-button--primary household-button--small"
                          >
                            Save changes
                          </button>
                          <button
                            type="button"
                            className="household-button household-button--secondary household-button--small"
                            onClick={cancelEditRecurringBill}
                          >
                            Cancel
                          </button>
                        </span>
                      </form>
                    ) : (
                      <>
                        <span>
                          <strong>{reminder.name}</strong> due {reminder.dueDate} · payer{' '}
                          {payer ? resolveMemberName(payer) : 'Unknown'} ·{' '}
                          <CurrencyDisplay amount={dollarsToCents(reminder.amount)} />
                          {bill?.splitMode === 'CUSTOM' ? ' · custom split' : ''}
                          {reminder.paused ? ' · paused' : ''}
                        </span>
                        <span className="household-beta-list__actions">
                          <button
                            type="button"
                            className="household-button household-button--secondary household-button--small"
                            onClick={() => bill && setRecurringBillPaused(bill.id, !bill.paused)}
                          >
                            {bill?.paused ? 'Resume' : 'Pause'}
                          </button>
                          <button
                            type="button"
                            className="household-button household-button--secondary household-button--small"
                            onClick={() => beginEditRecurringBill(reminder.billId)}
                          >
                            Edit
                          </button>
                          {pendingDeleteBillId === reminder.billId ? (
                            <>
                              <button
                                type="button"
                                className="household-button household-button--danger household-button--small"
                                onClick={() => handleDeleteRecurringBill(reminder.billId)}
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                className="household-button household-button--secondary household-button--small"
                                onClick={() => setPendingDeleteBillId(null)}
                              >
                                Keep
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="household-button household-button--danger household-button--small"
                              onClick={() => setPendingDeleteBillId(reminder.billId)}
                            >
                              Delete
                            </button>
                          )}
                          {reminder.cycleId && (
                            <>
                              <button
                                type="button"
                                className="household-button household-button--secondary household-button--small"
                                onClick={() =>
                                  updateRecurringBillCycle({
                                    billId: reminder.billId,
                                    cycleId: reminder.cycleId!,
                                    status: 'SKIPPED',
                                    skippedReason: 'Skipped from household page',
                                  })
                                }
                              >
                                Skip
                              </button>
                              <button
                                type="button"
                                className="household-button household-button--primary household-button--small"
                                onClick={() =>
                                  markRecurringBillCyclePaid({
                                    billId: reminder.billId,
                                    cycleId: reminder.cycleId!,
                                  })
                                }
                              >
                                Mark paid
                              </button>
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="household-beta-panel" aria-labelledby="goal-pledges-title">
          <h3 id="goal-pledges-title">Goal Contribution Pledges</h3>
          <form onSubmit={handleSaveGoalPledge} className="household-beta-form" noValidate>
            <select
              className="household-form-select"
              value={goalPledgeGoalId || goalData.goals[0]?.id || ''}
              onChange={(e) => setGoalPledgeGoalId(e.target.value)}
              aria-label="Pledge goal"
              disabled={goalData.goals.length === 0}
            >
              {goalData.goals.length === 0 ? (
                <option value="">No goals yet — create one first</option>
              ) : (
                goalData.goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    Pledge: {goal.name}
                  </option>
                ))
              )}
            </select>
            <select
              className="household-form-select"
              value={goalPledgeMemberId || members[0]?.id || ''}
              onChange={(e) => setGoalPledgeMemberId(e.target.value)}
              aria-label="Pledge member"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {resolveMemberName(member)}
                </option>
              ))}
            </select>
            <input
              className="household-form-input"
              type="number"
              min="0.01"
              step="0.01"
              value={goalPledgeAmount}
              onChange={(e) => setGoalPledgeAmount(e.target.value)}
              placeholder="Monthly pledge"
              aria-label="Monthly pledge amount"
            />
            <button type="submit" className="household-button household-button--primary">
              Save pledge
            </button>
          </form>
          <ul className="household-beta-list" role="list">
            {goalPledgeProgress.map((progress) => (
              <li key={progress.goalId} className="household-beta-list__item">
                <span>
                  <strong>Goal: {goalNameById.get(progress.goalId) ?? 'Shared goal'}</strong>{' '}
                  pledged <CurrencyDisplay amount={dollarsToCents(progress.totalPledged)} /> ·
                  contributed <CurrencyDisplay amount={dollarsToCents(progress.totalContributed)} />
                </span>
                {progress.members.map((memberProgress) => (
                  <button
                    key={memberProgress.memberId}
                    type="button"
                    className="household-button household-button--secondary household-button--small"
                    onClick={() =>
                      handleRecordGoalContribution(
                        progress.goalId,
                        memberProgress.memberId,
                        memberProgress.remainingAmount,
                      )
                    }
                  >
                    Record catch-up
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>

        <section className="household-beta-panel" aria-labelledby="shopping-budgets-title">
          <h3 id="shopping-budgets-title">Shared Shopping Budgets</h3>
          <form onSubmit={handleCreateShoppingBudget} className="household-beta-form" noValidate>
            <input
              className="household-form-input"
              value={shoppingBudgetName}
              onChange={(e) => setShoppingBudgetName(e.target.value)}
              aria-label="Shopping budget name"
            />
            <input
              className="household-form-input"
              type="number"
              min="0.01"
              step="0.01"
              value={shoppingBudgetLimit}
              onChange={(e) => setShoppingBudgetLimit(e.target.value)}
              aria-label="Shopping budget monthly limit"
            />
            <input
              className="household-form-input"
              value={shoppingBudgetCategories}
              onChange={(e) => setShoppingBudgetCategories(e.target.value)}
              aria-label="Shopping budget categories"
            />
            <button type="submit" className="household-button household-button--primary">
              Save shopping budget
            </button>
          </form>
          {shoppingBudgets.length > 0 && (
            <form onSubmit={handleLogShoppingTrip} className="household-beta-form" noValidate>
              <select
                className="household-form-select"
                value={shoppingTripBudgetId || shoppingBudgets[0]?.id || ''}
                onChange={(e) => setShoppingTripBudgetId(e.target.value)}
                aria-label="Shopping trip budget"
              >
                {shoppingBudgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.name}
                  </option>
                ))}
              </select>
              <input
                className="household-form-input"
                value={shoppingTripStore}
                onChange={(e) => setShoppingTripStore(e.target.value)}
                placeholder="Store"
                aria-label="Shopping trip store"
              />
              <input
                className="household-form-input"
                type="number"
                min="0.01"
                step="0.01"
                value={shoppingTripTotal}
                onChange={(e) => setShoppingTripTotal(e.target.value)}
                placeholder="Receipt total"
                aria-label="Shopping trip receipt total"
              />
              <select
                className="household-form-select"
                value={shoppingTripPayer || members[0]?.id || ''}
                onChange={(e) => setShoppingTripPayer(e.target.value)}
                aria-label="Shopping trip payer"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {resolveMemberName(member)}
                  </option>
                ))}
              </select>
              <select
                className="household-form-select"
                value={shoppingTripAllocation}
                onChange={(e) =>
                  setShoppingTripAllocation(e.target.value as ShoppingTripAllocation)
                }
                aria-label="Shopping trip allocation"
              >
                <option value="SHARED">Shared</option>
                <option value="REIMBURSABLE">Reimbursable</option>
                <option value="PERSONAL">Personal</option>
              </select>
              <button type="submit" className="household-button household-button--primary">
                Log shopping trip
              </button>
            </form>
          )}
          <ul className="household-beta-list" role="list">
            {shoppingBudgetSummaries.map(({ budget, summary }) => (
              <li key={budget.id} className="household-beta-list__item">
                <span>
                  <strong>{budget.name}</strong> remaining{' '}
                  <CurrencyDisplay amount={dollarsToCents(summary.remainingAmount)} /> · average
                  trip <CurrencyDisplay amount={dollarsToCents(summary.averageTripSize)} /> ·
                  projected{' '}
                  <CurrencyDisplay amount={dollarsToCents(summary.projectedMonthEndSpend)} />
                </span>
                <span>{summary.recentTrips[0]?.store ?? 'No trips yet'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="household-beta-panel" aria-labelledby="activity-feed-title">
          <div className="household-beta-panel__header">
            <h3 id="activity-feed-title">Household Activity Feed</h3>
            <select
              className="household-form-select household-form-select--small"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as HouseholdActivityType | 'ALL')}
              aria-label="Activity feed filter"
            >
              <option value="ALL">All events</option>
              {activityFilterOptions.map((type) => (
                <option key={type} value={type}>
                  {type.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          {filteredActivityEvents.length === 0 ? (
            <p className="household-card__empty">No activity yet.</p>
          ) : (
            <ul className="household-beta-list" role="list" aria-label="Household activity feed">
              {filteredActivityEvents.slice(0, 8).map((event) => {
                const actor = event.actorMemberId
                  ? members.find((member) => member.id === event.actorMemberId)
                  : null;
                return (
                  <li key={event.id} className="household-beta-list__item">
                    <span>
                      <strong>{event.summary}</strong> · {event.type.toLowerCase()} ·{' '}
                      {actor ? resolveMemberName(actor) : 'System'}
                    </span>
                    <span>
                      {new Date(event.createdAt).toLocaleString()} · {event.privacy.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Trusted Helper Section (#2156) */}
      {/* ----------------------------------------------------------------- */}
      <section
        className="household-card household-trusted-helper"
        aria-labelledby="trusted-helper-title"
      >
        <div className="household-trusted-helper__header">
          <div>
            <h2 id="trusted-helper-title" className="household-card__title">
              Trusted Helper
            </h2>
            <p className="household-card__description">
              Add someone you trust to help review your finances in plain language. They are added
              as a read-only viewer, so they can look with you but cannot make changes.
            </p>
          </div>
          <span className="household-trusted-helper__badge">Read-only</span>
        </div>

        <div className="household-trusted-helper__plain-language" role="note">
          <div>
            <h3>What they can see</h3>
            <ul className="household-helper-capability-list">
              <li>Shared balances, bills, budgets, goals, and household scorecards.</li>
              <li>Only accounts and plans you have already marked as shared.</li>
            </ul>
          </div>
          <div>
            <h3>What they cannot do</h3>
            <ul className="household-helper-capability-list household-helper-capability-list--cannot">
              <li>Move money, pay bills, or add transactions.</li>
              <li>Change settings, invite people, edit roles, or delete data.</li>
            </ul>
          </div>
        </div>

        {trustedHelperSuccessName && (
          <div className="household-banner--success" role="status">
            {trustedHelperSuccessName} was added as a trusted helper with read-only access.
          </div>
        )}

        {trustedHelperError && (
          <div className="household-banner--error" role="alert">
            {trustedHelperError}
          </div>
        )}

        <form
          onSubmit={handleAddTrustedHelper}
          className="household-trusted-helper-form"
          noValidate
        >
          <div className="household-form-group">
            <label htmlFor="trusted-helper-name" className="household-form-group__label">
              Helper name
            </label>
            <input
              id="trusted-helper-name"
              className="household-form-input"
              type="text"
              value={trustedHelperName}
              onChange={(e) => {
                setTrustedHelperName(e.target.value);
                setTrustedHelperSuccessName(null);
              }}
              placeholder="e.g. Aunt Maria or financial coach"
              autoComplete="name"
            />
          </div>

          <div className="household-form-group">
            <label htmlFor="trusted-helper-access" className="household-form-group__label">
              How they will access it
            </label>
            <select
              id="trusted-helper-access"
              className="household-form-select"
              value={trustedHelperAccessMethod}
              onChange={(e) =>
                setTrustedHelperAccessMethod(e.target.value as TrustedHelperAccessMethod)
              }
            >
              {TRUSTED_HELPER_ACCESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="household-trusted-helper-form__hint">
              {trustedHelperAccessOption?.description}
            </p>
          </div>

          <button type="submit" className="household-button household-button--primary">
            Add trusted helper
          </button>
        </form>

        <p className="household-card__note" role="note">
          Local-first note: this creates a read-only Viewer member on this device. You can revoke
          the helper at any time from Members &amp; Roles.
        </p>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Members & Roles Section (#1780) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="members-title">
        <h2 id="members-title" className="household-card__title">
          Members &amp; Roles
        </h2>
        <p className="household-card__description">
          Manage household members and their permission levels. Each role determines what actions a
          member can perform.
        </p>

        {members.length === 0 ? (
          <p className="household-card__empty">No members yet.</p>
        ) : (
          <ul className="household-member-list" role="list" aria-label="Household members">
            {members.map((member) => {
              const name = resolveMemberName(member);
              return (
                <li key={member.id} className="household-member-item">
                  <div className="household-member-item__info">
                    <span className="household-member-item__avatar" aria-hidden="true">
                      {member.role === 'OWNER' ? (
                        <AppIcon name="medal" />
                      ) : member.role === 'ADMIN' ? (
                        <AppIcon name="shield" />
                      ) : (
                        <AppIcon name="account" />
                      )}
                    </span>
                    <div>
                      <span className="household-member-item__name">{name}</span>
                      <span className="household-member-item__role">
                        {member.role === 'VIEWER'
                          ? 'Trusted helper · Read-only'
                          : ROLE_LABELS[member.role]}
                      </span>
                      <span className="household-member-item__permissions">
                        {member.role === 'VIEWER'
                          ? 'Can view shared finances; cannot change or delete anything'
                          : `${ROLE_PERMISSIONS[member.role].length} permissions`}
                      </span>
                    </div>
                  </div>
                  {member.role !== 'OWNER' && (
                    <div className="household-member-item__actions">
                      <select
                        className="household-form-select household-form-select--small"
                        value={member.role}
                        onChange={(e) =>
                          updateMemberRole(member.id, e.target.value as HouseholdRole)
                        }
                        aria-label={`Change role for ${name}`}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="household-button household-button--danger household-button--small"
                        onClick={() =>
                          setMemberPendingRemoval({
                            id: member.id,
                            name,
                            isViewer: member.role === 'VIEWER',
                          })
                        }
                        aria-label={
                          member.role === 'VIEWER'
                            ? `Revoke helper access for ${name}`
                            : `Remove ${name}`
                        }
                      >
                        {member.role === 'VIEWER' ? 'Revoke helper access' : 'Remove'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Role permissions reference */}
        <details className="household-permissions-details">
          <summary className="household-permissions-summary">View role permissions</summary>
          <div className="household-permissions-grid">
            {(Object.entries(ROLE_LABELS) as [HouseholdRole, string][]).map(([role, label]) => (
              <div key={role} className="household-permissions-column">
                <h4 className="household-permissions-column__title">{label}</h4>
                <ul className="household-permissions-list" role="list">
                  {ROLE_PERMISSIONS[role].map((perm) => (
                    <li key={perm} className="household-permissions-list__item">
                      {perm.replace(/_/g, ' ').toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Shared Expenses & Settle Up (#2144) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card household-settle-up" aria-labelledby="settle-up-title">
        <h2 id="settle-up-title" className="household-card__title">
          Shared Expenses / Settle Up
        </h2>
        <p className="household-card__description">
          Log roommate expenses, split them equally or with custom amounts, and see the fewest
          payments needed to settle up.
        </p>

        {sharedExpenseError && (
          <div className="household-banner--error" role="alert">
            {sharedExpenseError}
          </div>
        )}

        <form onSubmit={handleLogSharedExpense} className="household-settle-up-form" noValidate>
          <div className="household-settle-up-form__grid">
            <div className="household-form-group">
              <label htmlFor="shared-expense-description" className="household-form-group__label">
                Description
              </label>
              <input
                id="shared-expense-description"
                className="household-form-input"
                type="text"
                value={sharedExpenseDescription}
                onChange={(e) => setSharedExpenseDescription(e.target.value)}
                placeholder="e.g. Groceries"
                autoComplete="off"
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="shared-expense-amount" className="household-form-group__label">
                Total amount
              </label>
              <input
                id="shared-expense-amount"
                className="household-form-input"
                type="number"
                min="0.01"
                step="0.01"
                value={sharedExpenseAmount}
                onChange={(e) => setSharedExpenseAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="shared-expense-paid-by" className="household-form-group__label">
                Who paid
              </label>
              <select
                id="shared-expense-paid-by"
                className="household-form-select"
                value={sharedExpensePaidBy || members[0]?.id || ''}
                onChange={(e) => setSharedExpensePaidBy(e.target.value)}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {resolveMemberName(member)}
                  </option>
                ))}
              </select>
            </div>
            <div className="household-form-group">
              <label htmlFor="shared-expense-split-mode" className="household-form-group__label">
                Split method
              </label>
              <select
                id="shared-expense-split-mode"
                className="household-form-select"
                value={sharedExpenseSplitMode}
                onChange={(e) =>
                  setSharedExpenseSplitMode(e.target.value as SharedExpenseSplitMode)
                }
              >
                <option value="EQUAL">Equal among selected</option>
                <option value="CUSTOM">Custom amounts</option>
              </select>
            </div>
          </div>

          <fieldset className="household-settle-up-members">
            <legend>Split with</legend>
            {members.map((member) => {
              const name = resolveMemberName(member);
              const isSelected = sharedExpenseSelectedMembers[member.id] ?? true;
              return (
                <div key={member.id} className="household-settle-up-member-row">
                  <Checkbox
                    className="household-settle-up-member-row__check"
                    label={name}
                    checked={isSelected}
                    onChange={(e) => handleToggleSharedExpenseMember(member.id, e.target.checked)}
                    aria-label={'Include ' + name + ' in split'}
                  />
                  {sharedExpenseSplitMode === 'CUSTOM' && isSelected && (
                    <input
                      className="household-form-input household-settle-up-member-row__amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={customSplitAmounts[member.id] ?? ''}
                      onChange={(e) =>
                        setCustomSplitAmounts((current) => ({
                          ...current,
                          [member.id]: e.target.value,
                        }))
                      }
                      placeholder="0.00"
                      aria-label={'Custom split amount for ' + name}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>

          <button type="submit" className="household-button household-button--primary">
            Log shared expense
          </button>
        </form>

        <div className="household-settle-up__summary-grid">
          <section aria-labelledby="shared-balances-title">
            <h3 id="shared-balances-title" className="household-settle-up__subtitle">
              Balances
            </h3>
            {sharedExpenseBalances.length === 0 ? (
              <p className="household-card__empty">No balances yet.</p>
            ) : (
              <ul className="household-settle-up-balance-list" role="list">
                {sharedExpenseBalances.map((balance) => {
                  const member = members.find((entry) => entry.id === balance.memberId);
                  const name = member ? resolveMemberName(member) : 'Unknown member';
                  const tone =
                    balance.netBalance > 0
                      ? 'positive'
                      : balance.netBalance < 0
                        ? 'negative'
                        : 'zero';
                  return (
                    <li
                      key={balance.memberId}
                      className={'household-settle-up-balance household-settle-up-balance--' + tone}
                    >
                      <span>{name}</span>
                      <strong>
                        {balance.netBalance > 0
                          ? 'is owed '
                          : balance.netBalance < 0
                            ? 'owes '
                            : 'settled up'}
                        {balance.netBalance !== 0 && (
                          <CurrencyDisplay amount={dollarsToCents(Math.abs(balance.netBalance))} />
                        )}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="settle-up-suggestions-title">
            <h3 id="settle-up-suggestions-title" className="household-settle-up__subtitle">
              Settle Up
            </h3>
            {settleUpSuggestions.length === 0 ? (
              <p className="household-card__empty">Everyone is settled up.</p>
            ) : (
              <ul className="household-settle-up-suggestion-list" role="list">
                {settleUpSuggestions.map((suggestion) => {
                  const fromMember = members.find(
                    (member) => member.id === suggestion.fromMemberId,
                  );
                  const toMember = members.find((member) => member.id === suggestion.toMemberId);
                  const fromName = fromMember ? resolveMemberName(fromMember) : 'Unknown member';
                  const toName = toMember ? resolveMemberName(toMember) : 'Unknown member';
                  return (
                    <li
                      key={
                        suggestion.fromMemberId +
                        '-' +
                        suggestion.toMemberId +
                        '-' +
                        suggestion.amount
                      }
                      className="household-settle-up-suggestion"
                    >
                      <span>
                        {fromName} pays {toName}{' '}
                        <CurrencyDisplay amount={dollarsToCents(suggestion.amount)} />
                      </span>
                      <button
                        type="button"
                        className="household-button household-button--secondary household-button--small"
                        onClick={() =>
                          handleRecordSharedSettlement(
                            suggestion.fromMemberId,
                            suggestion.toMemberId,
                            suggestion.amount,
                          )
                        }
                      >
                        Mark settled
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {sharedExpenses.length > 0 && (
          <section aria-labelledby="shared-expense-history-title">
            <h3 id="shared-expense-history-title" className="household-settle-up__subtitle">
              Recent shared expenses
            </h3>
            <ul className="household-settle-up-expense-list" role="list">
              {sharedExpenses
                .slice(-3)
                .reverse()
                .map((expense) => {
                  const payer = members.find((member) => member.id === expense.paidByMemberId);
                  return (
                    <li key={expense.id} className="household-settle-up-expense">
                      <span>{expense.description}</span>
                      <span>
                        <CurrencyDisplay amount={dollarsToCents(expense.amount)} /> paid by{' '}
                        {payer ? resolveMemberName(payer) : 'Unknown member'}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Kids & Allowances (#2200) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="kids-title">
        <h2 id="kids-title" className="household-card__title">
          Kids &amp; Allowances
        </h2>
        <p className="household-card__description">
          Track weekly allowance, chore bonuses, and spending for each child in your household.
        </p>

        {kidError && (
          <div className="household-banner--error" role="alert">
            {kidError}
          </div>
        )}

        <form onSubmit={handleCreateChild} className="household-kids-form" noValidate>
          <div className="household-kids-form__grid">
            <div className="household-form-group">
              <label htmlFor="child-name" className="household-form-group__label">
                Child name
              </label>
              <input
                id="child-name"
                className="household-form-input"
                type="text"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Maya"
                autoComplete="off"
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="child-age" className="household-form-group__label">
                Age
              </label>
              <input
                id="child-age"
                className="household-form-input"
                type="number"
                min="0"
                step="1"
                value={childAge}
                onChange={(e) => setChildAge(e.target.value)}
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="child-allowance" className="household-form-group__label">
                Weekly allowance
              </label>
              <input
                id="child-allowance"
                className="household-form-input"
                type="number"
                min="0"
                step="0.01"
                value={childWeeklyAllowance}
                onChange={(e) => setChildWeeklyAllowance(e.target.value)}
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="child-balance" className="household-form-group__label">
                Starting balance
              </label>
              <input
                id="child-balance"
                className="household-form-input"
                type="number"
                min="0"
                step="0.01"
                value={childStartingBalance}
                onChange={(e) => setChildStartingBalance(e.target.value)}
              />
            </div>
            <div className="household-form-group">
              <label htmlFor="child-allowance-day" className="household-form-group__label">
                Allowance day
              </label>
              <select
                id="child-allowance-day"
                className="household-form-select"
                value={childAllowanceDay}
                onChange={(e) => setChildAllowanceDay(e.target.value as AllowanceDay)}
              >
                {ALLOWANCE_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="household-button household-button--primary">
            Add child profile
          </button>
        </form>

        {children.length > 0 && (
          <div className="household-kids-rollup" aria-label="Household child expense roll-up">
            <div>
              <span className="household-kids-rollup__label">Child spend this month</span>
              <strong>
                <CurrencyDisplay amount={childFinance.householdMonthSpentCents} />
              </strong>
            </div>
            <div>
              <span className="household-kids-rollup__label">Child spend this year</span>
              <strong>
                <CurrencyDisplay amount={childFinance.householdYearSpentCents} />
              </strong>
            </div>
          </div>
        )}

        {children.length === 0 ? (
          <p className="household-card__empty">No child profiles yet.</p>
        ) : (
          <div className="household-kids-grid" role="list" aria-label="Child allowance cards">
            {children.map((child) => {
              const weeklyChoreTotal = calculateChildWeeklyChoreEarnings(child);
              const choreDraft = getChoreDraft(child.id);
              const withdrawalValue = withdrawalDrafts[child.id] ?? '';
              const collegeFundDraft = getCollegeFundDraft(child.id);
              const transactionValue = transactionDrafts[child.id] ?? '';
              const childSummary = childFinance.children[child.id] ?? {
                childId: child.id,
                monthSpentCents: 0,
                yearSpentCents: 0,
                categoryBreakdown: [],
                collegeFundGoal: null,
                collegeFundProgress: 0,
              };
              const collegeFundGoal = childSummary.collegeFundGoal;
              const teenLearningRecord = buildTeenLearningRecordFromChild(
                household.id,
                child,
                household.updatedAt,
              );
              const teenReviewSummary = buildTeenParentReviewSummary(teenLearningRecord.account, [
                {
                  type: 'EARN',
                  amountCents: dollarsToCents(weeklyChoreTotal),
                  label: 'Completed chore bonuses',
                },
                {
                  type: 'SPEND',
                  amountCents: childSummary.monthSpentCents,
                  label: 'Tagged child spending this month',
                },
                ...(collegeFundGoal
                  ? [
                      {
                        type: 'SAVE' as const,
                        amountCents: collegeFundGoal.currentAmount.amount,
                        label: 'College fund progress',
                      },
                    ]
                  : []),
              ]);

              return (
                <article key={child.id} className="household-kid-card" role="listitem">
                  <div className="household-kid-card__header">
                    <div>
                      <h3 className="household-kid-card__name">{child.name}</h3>
                      <p className="household-kid-card__meta">
                        Age {child.age} • Allowance{' '}
                        {currencyFormatter.format(child.weeklyAllowance)} on{' '}
                        {ALLOWANCE_DAY_LABELS[child.allowanceDay]}
                      </p>
                    </div>
                    <div className="household-kid-card__balance">
                      {currencyFormatter.format(child.balance)}
                    </div>
                  </div>

                  <dl className="household-kid-card__stats">
                    <div className="household-kid-card__stat">
                      <dt>Earned this week</dt>
                      <dd>{currencyFormatter.format(weeklyChoreTotal)}</dd>
                    </div>
                    <div className="household-kid-card__stat">
                      <dt>Current balance</dt>
                      <dd>{currencyFormatter.format(child.balance)}</dd>
                    </div>
                    <div className="household-kid-card__stat">
                      <dt>Spent this month</dt>
                      <dd>
                        <CurrencyDisplay amount={childSummary.monthSpentCents} />
                      </dd>
                    </div>
                    <div className="household-kid-card__stat">
                      <dt>Spent this year</dt>
                      <dd>
                        <CurrencyDisplay amount={childSummary.yearSpentCents} />
                      </dd>
                    </div>
                    <div className="household-kid-card__stat household-kid-card__stat--wide">
                      <dt>College fund</dt>
                      <dd>
                        {collegeFundGoal
                          ? `${Math.round(childSummary.collegeFundProgress * 100)}% funded`
                          : 'Not linked'}
                      </dd>
                    </div>
                  </dl>

                  <section
                    className="household-kid-card__section"
                    aria-labelledby={`teen-learning-title-${child.id}`}
                  >
                    <div className="household-kid-card__section-header">
                      <h4
                        id={`teen-learning-title-${child.id}`}
                        className="household-kid-card__section-title"
                      >
                        Teen Learning Account
                      </h4>
                      <span className="household-kid-card__section-note">Practice balance</span>
                    </div>
                    <p className="household-card__note">{TEEN_LEARNING_HOUSEHOLD_COPY}</p>
                    <dl className="household-kid-card__stats">
                      <div className="household-kid-card__stat">
                        <dt>Practice balance</dt>
                        <dd>
                          <CurrencyDisplay amount={teenReviewSummary.practiceBalanceCents} />
                        </dd>
                      </div>
                      <div className="household-kid-card__stat">
                        <dt>Approval guardrails</dt>
                        <dd>{teenLearningRecord.account.approvalRequiredFor.length} actions</dd>
                      </div>
                    </dl>
                    {teenReviewSummary.teachableMoments.length > 0 && (
                      <ul className="household-kid-card__expense-list" role="list">
                        {teenReviewSummary.teachableMoments.map((moment) => (
                          <li key={moment} className="household-kid-card__expense-item">
                            <span>{moment}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section
                    className="household-kid-card__section household-kid-card__section--college"
                    aria-labelledby={`college-title-${child.id}`}
                  >
                    <div className="household-kid-card__section-header">
                      <h4
                        id={`college-title-${child.id}`}
                        className="household-kid-card__section-title"
                      >
                        College Fund
                      </h4>
                      <span className="household-kid-card__section-note">
                        Dedicated savings goal
                      </span>
                    </div>

                    {collegeFundGoal ? (
                      <div className="household-kid-card__college-fund">
                        <div className="household-kid-card__college-amounts">
                          <span>
                            <CurrencyDisplay amount={collegeFundGoal.currentAmount.amount} /> saved
                          </span>
                          <span>
                            <CurrencyDisplay amount={collegeFundGoal.targetAmount.amount} /> target
                          </span>
                        </div>
                        <div
                          className="household-kid-card__college-progress"
                          role="progressbar"
                          aria-label={`${child.name} college fund progress`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={toProgressValue(childSummary.collegeFundProgress)}
                        >
                          <span
                            style={{
                              width: `${toProgressValue(childSummary.collegeFundProgress)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <form
                        className="household-kid-card__inline-form"
                        onSubmit={(e) => handleCreateCollegeFund(e, child)}
                        noValidate
                      >
                        <div className="household-kid-card__inline-fields household-kid-card__inline-fields--two">
                          <input
                            className="household-form-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Target"
                            aria-label={`College fund target for ${child.name}`}
                            value={collegeFundDraft.target}
                            onChange={(e) =>
                              updateCollegeFundDraft(child.id, 'target', e.target.value)
                            }
                          />
                          <input
                            className="household-form-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Current balance"
                            aria-label={`College fund starting balance for ${child.name}`}
                            value={collegeFundDraft.current}
                            onChange={(e) =>
                              updateCollegeFundDraft(child.id, 'current', e.target.value)
                            }
                          />
                        </div>
                        <button
                          type="submit"
                          className="household-button household-button--secondary household-button--small"
                        >
                          Create college fund
                        </button>
                      </form>
                    )}
                  </section>

                  <section
                    className="household-kid-card__section"
                    aria-labelledby={`chores-title-${child.id}`}
                  >
                    <div className="household-kid-card__section-header">
                      <h4
                        id={`chores-title-${child.id}`}
                        className="household-kid-card__section-title"
                      >
                        Chores
                      </h4>
                      <span className="household-kid-card__section-note">
                        Toggle completed chores
                      </span>
                    </div>

                    {child.chores.length === 0 ? (
                      <p className="household-card__empty">No chores added yet.</p>
                    ) : (
                      <ul className="household-kid-card__chore-list" role="list">
                        {child.chores.map((chore) => (
                          <li key={chore.id} className="household-kid-card__chore-item">
                            <Checkbox
                              className="household-kid-card__chore-toggle"
                              checked={chore.completedThisWeek}
                              onChange={() => toggleChildChoreCompletion(child.id, chore.id)}
                              label={
                                <span>
                                  <span className="household-kid-card__chore-name">
                                    {chore.name}
                                  </span>
                                  <span className="household-kid-card__chore-meta">
                                    {currencyFormatter.format(chore.value)} bonus •{' '}
                                    {chore.frequency}
                                  </span>
                                </span>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}

                    <form
                      className="household-kid-card__inline-form"
                      onSubmit={(e) => handleAddChore(e, child.id)}
                      noValidate
                    >
                      <div className="household-kid-card__inline-fields">
                        <input
                          className="household-form-input"
                          type="text"
                          placeholder="Chore name"
                          aria-label={`Chore name for ${child.name}`}
                          value={choreDraft.name}
                          onChange={(e) => updateChoreDraft(child.id, 'name', e.target.value)}
                        />
                        <input
                          className="household-form-input"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Value"
                          aria-label={`Chore value for ${child.name}`}
                          value={choreDraft.value}
                          onChange={(e) => updateChoreDraft(child.id, 'value', e.target.value)}
                        />
                        <select
                          className="household-form-select"
                          aria-label={`Chore frequency for ${child.name}`}
                          value={choreDraft.frequency}
                          onChange={(e) =>
                            updateChoreDraft(
                              child.id,
                              'frequency',
                              e.target.value as ChoreFrequency,
                            )
                          }
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="household-button household-button--secondary household-button--small"
                      >
                        Add chore
                      </button>
                    </form>
                  </section>

                  <section
                    className="household-kid-card__section"
                    aria-labelledby={`withdrawal-title-${child.id}`}
                  >
                    <div className="household-kid-card__section-header">
                      <h4
                        id={`withdrawal-title-${child.id}`}
                        className="household-kid-card__section-title"
                      >
                        Withdrawals
                      </h4>
                      <span className="household-kid-card__section-note">
                        Spending subtracts from balance
                      </span>
                    </div>
                    <form
                      className="household-kid-card__inline-form household-kid-card__inline-form--compact"
                      onSubmit={(e) => handleRecordWithdrawal(e, child.id)}
                      noValidate
                    >
                      <div className="household-kid-card__inline-fields household-kid-card__inline-fields--compact">
                        <input
                          className="household-form-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Withdrawal amount"
                          aria-label={`Withdrawal amount for ${child.name}`}
                          value={withdrawalValue}
                          onChange={(e) =>
                            setWithdrawalDrafts((current) => ({
                              ...current,
                              [child.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <button
                        type="submit"
                        className="household-button household-button--secondary household-button--small"
                      >
                        Record withdrawal
                      </button>
                    </form>
                  </section>

                  <section
                    className="household-kid-card__section"
                    aria-labelledby={`expenses-title-${child.id}`}
                  >
                    <div className="household-kid-card__section-header">
                      <h4
                        id={`expenses-title-${child.id}`}
                        className="household-kid-card__section-title"
                      >
                        Child Expenses
                      </h4>
                      <span className="household-kid-card__section-note">
                        Tag spending to this child
                      </span>
                    </div>

                    <form
                      className="household-kid-card__inline-form"
                      onSubmit={(e) => handleTagTransaction(e, child.id)}
                      noValidate
                    >
                      <div className="household-kid-card__inline-fields household-kid-card__inline-fields--compact">
                        <select
                          className="household-form-select"
                          aria-label={`Expense transaction for ${child.name}`}
                          value={transactionValue}
                          onChange={(e) =>
                            setTransactionDrafts((current) => ({
                              ...current,
                              [child.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose an expense</option>
                          {transactionData.transactions
                            .filter((transaction) => transaction.type === 'EXPENSE')
                            .map((transaction) => {
                              const taggedChildId = getTaggedTransactionChildId(transaction);
                              const taggedChild = taggedChildId
                                ? children.find((entry) => entry.id === taggedChildId)
                                : null;
                              const tagSuffix = taggedChild
                                ? ` · tagged to ${taggedChild.name}`
                                : '';
                              return (
                                <option key={transaction.id} value={transaction.id}>
                                  {transaction.date} · {transaction.payee ?? 'Expense'} ·{' '}
                                  {formatCentsAsCurrency(Math.abs(transaction.amount.amount))}
                                  {tagSuffix}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="household-button household-button--secondary household-button--small"
                      >
                        Tag expense
                      </button>
                    </form>

                    {childSummary.categoryBreakdown.length === 0 ? (
                      <p className="household-card__empty">No tagged expenses yet.</p>
                    ) : (
                      <ul className="household-kid-card__expense-list" role="list">
                        {childSummary.categoryBreakdown.map((category) => (
                          <li
                            key={category.categoryId ?? 'uncategorized'}
                            className="household-kid-card__expense-item"
                          >
                            <span>{category.categoryName}</span>
                            <CurrencyDisplay amount={category.amountCents} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Invite Section (#1779) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="invite-title">
        <h2 id="invite-title" className="household-card__title">
          Invite Member
        </h2>
        <p className="household-card__description">
          Send an invitation to join your household. New members start with privacy-by-default.
          Nothing is shared until they explicitly choose to share accounts.
        </p>

        {inviteSuccess && lastInviteCode && (
          <div className="household-banner--success" role="status">
            <p className="household-invite-success__message">
              Invitation saved. Share this link with the person you invited — they open it, sign in,
              and join from their own device:
            </p>
            <button
              type="button"
              className="household-invitation-item__code household-invite-success__link"
              onClick={() => void handleCopyInvite(lastInviteCode)}
              aria-label="Copy the invitation link to share"
              title="Click to copy the full invite link"
            >
              <code className="household-invitation-item__code-text">
                {buildInviteUrl(lastInviteCode)}
              </code>
              <span aria-hidden="true" className="household-invitation-item__code-hint">
                Copy link
              </span>
            </button>
          </div>
        )}

        {inviteError && (
          <div className="household-banner--error" role="alert">
            {inviteError}
          </div>
        )}

        <form onSubmit={handleInviteMember} noValidate className="household-invite-form">
          <div className="household-form-group">
            <label htmlFor="invite-email" className="household-form-group__label">
              Email Address
            </label>
            <input
              id="invite-email"
              className="household-form-input"
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteSuccess(false);
                setLastInviteCode(null);
              }}
              placeholder="partner@example.com"
              aria-required="true"
              autoComplete="email"
            />
          </div>

          <div className="household-form-group">
            <label htmlFor="invite-role" className="household-form-group__label">
              Role
            </label>
            <select
              id="invite-role"
              className="household-form-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as HouseholdRole)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}: {opt.description}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="household-button household-button--primary">
            Send Invitation
          </button>
        </form>
      </section>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <section className="household-card" aria-labelledby="invitations-title">
          <h2 id="invitations-title" className="household-card__title">
            Pending Invitations
          </h2>
          <p className="household-card__description" id="invitations-helper">
            Send the invite code (or click the code to copy the full invite link) to the person you
            want to share with. They can paste it at <code>/invite</code> or click the link from
            their email.
          </p>
          <ul
            className="household-invitation-list"
            role="list"
            aria-label="Pending invitations"
            aria-describedby="invitations-helper"
          >
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className="household-invitation-item">
                <div className="household-invitation-item__info">
                  <span className="household-invitation-item__email">{inv.email}</span>
                  <span className="household-invitation-item__role">{ROLE_LABELS[inv.role]}</span>
                  <span className="household-invitation-item__code-group">
                    <span
                      className="household-invitation-item__code-label"
                      id={`invite-code-label-${inv.id}`}
                    >
                      Invite code:
                    </span>
                    <button
                      type="button"
                      className="household-invitation-item__code"
                      onClick={() => void handleCopyInvite(inv.inviteCode)}
                      aria-label={`Copy invite link for ${inv.email}`}
                      title="Click to copy the full invite link"
                    >
                      {/*
                        Issue #1932: keep the bare code as the visible label so
                        users still recognise the value being copied.  Issue
                        #1933: clicking copies the full URL, not the bare code.
                      */}
                      <code className="household-invitation-item__code-text">{inv.inviteCode}</code>
                      <span aria-hidden="true" className="household-invitation-item__code-hint">
                        Copy link
                      </span>
                    </button>
                  </span>
                  <span className="household-invitation-item__status">{inv.status}</span>
                </div>
                <button
                  className="household-button household-button--secondary household-button--small"
                  onClick={() => revokeInvitation(inv.id)}
                  aria-label={`Revoke invitation for ${inv.email}`}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Account Sharing — Mine/Yours/Ours (#1781, #1716) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="account-sharing-title">
        <h2 id="account-sharing-title" className="household-card__title">
          Account Sharing
        </h2>
        <p className="household-card__description">
          Choose which accounts are shared with the household and which stay private. Private
          accounts are completely hidden from other household members (mine only). Shared accounts
          are visible to all members (ours).
        </p>
        <ul className="household-sharing-list" role="list" aria-label="Account sharing settings">
          {accountData.accounts.length === 0 ? (
            <li className="household-sharing-item household-sharing-item--empty">
              <span className="household-sharing-item__name">
                No accounts yet. Add an account to choose what to share with your household.
              </span>
            </li>
          ) : (
            accountData.accounts.map((account) => {
              const sharing = accountSharings.find((as) => as.accountId === account.id);
              const mode: AccountSharingMode = sharing?.sharingMode ?? 'PRIVATE';
              const isShared = mode === 'SHARED';
              return (
                <li key={account.id} className="household-sharing-item">
                  <div className="household-sharing-item__info">
                    <span className="household-sharing-item__name">{account.name}</span>
                    <span
                      className={`household-sharing-item__badge ${isShared ? 'household-sharing-item__badge--shared' : 'household-sharing-item__badge--private'}`}
                    >
                      {isShared ? (
                        <>
                          <AppIcon name="unlock" /> Shared
                        </>
                      ) : (
                        <>
                          <AppIcon name="lock" /> Private
                        </>
                      )}
                    </span>
                  </div>
                  <button
                    className={`household-toggle ${isShared ? 'household-toggle--active' : ''}`}
                    role="switch"
                    aria-checked={isShared}
                    aria-label={`Toggle sharing for ${account.name}`}
                    onClick={() =>
                      setAccountSharing({
                        accountId: account.id,
                        sharingMode: isShared ? 'PRIVATE' : 'SHARED',
                      })
                    }
                  >
                    <span className="household-toggle__track">
                      <span className="household-toggle__thumb" />
                    </span>
                    <span className="household-toggle__label">{SHARING_MODE_LABELS[mode]}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="household-card__note" role="note">
          <strong>Privacy boundary:</strong> Private ("mine only") accounts, transactions, and
          balances are completely invisible to other household members. This is enforced at the data
          layer, not just the UI.
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Shared Budgets (#1784) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="shared-budgets-title">
        <h2 id="shared-budgets-title" className="household-card__title">
          Shared Budgets
        </h2>
        <p className="household-card__description">
          Configure budgets that are shared with the household. Choose between flex mode (one
          overall spending limit) or category mode (per-category limits).
        </p>
        <ul className="household-budget-list" role="list" aria-label="Shared budget settings">
          {budgetData.budgets.length === 0 ? (
            <li className="household-budget-item household-budget-item--empty">
              <span className="household-budget-item__name">
                No budgets yet. Create a budget to share it with your household.
              </span>
            </li>
          ) : (
            budgetData.budgets.map((budget) => {
              const shared = sharedBudgets.find((sb) => sb.budgetId === budget.id);
              const isActive = shared?.isActive ?? false;
              const mode: SharedBudgetMode = shared?.mode ?? 'CATEGORY';
              return (
                <li key={budget.id} className="household-budget-item">
                  <div className="household-budget-item__info">
                    <span className="household-budget-item__name">{budget.name}</span>
                    {isActive && (
                      <span className="household-budget-item__mode">
                        {BUDGET_MODE_LABELS[mode]}
                      </span>
                    )}
                  </div>
                  <div className="household-budget-item__controls">
                    {isActive && (
                      <select
                        className="household-form-select household-form-select--small"
                        value={mode}
                        onChange={(e) =>
                          setSharedBudget({
                            budgetId: budget.id,
                            mode: e.target.value as SharedBudgetMode,
                          })
                        }
                        aria-label={`Budget mode for ${budget.name}`}
                      >
                        <option value="FLEX">Flex</option>
                        <option value="CATEGORY">Category</option>
                      </select>
                    )}
                    <button
                      className={`household-toggle ${isActive ? 'household-toggle--active' : ''}`}
                      role="switch"
                      aria-checked={isActive}
                      aria-label={`Toggle sharing for ${budget.name}`}
                      onClick={() => {
                        if (isActive && shared) {
                          removeSharedBudget(shared.id);
                        } else {
                          setSharedBudget({ budgetId: budget.id, mode });
                        }
                      }}
                    >
                      <span className="household-toggle__track">
                        <span className="household-toggle__thumb" />
                      </span>
                      <span className="household-toggle__label">
                        {isActive ? 'Shared' : 'Personal'}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Shared Goals (#1786) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="shared-goals-title">
        <h2 id="shared-goals-title" className="household-card__title">
          Shared Goals
        </h2>
        <p className="household-card__description">
          Share savings goals with the household so everyone can track progress together. Per-member
          contribution tracking shows who contributed what.
        </p>
        <ul className="household-goal-list" role="list" aria-label="Shared goal settings">
          {goalData.goals.length === 0 ? (
            <li className="household-goal-item household-goal-item--empty">
              <span className="household-goal-item__name">
                No goals yet. Create a savings goal to share it with your household.
              </span>
            </li>
          ) : (
            goalData.goals.map((goal) => {
              const shared = sharedGoals.find((sg) => sg.goalId === goal.id);
              const isShared = shared?.isShared ?? false;
              return (
                <li key={goal.id} className="household-goal-item">
                  <div className="household-goal-item__info">
                    <span className="household-goal-item__name">{goal.name}</span>
                    {isShared && (
                      <span className="household-goal-item__badge">Shared with household</span>
                    )}
                  </div>
                  <button
                    className={`household-toggle ${isShared ? 'household-toggle--active' : ''}`}
                    role="switch"
                    aria-checked={isShared}
                    aria-label={`Toggle sharing for ${goal.name}`}
                    onClick={() => setSharedGoal({ goalId: goal.id, isShared: !isShared })}
                  >
                    <span className="household-toggle__track">
                      <span className="household-toggle__thumb" />
                    </span>
                    <span className="household-toggle__label">
                      {isShared ? 'Shared' : 'Personal'}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Permission Check Demo (dev reference) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="permissions-demo-title">
        <h2 id="permissions-demo-title" className="household-card__title">
          Permission Reference
        </h2>
        <p className="household-card__description">
          Quick reference for what each role can do in this household.
        </p>
        <div className="household-permissions-table-wrap">
          <table className="household-permissions-table" aria-label="Role permissions matrix">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((role) => (
                  <th key={role} scope="col">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'MANAGE_MEMBERS',
                  'INVITE_MEMBERS',
                  'MANAGE_ROLES',
                  'VIEW_SHARED_ACCOUNTS',
                  'EDIT_SHARED_ACCOUNTS',
                  'CREATE_SHARED_BUDGETS',
                  'VIEW_SHARED_BUDGETS',
                  'CREATE_SHARED_GOALS',
                  'VIEW_SHARED_GOALS',
                  'ADD_TRANSACTIONS',
                ] as const
              ).map((perm) => (
                <tr key={perm}>
                  <td>{perm.replace(/_/g, ' ').toLowerCase()}</td>
                  {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((role) => (
                    <td key={role} className="household-permissions-table__cell">
                      {checkPermission(role, perm) ? (
                        <span aria-label="Allowed" title="Allowed">
                          <AppIcon name="check" />
                        </span>
                      ) : (
                        <span aria-label="Denied" title="Denied">
                          <AppIcon name="x" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {checkInOpen && (
        <Suspense fallback={null}>
          <MoneyCheckInDialog
            isOpen={checkInOpen}
            onClose={() => setCheckInOpen(false)}
            householdId={household.id}
            partners={checkInPartners}
            facts={checkInFacts}
          />
        </Suspense>
      )}

      <ConfirmDialog
        isOpen={memberPendingRemoval !== null}
        title={memberPendingRemoval?.isViewer ? 'Revoke helper access?' : 'Remove member?'}
        message={
          memberPendingRemoval?.isViewer
            ? `Revoke ${memberPendingRemoval?.name}'s read-only access to this household? They'll no longer be able to see your shared finances.`
            : `Remove ${memberPendingRemoval?.name} from this household? They'll lose access to your shared finances, and any outstanding settle-up balances with them will be orphaned. This can't be undone.`
        }
        confirmLabel={memberPendingRemoval?.isViewer ? 'Revoke access' : 'Remove'}
        variant="danger"
        onConfirm={() => {
          if (memberPendingRemoval) {
            removeMember(memberPendingRemoval.id);
          }
          setMemberPendingRemoval(null);
        }}
        onCancel={() => setMemberPendingRemoval(null)}
      />
    </main>
  );
}

export default HouseholdPage;

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Read the auth user without throwing if no AuthProvider is mounted.
 *
 * `useAuth()` is intentionally strict (throws on misuse) so production
 * callers fail loudly, but a handful of unit tests render the page
 * without wrapping it in `<AuthProvider>`.  We swallow that error and
 * fall back to `null`; the display-name resolver handles a missing
 * profile gracefully by falling back to `member.displayName` /
 * truncated UUID.
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
 * Read the toast API without throwing if no ToastProvider is mounted.
 *
 * Same rationale as {@link useOptionalAuthUser}: we don't want to force
 * every test render to wrap children in `<ToastProvider>`, and a missing
 * toast is a soft degradation (clipboard write still succeeds; the user
 * just doesn't see the confirmation).
 *
 * Issue #1933.
 */
function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
}

/** Read budget data without crashing if no DatabaseProvider is mounted. */
function useOptionalBudgets(): Pick<UseBudgetsResult, 'budgets'> {
  try {
    return { budgets: useBudgets().budgets };
  } catch {
    return { budgets: [] };
  }
}

/** Read account data without crashing if no DatabaseProvider is mounted. */
function useOptionalAccounts(): Pick<UseAccountsResult, 'accounts'> {
  try {
    return { accounts: useAccounts().accounts };
  } catch {
    return { accounts: [] };
  }
}

function useOptionalGoals(): Pick<UseGoalsResult, 'goals' | 'createGoal'> {
  try {
    const { goals, createGoal } = useGoals();
    return { goals, createGoal };
  } catch {
    return { goals: [], createGoal: () => Promise.resolve(null) };
  }
}

function useOptionalTransactions(): Pick<
  UseTransactionsResult,
  'transactions' | 'updateTransaction'
> {
  try {
    const { transactions, updateTransaction } = useTransactions({ type: 'EXPENSE' });
    return { transactions, updateTransaction };
  } catch {
    return { transactions: [], updateTransaction: () => Promise.resolve(null) };
  }
}

function useOptionalCategories(): Pick<UseCategoriesResult, 'categories'> {
  try {
    return { categories: useCategories().categories };
  } catch {
    return { categories: [] };
  }
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

function formatCentsAsCurrency(amountCents: number): string {
  return currencyFormatter.format(amountCents / 100);
}

/**
 * Copy `text` to the clipboard.
 *
 * Uses `navigator.clipboard.writeText` when available (modern browsers,
 * secure contexts) and falls back to the legacy `document.execCommand`
 * shim otherwise.  Returns `true` on success.
 *
 * Issue #1933.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy shim below.
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

type ScorecardStatusTone = 'positive' | 'warning' | 'negative';

interface HouseholdScorecardCategory {
  readonly name: string;
  readonly budgetAmount: number;
  readonly spentAmount: number;
}

interface HouseholdScorecardMemberViewModel {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly role: HouseholdRole;
  readonly budgetAmount: number;
  readonly spentAmount: number;
  readonly spendPace: number;
  readonly statusTone: ScorecardStatusTone;
  readonly statusLabel: string;
  readonly topOverspendingCategory: HouseholdScorecardCategory | null;
  readonly motivation: string;
}

interface HouseholdScorecardViewModel {
  readonly dayOfMonth: number;
  readonly daysInMonth: number;
  readonly timePace: number;
  readonly householdSpendPace: number;
  readonly householdVariance: number;
  readonly members: HouseholdScorecardMemberViewModel[];
}

function buildHouseholdScorecard({
  members,
  budgetSnapshots,
  transactions,
  accountSharings,
  resolveMemberName,
  referenceDate,
}: {
  members: HouseholdMember[];
  budgetSnapshots: ScorecardBudgetSnapshot[];
  transactions: Transaction[];
  accountSharings: AccountSharing[];
  resolveMemberName: (member: HouseholdMember) => string;
  referenceDate: Date;
}): HouseholdScorecardViewModel {
  const dayOfMonth = referenceDate.getDate();
  const daysInMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
  ).getDate();
  const timePace = dayOfMonth / Math.max(daysInMonth, 1);
  const householdBudgetAmount = budgetSnapshots.reduce(
    (sum, budget) => sum + budget.budgetAmount,
    0,
  );
  const householdSpentAmount = budgetSnapshots.reduce((sum, budget) => sum + budget.spentAmount, 0);
  const householdSpendPace =
    householdBudgetAmount > 0 ? householdSpentAmount / householdBudgetAmount : 0;
  const householdVariance = Math.round(householdBudgetAmount * timePace) - householdSpentAmount;

  if (members.length === 0) {
    return {
      dayOfMonth,
      daysInMonth,
      timePace,
      householdSpendPace,
      householdVariance,
      members: [],
    };
  }

  // Real per-member attribution (#3379). Spend is distributed using each
  // member's ACTUAL transactions in the category, attributed via the owning
  // account (account_sharing.owner_id -> member.userId). Budgets have no
  // per-member assignment in the data model, so a household category budget is
  // split equally across members — a transparent, non-fabricated basis. No
  // synthetic role/index/pace weighting remains.
  const memberIndexByUserId = new Map<string, number>();
  members.forEach((member, index) => {
    memberIndexByUserId.set(member.userId, index);
  });
  const memberIndexByAccountId = new Map<string, number>();
  accountSharings.forEach((sharing) => {
    const memberIndex = memberIndexByUserId.get(sharing.ownerId);
    if (memberIndex !== undefined) {
      memberIndexByAccountId.set(sharing.accountId, memberIndex);
    }
  });

  const realSpendByCategory = new Map<string, number[]>();
  transactions.forEach((transaction) => {
    if (transaction.type !== 'EXPENSE' || !transaction.categoryId) {
      return;
    }
    const memberIndex = memberIndexByAccountId.get(transaction.accountId);
    if (memberIndex === undefined) {
      return;
    }
    const perMember =
      realSpendByCategory.get(transaction.categoryId) ?? new Array<number>(members.length).fill(0);
    perMember[memberIndex] += Math.abs(transaction.amount.amount);
    realSpendByCategory.set(transaction.categoryId, perMember);
  });

  const equalWeights = members.map(() => 1);
  const categoriesByMember = members.map(() =>
    budgetSnapshots.map((budget) => ({
      name: budget.name,
      budgetAmount: 0,
      spentAmount: 0,
    })),
  );

  budgetSnapshots.forEach((budget, budgetIndex) => {
    const realSpendWeights = realSpendByCategory.get(budget.categoryId);
    const spentWeights =
      realSpendWeights && realSpendWeights.some((weight) => weight > 0)
        ? realSpendWeights
        : equalWeights;

    const allocatedBudget = allocateAmount(budget.budgetAmount, equalWeights);
    const allocatedSpent = allocateAmount(budget.spentAmount, spentWeights);

    members.forEach((_, memberIndex) => {
      categoriesByMember[memberIndex][budgetIndex] = {
        name: budget.name,
        budgetAmount: allocatedBudget[memberIndex] ?? 0,
        spentAmount: allocatedSpent[memberIndex] ?? 0,
      };
    });
  });

  return {
    dayOfMonth,
    daysInMonth,
    timePace,
    householdSpendPace,
    householdVariance,
    members: members.map((member, memberIndex) => {
      const name = resolveMemberName(member);
      const categories = categoriesByMember[memberIndex];
      const budgetAmount = categories.reduce((sum, category) => sum + category.budgetAmount, 0);
      const spentAmount = categories.reduce((sum, category) => sum + category.spentAmount, 0);
      const spendPace = budgetAmount > 0 ? spentAmount / budgetAmount : 0;
      const { tone: statusTone, label: statusLabel } = getScorecardStatus(spendPace, timePace);
      const topOverspendingCategory =
        categories
          .map((category) => ({
            ...category,
            aheadBy: category.spentAmount - Math.round(category.budgetAmount * timePace),
          }))
          .filter((category) => category.aheadBy > 0)
          .sort((left, right) => right.aheadBy - left.aheadBy)[0] ?? null;

      return {
        id: member.id,
        name,
        avatar: getMemberInitials(name),
        role: member.role,
        budgetAmount,
        spentAmount,
        spendPace,
        statusTone,
        statusLabel,
        topOverspendingCategory,
        motivation:
          statusTone === 'positive'
            ? `You're ${dayOfMonth} days in and only ${formatPercent(spendPace)} spent. Great pace!`
            : topOverspendingCategory
              ? `Heads up: you're ahead of pace in ${topOverspendingCategory.name}.`
              : "Heads up: you're spending faster than the month is moving.",
      };
    }),
  };
}

function getScorecardStatus(
  spendPace: number,
  timePace: number,
): { tone: ScorecardStatusTone; label: string } {
  if (spendPace <= timePace + 0.05) {
    return { tone: 'positive', label: '🟢 On Track' };
  }
  if (spendPace <= timePace + 0.15) {
    return { tone: 'warning', label: '🟡 Watch It' };
  }
  return { tone: 'negative', label: '🔴 Over Budget' };
}

function normalizeWeights(weights: number[]): number[] {
  if (weights.length === 0) {
    return [];
  }

  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights.map(() => 1 / weights.length);
  }

  return weights.map((value) => value / total);
}

function allocateAmount(total: number, weights: number[]): number[] {
  if (weights.length === 0) {
    return [];
  }

  const normalized = normalizeWeights(weights);
  const raw = normalized.map((weight) => total * weight);
  const allocated = raw.map((value) => Math.floor(value));
  let remainder = total - allocated.reduce((sum, value) => sum + value, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((left, right) => right.fraction - left.fraction);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    allocated[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return allocated;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function toProgressValue(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function getMemberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return 'HH';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}
