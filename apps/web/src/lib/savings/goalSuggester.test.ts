// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Account, Category, Goal, Transaction } from '../../kmp/bridge';
import { buildSavingsAnalysisSnapshot, suggestSavingsGoals } from './goalSuggester';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const householdId = 'household-1';
const currency = { code: 'USD', decimalPlaces: 2 };
const transactionMetadata = {
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
};

const accounts: Account[] = [
  {
    id: 'checking',
    householdId,
    name: 'Checking',
    type: 'CHECKING',
    currency,
    currentBalance: { amount: 100_000 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
  },
  {
    id: 'savings',
    householdId,
    name: 'Savings',
    type: 'SAVINGS',
    currency,
    currentBalance: { amount: 50_000 },
    isArchived: false,
    sortOrder: 2,
    icon: 'shield',
    color: '#059669',
    ...syncMetadata,
  },
  {
    id: 'brokerage',
    householdId,
    name: 'Brokerage',
    type: 'INVESTMENT',
    currency,
    currentBalance: { amount: 250_000 },
    isArchived: false,
    sortOrder: 3,
    icon: 'trending-up',
    color: '#059669',
    ...syncMetadata,
  },
  {
    id: 'credit-card',
    householdId,
    name: 'Credit Card',
    type: 'CREDIT_CARD',
    currency,
    currentBalance: { amount: -200_000 },
    isArchived: false,
    sortOrder: 4,
    icon: 'credit-card',
    color: '#DC2626',
    ...syncMetadata,
  },
];

const categories: Category[] = [
  {
    id: 'income',
    householdId,
    name: 'Income',
    icon: 'wallet',
    color: '#059669',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 1,
    ...syncMetadata,
  },
  {
    id: 'housing',
    householdId,
    name: 'Housing',
    icon: 'home',
    color: '#7C3AED',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    ...syncMetadata,
  },
  {
    id: 'groceries',
    householdId,
    name: 'Groceries',
    icon: 'cart',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 3,
    ...syncMetadata,
  },
  {
    id: 'dining',
    householdId,
    name: 'Dining Out',
    icon: 'utensils',
    color: '#F59E0B',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 4,
    ...syncMetadata,
  },
  {
    id: 'entertainment',
    householdId,
    name: 'Entertainment',
    icon: 'film',
    color: '#DB2777',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 5,
    ...syncMetadata,
  },
];

const transactions: Transaction[] = [
  {
    id: 'income-apr',
    householdId,
    accountId: 'checking',
    categoryId: 'income',
    type: 'INCOME',
    status: 'CLEARED',
    amount: { amount: 600_000 },
    currency,
    payee: 'Payroll',
    note: null,
    date: '2025-04-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    ...transactionMetadata,
    ...syncMetadata,
  },
  {
    id: 'income-may',
    householdId,
    accountId: 'checking',
    categoryId: 'income',
    type: 'INCOME',
    status: 'CLEARED',
    amount: { amount: 600_000 },
    currency,
    payee: 'Payroll',
    note: null,
    date: '2025-05-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    ...transactionMetadata,
    ...syncMetadata,
  },
  {
    id: 'income-jun',
    householdId,
    accountId: 'checking',
    categoryId: 'income',
    type: 'INCOME',
    status: 'CLEARED',
    amount: { amount: 600_000 },
    currency,
    payee: 'Payroll',
    note: null,
    date: '2025-06-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    ...transactionMetadata,
    ...syncMetadata,
  },
  ...[
    ['2025-04-03', 'housing', 200_000],
    ['2025-05-03', 'housing', 200_000],
    ['2025-06-03', 'housing', 200_000],
    ['2025-04-08', 'groceries', 150_000],
    ['2025-05-08', 'groceries', 150_000],
    ['2025-06-08', 'groceries', 150_000],
    ['2025-04-12', 'dining', 120_000],
    ['2025-05-12', 'dining', 120_000],
    ['2025-06-12', 'dining', 120_000],
    ['2025-04-16', 'entertainment', 80_000],
    ['2025-05-16', 'entertainment', 80_000],
    ['2025-06-10', 'entertainment', 80_000],
  ].map(([date, categoryId, amount], index) => ({
    id: `expense-${index}`,
    householdId,
    accountId: 'checking',
    categoryId: categoryId as string,
    type: 'EXPENSE' as const,
    status: 'CLEARED' as const,
    amount: { amount: amount as number },
    currency,
    payee: 'Merchant',
    note: null,
    date: date as string,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    ...transactionMetadata,
    ...syncMetadata,
  })),
];

const goals: Goal[] = [
  {
    id: 'goal-vacation',
    householdId,
    name: 'Vacation',
    description: 'Beach trip',
    targetAmount: { amount: 200_000 },
    currentAmount: { amount: 50_000 },
    currency,
    targetDate: '2025-11-01',
    status: 'ACTIVE',
    icon: 'plane',
    color: '#2563EB',
    accountId: null,
    ...syncMetadata,
  },
];

describe('goalSuggester', () => {
  it('builds a local savings snapshot and suggests realistic goals', () => {
    const now = new Date('2025-06-15T00:00:00Z');
    const snapshot = buildSavingsAnalysisSnapshot(accounts, transactions, categories, goals, now);

    expect(snapshot.monthlyIncomeCents).toBe(600_000);
    expect(snapshot.monthlyExpensesCents).toBe(550_000);
    expect(snapshot.discretionaryCategories[0]?.categoryName).toBe('Dining Out');
    expect(snapshot.discretionaryRedirectCents).toBeGreaterThan(0);

    const suggestions = suggestSavingsGoals(snapshot, now);
    expect(suggestions.map((suggestion) => suggestion.type)).toEqual(
      expect.arrayContaining([
        'emergency-fund',
        'discretionary-savings',
        'big-purchase',
        'retirement',
        'debt-payoff',
      ]),
    );

    const emergencySuggestion = suggestions.find(
      (suggestion) => suggestion.type === 'emergency-fund',
    );
    expect(emergencySuggestion?.priority).toBe('high');
    expect(
      emergencySuggestion?.contributionPlan.recommendedMonthlyContributionCents,
    ).toBeGreaterThan(0);

    const purchaseSuggestion = suggestions.find((suggestion) => suggestion.type === 'big-purchase');
    expect(purchaseSuggestion?.linkedGoalId).toBe('goal-vacation');
  });
});
