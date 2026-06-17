// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Account, Goal, Transaction } from '../../kmp/bridge';
import type { DashboardData } from '../../hooks/useDashboardData';
import { LEARNING_MODULES } from './curriculum';
import { buildLearningActivityProfile, suggestNextLessons } from './adaptive';
import { createEmptyLearningProgress, recordQuizScore } from './progress';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function createAccount(overrides: Partial<Account>): Account {
  return {
    id: overrides.id ?? 'account-1',
    householdId: overrides.householdId ?? 'household-1',
    name: overrides.name ?? 'Account',
    type: overrides.type ?? 'CHECKING',
    currentBalance: overrides.currentBalance ?? { amount: 0 },
    currency: overrides.currency ?? { code: 'USD', decimalPlaces: 2 },
    isArchived: overrides.isArchived ?? false,
    sortOrder: overrides.sortOrder ?? 0,
    icon: overrides.icon ?? null,
    color: overrides.color ?? null,
    ...syncMetadata,
  };
}

function createGoal(overrides: Partial<Goal>): Goal {
  return {
    id: overrides.id ?? 'goal-1',
    householdId: overrides.householdId ?? 'household-1',
    name: overrides.name ?? 'General goal',
    description: overrides.description ?? null,
    targetAmount: overrides.targetAmount ?? { amount: 0 },
    currentAmount: overrides.currentAmount ?? { amount: 0 },
    currency: overrides.currency ?? { code: 'USD', decimalPlaces: 2 },
    targetDate: overrides.targetDate ?? null,
    status: overrides.status ?? 'ACTIVE',
    icon: overrides.icon ?? null,
    color: overrides.color ?? null,
    accountId: overrides.accountId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    ...syncMetadata,
  };
}

function createTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'transaction-1',
    householdId: overrides.householdId ?? 'household-1',
    accountId: overrides.accountId ?? 'account-1',
    categoryId: overrides.categoryId ?? null,
    type: overrides.type ?? 'EXPENSE',
    status: overrides.status ?? 'CLEARED',
    amount: overrides.amount ?? { amount: 5000 },
    currency: overrides.currency ?? { code: 'USD', decimalPlaces: 2 },
    payee: overrides.payee ?? 'Merchant',
    note: overrides.note ?? null,
    date: overrides.date ?? '2025-01-01',
    transferAccountId: overrides.transferAccountId ?? null,
    transferTransactionId: overrides.transferTransactionId ?? null,
    isRecurring: overrides.isRecurring ?? false,
    recurringRuleId: overrides.recurringRuleId ?? null,
    tags: overrides.tags ?? [],
    merchantAddress: overrides.merchantAddress ?? null,
    merchantCity: overrides.merchantCity ?? null,
    merchantState: overrides.merchantState ?? null,
    merchantZip: overrides.merchantZip ?? null,
    merchantCountry: overrides.merchantCountry ?? null,
    externalReferenceId: overrides.externalReferenceId ?? null,
    statementDescription: overrides.statementDescription ?? null,
    customFields: overrides.customFields ?? null,
    extraNotes: overrides.extraNotes ?? null,
    counterpartyName: overrides.counterpartyName ?? null,
    counterpartyAccountId: overrides.counterpartyAccountId ?? null,
    ...syncMetadata,
  };
}

const emptyDashboard: DashboardData = {
  netWorth: 0,
  spentThisMonth: 0,
  incomeThisMonth: 0,
  monthlyBudget: 0,
  budgetSpent: 0,
  recentTransactions: [],
  accountSummary: [],
};

describe('learning adaptive recommendations', () => {
  it('prioritizes budgeting and saving when there is little setup data', () => {
    const profile = buildLearningActivityProfile({
      dashboardData: emptyDashboard,
      accounts: [],
      goals: [],
      transactions: [],
    });

    const recommendations = suggestNextLessons({
      modules: LEARNING_MODULES,
      progress: createEmptyLearningProgress(),
      activityProfile: profile,
      limit: 2,
    });

    expect(recommendations[0]?.moduleId).toBe('budgeting-basics');
    expect(recommendations[1]?.moduleId).toBe('saving-emergency-funds');
  });

  it('surfaces knowledge-gap reviews ahead of new content', () => {
    const profile = buildLearningActivityProfile({
      dashboardData: {
        ...emptyDashboard,
        monthlyBudget: 200000,
        budgetSpent: 195000,
        incomeThisMonth: 400000,
        spentThisMonth: 220000,
      },
      accounts: [createAccount({ type: 'CHECKING' })],
      goals: [],
      transactions: [createTransaction({})],
    });

    const progress = recordQuizScore(createEmptyLearningProgress(), 'budget-foundations', 45);
    const recommendations = suggestNextLessons({
      modules: LEARNING_MODULES,
      progress,
      activityProfile: profile,
      limit: 1,
    });

    expect(recommendations[0]).toMatchObject({
      lessonId: 'budget-foundations',
      signal: 'knowledge-gap',
    });
  });

  it('raises debt and investing topics when accounts show those needs', () => {
    const profile = buildLearningActivityProfile({
      dashboardData: {
        ...emptyDashboard,
        monthlyBudget: 300000,
        budgetSpent: 180000,
        incomeThisMonth: 500000,
        spentThisMonth: 240000,
      },
      accounts: [
        createAccount({ id: 'credit-1', type: 'CREDIT_CARD' }),
        createAccount({ id: 'invest-1', type: 'INVESTMENT', currentBalance: { amount: 150000 } }),
        createAccount({ id: 'save-1', type: 'SAVINGS', currentBalance: { amount: 50000 } }),
      ],
      goals: [createGoal({ name: 'Vacation' })],
      transactions: [createTransaction({}), createTransaction({ id: 'transaction-2' })],
    });

    const recommendations = suggestNextLessons({
      modules: LEARNING_MODULES,
      progress: createEmptyLearningProgress(),
      activityProfile: profile,
      limit: 3,
    });

    expect(recommendations.map((item) => item.moduleId)).toContain('debt-management');
    expect(recommendations.map((item) => item.moduleId)).toContain('investing-fundamentals');
  });
});
