// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '../auth/auth-context';
import { useToast } from '../components/common/Toast';
import {
  applyChildWeeklyProcessing,
  buildChildFinanceRollup,
  calculateChildWeeklyChoreEarnings,
  getChildTransactionUpdate,
  toggleChoreCompletionForChildren,
} from '../hooks/householdKids';
import { useBudgets } from '../hooks/useBudgets';
import type { UseBudgetsResult } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import type { UseCategoriesResult } from '../hooks/useCategories';
import { useGoals } from '../hooks/useGoals';
import type { UseGoalsResult } from '../hooks/useGoals';
import { useHousehold } from '../hooks/useHousehold';
import type { UseHouseholdResult } from '../hooks/useHousehold';
import { useTransactions } from '../hooks/useTransactions';
import type { UseTransactionsResult } from '../hooks/useTransactions';
import { HouseholdPage } from './HouseholdPage';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks/useHousehold', async () => {
  const actual =
    await vi.importActual<typeof import('../hooks/useHousehold')>('../hooks/useHousehold');

  return {
    ...actual,
    useHousehold: vi.fn(),
    getHouseholdScorecardSeeds: (members: Array<{ role: string }>) => {
      if (members.length === 0) {
        return [];
      }

      if (members.length === 1) {
        return [{ memberWeight: 1, paceOffset: 0 }];
      }

      return members.map(() => ({
        memberWeight: 1 / members.length,
        paceOffset: 0,
      }));
    },
  };
});

vi.mock('../hooks/useBudgets', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useBudgets')>('../hooks/useBudgets');
  return {
    ...actual,
    useBudgets: vi.fn(),
  };
});

vi.mock('../hooks/useGoals', () => ({
  useGoals: vi.fn(),
}));

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

vi.mock('../hooks/useCategories', () => ({
  useCategories: vi.fn(),
}));

vi.mock('../auth/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/common/Toast', () => ({
  useToast: vi.fn(),
}));

const mockedUseHousehold = vi.mocked(useHousehold);
const mockedUseBudgets = vi.mocked(useBudgets);
const mockedUseGoals = vi.mocked(useGoals);
const mockedUseTransactions = vi.mocked(useTransactions);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseToast = vi.mocked(useToast);

