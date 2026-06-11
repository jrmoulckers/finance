// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetWithSpending } from '../../db/repositories/budgets';
import type { Account, Bill, Category, Goal, Transaction } from '../../kmp/bridge';
import { useWealthInsights } from '../useWealthInsights';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

const mockUseAccounts = vi.fn();
const mockUseTransactions = vi.fn();
const mockUseBills = vi.fn();
const mockUseBudgets = vi.fn();
const mockUseGoals = vi.fn();
const mockUseCategories = vi.fn();

vi.mock('../useAccounts', () => ({ useAccounts: () => mockUseAccounts() }));
vi.mock('../useTransactions', () => ({ useTransactions: () => mockUseTransactions() }));
vi.mock('../useBills', () => ({ useBills: () => mockUseBills() }));
vi.mock('../useBudgets', () => ({ useBudgets: () => mockUseBudgets() }));
vi.mock('../useGoals', () => ({ useGoals: () => mockUseGoals() }));
vi.mock('../useCategories', () => ({ useCategories: () => mockUseCategories() }));

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 200_000 },
    isArchived: false,
    sortOrder: 1,
    icon: null,
    color: null,
    ...syncMetadata,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'food',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: '2025-01-10',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    moodTag: null,
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    householdId: 'household-1',
    name: 'Rent',
    payee: 'Landlord',
    amount: { amount: 45_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    dueDate: '2025-01-24',
    frequency: 'MONTHLY',
    status: 'UPCOMING',
    categoryId: null,
    accountId: null,
    note: null,
    isAutoPay: false,
    reminderDaysBefore: 3,
    lastPaidDate: null,
    ...syncMetadata,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<BudgetWithSpending> = {}): BudgetWithSpending {
  return {
    id: 'budget-1',
    householdId: 'household-1',
    categoryId: 'food',
    name: 'Groceries',
    amount: { amount: 20_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    period: 'MONTHLY',
    startDate: '2025-01-01',
    endDate: null,
    isRollover: false,
    spentAmount: { amount: 10_000 },
    remainingAmount: { amount: 10_000 },
    ...syncMetadata,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    householdId: 'household-1',
    name: 'Emergency fund',
    description: null,
    targetAmount: { amount: 100_000 },
    currentAmount: { amount: 50_000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: '2025-06-01',
    status: 'ACTIVE',
    icon: null,
    color: null,
    accountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'food',
    householdId: 'household-1',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    isBiometricProtected: false,
    ...syncMetadata,
    ...overrides,
  };
}

describe('useWealthInsights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T12:00:00Z'));

    mockUseAccounts.mockReturnValue({
      accounts: [
        makeAccount({ id: 'checking', currentBalance: { amount: 200_000 } }),
        makeAccount({ id: 'savings', type: 'SAVINGS', currentBalance: { amount: 80_000 } }),
        makeAccount({ id: 'card', type: 'CREDIT_CARD', currentBalance: { amount: -20_000 } }),
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseTransactions.mockReturnValue({
      transactions: [
        makeTransaction({
          id: 'expense-current',
          amount: { amount: -10_000 },
          date: '2025-01-10',
          moodTag: '😡',
        }),
        makeTransaction({
          id: 'income-current',
          type: 'INCOME',
          amount: { amount: 120_000 },
          categoryId: null,
          date: '2025-01-05',
        }),
        makeTransaction({ id: 'expense-previous', amount: { amount: -8_000 }, date: '2024-12-10' }),
        makeTransaction({
          id: 'income-previous',
          type: 'INCOME',
          amount: { amount: 100_000 },
          categoryId: null,
          date: '2024-12-05',
        }),
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseBills.mockReturnValue({
      bills: [makeBill()],
      summary: { upcomingCount: 1, overdueCount: 0, totalUpcoming: 45_000, totalOverdue: 0 },
      loading: false,
      error: null,
      notificationPermission: 'unsupported',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn(),
    });
    mockUseBudgets.mockReturnValue({
      budgets: [makeBudget()],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseGoals.mockReturnValue({
      goals: [makeGoal()],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockUseCategories.mockReturnValue({
      categories: [makeCategory()],
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds weekly and monthly digests from local hook data', () => {
    const { result } = renderHook(() => useWealthInsights());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.digest?.period).toBe('weekly');
    expect(result.current.digest?.currencyCode).toBe('USD');
    expect(result.current.digest?.spending.topCategories[0]?.categoryName).toBe('Food');
    expect(result.current.digest?.healthScore.score).toBeGreaterThan(0);
    expect(result.current.wellness?.anxietyScore.score).toBeGreaterThanOrEqual(0);
    expect(result.current.wellness?.moodCorrelation.entriesTagged).toBe(1);
    expect(result.current.digests.monthly?.period).toBe('monthly');
  });

  it('switches the active digest period', () => {
    const { result } = renderHook(() => useWealthInsights());

    act(() => {
      result.current.setActivePeriod('monthly');
    });

    expect(result.current.activePeriod).toBe('monthly');
    expect(result.current.digest?.period).toBe('monthly');
  });
});