function mockBudgetsResult(overrides: Partial<UseBudgetsResult> = {}): UseBudgetsResult {
  return {
    budgets: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createBudget: vi.fn(),
    createBudgetTemplate: vi.fn(),
    updateBudget: vi.fn(),
    deleteBudget: vi.fn(),
    getBudgetSpendingBreakdown: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function mockGoalsResult(overrides: Partial<UseGoalsResult> = {}): UseGoalsResult {
  return {
    goals: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    contributeToGoal: vi.fn(),
    deleteGoal: vi.fn(),
    ...overrides,
  };
}

function mockTransactionsResult(
  overrides: Partial<UseTransactionsResult> = {},
): UseTransactionsResult {
  return {
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    ...overrides,
  };
}

function mockCategoriesResult(overrides: Partial<UseCategoriesResult> = {}): UseCategoriesResult {
  return {
    categories: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    foodMealTemplate: {
      parentCategory: null,
      subcategories: [],
      missingSubcategoryDefinitions: [],
    },
    ensureFoodMealCategories: vi.fn(),
    ...overrides,
  };
}

function mockHouseholdResult(overrides: Partial<UseHouseholdResult> = {}): UseHouseholdResult {
  return {
    household: null,
    members: [],
    invitations: [],
    accountSharings: [],
    sharedBudgets: [],
    sharedGoals: [],
    sharedExpenses: [],
    sharedSettlements: [],
    sharedExpenseBalances: [],
    settleUpSuggestions: [],
    children: [],
    activityEvents: [],
    recurringBills: [],
    goalPledges: [],
    shoppingBudgets: [],
    reconciliationPlans: [],
    reconciliationSnapshots: [],
    loading: false,
    error: null,
    createHousehold: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    addTrustedHelper: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    checkPermission: vi.fn().mockReturnValue(false),
    setAccountSharing: vi.fn(),
    isAccountVisible: vi.fn().mockReturnValue(false),
    setSharedBudget: vi.fn(),
    removeSharedBudget: vi.fn(),
    setSharedGoal: vi.fn(),
    logSharedExpense: vi.fn(),
    recordSharedSettlement: vi.fn(),
    createRecurringSharedBill: vi.fn(),
    setRecurringBillPaused: vi.fn(),
    updateRecurringBillCycle: vi.fn(),
    markRecurringBillCyclePaid: vi.fn(),
    setGoalContributionPledge: vi.fn(),
    recordGoalContribution: vi.fn(),
    createShoppingBudget: vi.fn(),
    logShoppingTrip: vi.fn(),
    setReconciliationPlan: vi.fn(),
    markReconciliationPeriodReconciled: vi.fn(),
    createChildProfile: vi.fn(),
    addChildChore: vi.fn(),
    toggleChildChoreCompletion: vi.fn(),
    recordChildWithdrawal: vi.fn(),
    linkChildCollegeFundGoal: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper — creates a standard household for tests that need one
// ---------------------------------------------------------------------------

function makeHousehold(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hh-1',
    name: 'Smith Family',
    ownerId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeOwnerMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    householdId: 'hh-1',
    userId: 'user-1-abcdef',
    displayName: null,
    role: 'OWNER' as const,
    joinedAt: '2025-01-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

function makeChild(overrides: Record<string, unknown> = {}) {
  return {
    id: 'child-1',
    name: 'Maya',
    age: 12,
    weeklyAllowance: 10,
    allowanceDay: 'friday' as const,
    balance: 14,
    collegeFundGoalId: null,
    chores: [
      {
        id: 'chore-1',
        name: 'Unload dishwasher',
        value: 2,
        frequency: 'daily' as const,
        completedThisWeek: true,
      },
    ],
    createdAt: '2025-01-01T12:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    lastAllowanceCreditAt: '2025-01-03T12:00:00Z',
    lastChoreResetAt: '2025-01-06T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('household kids helpers', () => {
  it('applies due weekly allowance credits and resets completed chores for a new week', () => {
    const processed = applyChildWeeklyProcessing(
      makeChild({
        weeklyAllowance: 15,
        balance: 20,
        allowanceDay: 'monday',
        createdAt: '2025-01-01T12:00:00Z',
        lastAllowanceCreditAt: '2025-01-06T12:00:00Z',
        lastChoreResetAt: '2025-01-06T12:00:00Z',
        chores: [
          {
            id: 'chore-1',
            name: 'Feed the dog',
            value: 3,
            frequency: 'daily',
            completedThisWeek: true,
          },
        ],
      }),
      new Date('2025-01-15T12:00:00Z'),
    );

    expect(processed.balance).toBe(35);
    expect(processed.lastAllowanceCreditAt?.startsWith('2025-01-13')).toBe(true);
    expect(processed.chores[0]?.completedThisWeek).toBe(false);
    expect(calculateChildWeeklyChoreEarnings(processed)).toBe(0);
  });

  it('toggles chore completion and updates weekly earnings balance', () => {
    const child = makeChild({
      balance: 10,
      chores: [
        {
          id: 'chore-1',
          name: 'Take out trash',
          value: 4,
          frequency: 'weekly',
          completedThisWeek: false,
        },
      ],
    });

    const completed = toggleChoreCompletionForChildren(
      [child],
      'child-1',
      'chore-1',
      new Date('2025-01-08T12:00:00Z'),
    );
    expect(completed[0]?.balance).toBe(14);
    expect(calculateChildWeeklyChoreEarnings(completed[0]!)).toBe(4);

    const reverted = toggleChoreCompletionForChildren(
      completed,
      'child-1',
      'chore-1',
      new Date('2025-01-08T12:00:00Z'),
    );
    expect(reverted[0]?.balance).toBe(10);
    expect(calculateChildWeeklyChoreEarnings(reverted[0]!)).toBe(0);
  });

  it('aggregates per-child expenses and college fund progress', () => {
    const child = makeChild({ collegeFundGoalId: 'goal-college-1' });
    const rollup = buildChildFinanceRollup({
      children: [child],
      transactions: [
        {
          id: 'txn-1',
          type: 'EXPENSE',
          date: '2025-01-10',
          amount: { amount: -1250 },
          categoryId: 'cat-school',
          customFields: { childId: 'child-1' },
          tags: [],
        },
        {
          id: 'txn-2',
          type: 'EXPENSE',
          date: '2025-03-02',
          amount: { amount: -3000 },
          categoryId: 'cat-sports',
          customFields: null,
          tags: ['child:child-1'],
        },
      ] as unknown as Parameters<typeof buildChildFinanceRollup>[0]['transactions'],
      goals: [
        {
          id: 'goal-college-1',
          targetAmount: { amount: 1000000 },
          currentAmount: { amount: 250000 },
        },
      ] as unknown as Parameters<typeof buildChildFinanceRollup>[0]['goals'],
      categories: [
        { id: 'cat-school', name: 'School' },
        { id: 'cat-sports', name: 'Sports' },
      ] as unknown as Parameters<typeof buildChildFinanceRollup>[0]['categories'],
      referenceDate: new Date('2025-01-15T12:00:00Z'),
    });

    expect(rollup.householdMonthSpentCents).toBe(1250);
    expect(rollup.householdYearSpentCents).toBe(4250);
    expect(rollup.children['child-1']?.categoryBreakdown).toEqual([
      { categoryId: 'cat-sports', categoryName: 'Sports', amountCents: 3000 },
      { categoryId: 'cat-school', categoryName: 'School', amountCents: 1250 },
    ]);
    expect(rollup.children['child-1']?.collegeFundProgress).toBe(0.25);
  });

  it('builds child transaction tag updates without dropping existing metadata', () => {
    expect(
      getChildTransactionUpdate(
        {
          customFields: { receiptId: 'r-1', childId: 'old-child' },
          tags: ['receipt', 'child:old-child'],
        },
        'child-1',
      ),
    ).toEqual({
      customFields: { receiptId: 'r-1', childId: 'child-1' },
      tags: ['receipt', 'child:child-1'],
    });
  });
});

describe('HouseholdPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no signed-in user.  Tests that exercise the OAuth-fallback
    // path override this with a more specific value.
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      webAuthnReady: true,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseToast.mockReturnValue({
      showToast: vi.fn(),
      dismissToast: vi.fn(),
    });
    mockedUseBudgets.mockReturnValue(mockBudgetsResult());
    mockedUseGoals.mockReturnValue(mockGoalsResult());
    mockedUseTransactions.mockReturnValue(mockTransactionsResult());
    mockedUseCategories.mockReturnValue(mockCategoriesResult());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult({ loading: true }));

    render(<HouseholdPage />);

    expect(screen.getByText('Loading household data…')).toBeInTheDocument();
  });

  it('shows creation form when no household exists', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult());

    render(<HouseholdPage />);

    expect(screen.getByText('Create Your Household')).toBeInTheDocument();
    expect(screen.getByLabelText(/household name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create household/i })).toBeInTheDocument();
  });

  it('mentions privacy-by-default in creation form', () => {
    mockedUseHousehold.mockReturnValue(mockHouseholdResult());

    render(<HouseholdPage />);

    expect(screen.getByText(/privacy-by-default/i)).toBeInTheDocument();
  });

  it('renders household management when household exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
        children: [makeChild()],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Smith Family')).toBeInTheDocument();
    expect(screen.getByText('Family Plan')).toBeInTheDocument();
    expect(screen.getByText('Trusted Helper')).toBeInTheDocument();
    expect(screen.getByText('Members & Roles')).toBeInTheDocument();
    expect(screen.getByText('Shared Expenses / Settle Up')).toBeInTheDocument();
    expect(screen.getByText('Mid-Month Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Kids & Allowances')).toBeInTheDocument();
    expect(screen.getByText('Household Beta Tools')).toBeInTheDocument();
    expect(screen.getByText('Yours / Mine / Ours Reconciliation')).toBeInTheDocument();
    expect(screen.getByText('Recurring Shared Bills')).toBeInTheDocument();
    expect(screen.getByText('Goal Contribution Pledges')).toBeInTheDocument();
    expect(screen.getByText('Shared Shopping Budgets')).toBeInTheDocument();
    expect(screen.getByText('Household Activity Feed')).toBeInTheDocument();
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
    expect(screen.getByText('Account Sharing')).toBeInTheDocument();
    expect(screen.getByText('Shared Budgets')).toBeInTheDocument();
    expect(screen.getByText('Shared Goals')).toBeInTheDocument();
    expect(screen.getByText('Permission Reference')).toBeInTheDocument();
  });

  it('adds a trusted helper as read-only through the friendly form', () => {
    const addTrustedHelper = vi
      .fn()
      .mockReturnValue(
        makeOwnerMember({ id: 'helper-1', role: 'VIEWER', displayName: 'Aunt Maria' }),
      );
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
        addTrustedHelper,
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('What they can see')).toBeInTheDocument();
    expect(screen.getByText(/Shared balances, bills, budgets, goals/i)).toBeInTheDocument();
    expect(screen.getByText(/Move money, pay bills, or add transactions/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/helper name/i), { target: { value: 'Aunt Maria' } });
    fireEvent.change(screen.getByLabelText(/how they will access it/i), {
      target: { value: 'READ_ONLY_SUMMARY' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add trusted helper/i }));

    expect(addTrustedHelper).toHaveBeenCalledWith({
      name: 'Aunt Maria',
      accessMethod: 'READ_ONLY_SUMMARY',
    });
    expect(screen.getByText(/Aunt Maria was added as a trusted helper/i)).toBeInTheDocument();
  });

  it('marks trusted helper members read-only and revokes them from the member list', () => {
    const removeMember = vi.fn().mockReturnValue(true);
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [
          makeOwnerMember(),
          makeOwnerMember({ id: 'helper-1', role: 'VIEWER', displayName: 'Aunt Maria' }),
        ],
        removeMember,
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getAllByText('Aunt Maria').length).toBeGreaterThan(0);
    expect(screen.getByText('Trusted helper · Read-only')).toBeInTheDocument();
    expect(
      screen.getByText('Can view shared finances; cannot change or delete anything'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /revoke helper access for aunt maria/i }));

    expect(removeMember).toHaveBeenCalledWith('helper-1');
  });

  it('renders the mid-month scorecard with demo-backed pace messaging', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember({ displayName: 'Jordan Smith' })],
      }),
    );
    mockedUseBudgets.mockReturnValue(mockBudgetsResult({ budgets: [] }));

    render(<HouseholdPage />);

    expect(screen.getByText('Mid-Month Scorecard')).toBeInTheDocument();
    expect(screen.getAllByText('Jordan Smith').length).toBeGreaterThan(0);
    expect(screen.getByText('🟢 On Track')).toBeInTheDocument();
    expect(screen.getByText(/Your household is/)).toHaveTextContent(
      'Your household is $44.19 under budget this month',
    );
    expect(
      screen.getByText(
        (_, element) => element?.textContent === 'Top overspending category: Dining Out',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You're 15 days in and only 46% spent — great pace!"),
    ).toBeInTheDocument();
  });

  it('renders child cards with chores and weekly earnings', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
        children: [makeChild()],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText(/Allowance \$10\.00 on Friday/i)).toBeInTheDocument();
    expect(screen.getByText('Unload dishwasher')).toBeInTheDocument();
    expect(screen.getByText('$2.00 bonus • daily')).toBeInTheDocument();
    expect(screen.getAllByText('$14.00')).toHaveLength(2);
    expect(screen.getByText('$2.00')).toBeInTheDocument();
  });

  it('submits the child profile form through the household hook', () => {
    const createChildProfile = vi.fn().mockReturnValue(makeChild());
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
        createChildProfile,
      }),
    );

    render(<HouseholdPage />);

    fireEvent.change(screen.getByLabelText(/child name/i), { target: { value: 'Leo' } });
    fireEvent.change(screen.getByLabelText(/^age$/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/weekly allowance/i), { target: { value: '7.5' } });
    fireEvent.change(screen.getByLabelText(/starting balance/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/allowance day/i), { target: { value: 'wednesday' } });

    fireEvent.click(screen.getByRole('button', { name: /add child profile/i }));

    expect(createChildProfile).toHaveBeenCalledWith({
      name: 'Leo',
      age: 8,
      weeklyAllowance: 7.5,
      allowanceDay: 'wednesday',
      balance: 3,
    });
  });

  it('toggles chores and records withdrawals through the household hook', () => {
    const toggleChildChoreCompletion = vi.fn();
    const recordChildWithdrawal = vi.fn().mockReturnValue(makeChild({ balance: 9 }));
    const addChildChore = vi.fn().mockReturnValue({
      id: 'chore-2',
      name: 'Make bed',
      value: 1,
      frequency: 'daily',
      completedThisWeek: false,
    });

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember()],
        children: [makeChild()],
        toggleChildChoreCompletion,
        recordChildWithdrawal,
        addChildChore,
      }),
    );

    render(<HouseholdPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /unload dishwasher/i }));
    expect(toggleChildChoreCompletion).toHaveBeenCalledWith('child-1', 'chore-1');

    fireEvent.change(screen.getByLabelText(/chore name for maya/i), {
      target: { value: 'Make bed' },
    });
    fireEvent.change(screen.getByLabelText(/chore value for maya/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/chore frequency for maya/i), {
      target: { value: 'daily' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add chore/i }));

    expect(addChildChore).toHaveBeenCalledWith({
      childId: 'child-1',
      name: 'Make bed',
      value: 1,
      frequency: 'daily',
    });

    fireEvent.change(screen.getByLabelText(/withdrawal amount for maya/i), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /record withdrawal/i }));

    expect(recordChildWithdrawal).toHaveBeenCalledWith({ childId: 'child-1', amount: 5 });
  });

  it('displays error banner when error exists', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        error: 'Something went wrong',
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows pending invitations section with invite code label and bare code value', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        invitations: [
          {
            id: 'inv-1',
            householdId: 'hh-1',
            invitedBy: 'user-1',
            email: 'partner@example.com',
            role: 'ADMIN',
            status: 'PENDING',
            inviteCode: 'abc12345',
            expiresAt: '2025-01-08T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
    expect(screen.getByText('partner@example.com')).toBeInTheDocument();
    // #1932: explicit label is shown
    expect(screen.getByText('Invite code:')).toBeInTheDocument();
    // #1932: bare code is the visible text (no "Code: " prefix)
    expect(screen.getByText('abc12345')).toBeInTheDocument();
    // #1933: code is a button (focusable, click-to-copy)
    expect(
      screen.getByRole('button', { name: /copy invite link for partner@example\.com/i }),
    ).toBeInTheDocument();
  });

  it('copies the full invite URL to the clipboard and shows a toast when the code is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const showToast = vi.fn();
    mockedUseToast.mockReturnValue({
      showToast,
      dismissToast: vi.fn(),
    });

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        invitations: [
          {
            id: 'inv-1',
            householdId: 'hh-1',
            invitedBy: 'user-1',
            email: 'partner@example.com',
            role: 'ADMIN',
            status: 'PENDING',
            inviteCode: 'abc12345',
            expiresAt: '2025-01-08T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    const copyButton = screen.getByRole('button', {
      name: /copy invite link for partner@example\.com/i,
    });

    fireEvent.click(copyButton);

    // Wait a microtask for the awaited writeText to resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toMatch(/\/invite\/abc12345$/);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Invite link copied' }),
    );
  });

  it('renders the OAuth name for the owner instead of the raw user UUID', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1-abcdef',
        email: 'jordan@example.com',
        name: 'Jordan Smith',
        hasPasskey: false,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      webAuthnReady: true,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember({ displayName: null, userId: 'user-1-abcdef' })],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getAllByText('Jordan Smith').length).toBeGreaterThan(0);
    // The raw UUID must not appear.
    expect(screen.queryByText(/user-1-a/)).not.toBeInTheDocument();
  });

  it('falls back to the email address when no OAuth name is available', () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'user-1-abcdef',
        email: 'jordan@example.com',
        hasPasskey: false,
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
      webAuthnSupported: false,
      webAuthnReady: true,
      isDemoMode: false,
      isOffline: false,
      showPasskeyPrompt: false,
      dismissPasskeyPrompt: vi.fn(),
      loginWithEmail: vi.fn(),
      loginWithPasskey: vi.fn(),
      loginWithOAuth: vi.fn(),
      registerNewPasskey: vi.fn(),
      logout: vi.fn(),
      deleteAccount: vi.fn(),
      refresh: vi.fn(),
      signupWithEmail: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);

    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [makeOwnerMember({ displayName: null, userId: 'user-1-abcdef' })],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getAllByText('jordan@example.com').length).toBeGreaterThan(0);
  });

  it('logs an equal shared expense through the household hook', () => {
    const logSharedExpense = vi.fn().mockReturnValue({ id: 'expense-1' });
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [
          makeOwnerMember({ id: 'mem-1', displayName: 'Alex' }),
          makeOwnerMember({ id: 'mem-2', role: 'MEMBER', displayName: 'Sam' }),
        ],
        logSharedExpense,
      }),
    );

    render(<HouseholdPage />);

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Groceries' } });
    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText(/who paid/i), { target: { value: 'mem-2' } });
    fireEvent.click(screen.getByRole('button', { name: /log shared expense/i }));

    expect(logSharedExpense).toHaveBeenCalledWith({
      description: 'Groceries',
      amount: 60,
      paidByMemberId: 'mem-2',
      splitMode: 'EQUAL',
      splits: [
        { memberId: 'mem-1', amount: 30 },
        { memberId: 'mem-2', amount: 30 },
      ],
    });
  });

  it('marks a settle-up suggestion as settled', () => {
    const recordSharedSettlement = vi.fn().mockReturnValue({ id: 'settlement-1' });
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold(),
        members: [
          makeOwnerMember({ id: 'mem-1', displayName: 'Alex' }),
          makeOwnerMember({ id: 'mem-2', role: 'MEMBER', displayName: 'Sam' }),
        ],
        sharedExpenseBalances: [
          {
            memberId: 'mem-1',
            paid: 0,
            share: 20,
            settledPaid: 0,
            settledReceived: 0,
            netBalance: -20,
          },
          {
            memberId: 'mem-2',
            paid: 20,
            share: 0,
            settledPaid: 0,
            settledReceived: 0,
            netBalance: 20,
          },
        ],
        settleUpSuggestions: [{ fromMemberId: 'mem-1', toMemberId: 'mem-2', amount: 20 }],
        recordSharedSettlement,
      }),
    );

    render(<HouseholdPage />);

    expect(
      screen.getByText((_, element) => element?.textContent === 'Alex pays Sam $20.00'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mark settled/i }));

    expect(recordSharedSettlement).toHaveBeenCalledWith({
      fromMemberId: 'mem-1',
      toMemberId: 'mem-2',
      amount: 20,
    });
  });

  it('renders account sharing toggles with privacy labels', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        accountSharings: [
          {
            id: 'as-1',
            accountId: 'acct-checking',
            householdId: 'hh-1',
            ownerId: 'user-1',
            sharingMode: 'SHARED',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    // Account sharing section exists
    expect(screen.getByText('Account Sharing')).toBeInTheDocument();
    expect(screen.getByText('Checking Account')).toBeInTheDocument();

    // Privacy boundary note exists
    expect(screen.getByText(/privacy boundary/i)).toBeInTheDocument();

    // Shared account has toggle
    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('renders shared budget controls with mode selector', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        sharedBudgets: [
          {
            id: 'sb-1',
            householdId: 'hh-1',
            budgetId: 'budget-groceries',
            mode: 'FLEX',
            isActive: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Shared Budgets')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('renders shared goals with toggle', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        sharedGoals: [
          {
            id: 'sg-1',
            householdId: 'hh-1',
            goalId: 'goal-vacation',
            isShared: true,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            deletedAt: null,
            syncVersion: 1,
            isSynced: true,
          },
        ],
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Shared Goals')).toBeInTheDocument();
    expect(screen.getByText('Family Vacation')).toBeInTheDocument();
    expect(screen.getByText('Shared with household')).toBeInTheDocument();
  });

  it('shows role permission reference table', () => {
    mockedUseHousehold.mockReturnValue(
      mockHouseholdResult({
        household: makeHousehold({ name: 'Test' }),
        checkPermission: vi.fn().mockReturnValue(true),
      }),
    );

    render(<HouseholdPage />);

    expect(screen.getByText('Permission Reference')).toBeInTheDocument();
    expect(screen.getByLabelText('Role permissions matrix')).toBeInTheDocument();
  });
});
