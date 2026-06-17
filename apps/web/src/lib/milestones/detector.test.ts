// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildMilestoneSnapshot, calculateSavingsStreakMonths, detectMilestones } from './detector';
import type { DebtBaselineState, MilestoneSnapshot } from './types';

function createSnapshot(overrides: Partial<MilestoneSnapshot> = {}): MilestoneSnapshot {
  return {
    netWorthCents: 0,
    totalDebtCents: 0,
    savingsStreakMonths: 0,
    goals: {},
    liabilities: {},
    ...overrides,
  };
}

function createDebtBaselines(overrides: Partial<DebtBaselineState> = {}): DebtBaselineState {
  return {
    totalDebtCents: 0,
    accountBaselines: {},
    ...overrides,
  };
}

describe('calculateSavingsStreakMonths', () => {
  it('counts consecutive positive months ending with the latest month', () => {
    const streak = calculateSavingsStreakMonths([
      {
        id: '1',
        householdId: 'household',
        accountId: 'checking',
        categoryId: null,
        type: 'INCOME',
        status: 'CLEARED',
        amount: { amount: 300_000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: null,
        note: null,
        date: '2025-01-15',
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
        createdAt: '2025-01-15T00:00:00Z',
        updatedAt: '2025-01-15T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
      {
        id: '2',
        householdId: 'household',
        accountId: 'checking',
        categoryId: null,
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: { amount: -100_000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: null,
        note: null,
        date: '2025-01-20',
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
        createdAt: '2025-01-20T00:00:00Z',
        updatedAt: '2025-01-20T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
      {
        id: '3',
        householdId: 'household',
        accountId: 'checking',
        categoryId: null,
        type: 'INCOME',
        status: 'CLEARED',
        amount: { amount: 300_000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: null,
        note: null,
        date: '2025-02-15',
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
        createdAt: '2025-02-15T00:00:00Z',
        updatedAt: '2025-02-15T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
      {
        id: '4',
        householdId: 'household',
        accountId: 'checking',
        categoryId: null,
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: { amount: -100_000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: null,
        note: null,
        date: '2025-02-18',
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
        createdAt: '2025-02-18T00:00:00Z',
        updatedAt: '2025-02-18T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
    ]);

    expect(streak).toBe(2);
  });
});

describe('buildMilestoneSnapshot', () => {
  it('builds net worth, goal, debt, and savings metrics', () => {
    const snapshot = buildMilestoneSnapshot({
      accounts: [
        {
          id: 'asset',
          householdId: 'household',
          name: 'Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 2_000_000 },
          isArchived: false,
          sortOrder: 1,
          icon: null,
          color: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
        {
          id: 'liability',
          householdId: 'household',
          name: 'Card',
          type: 'CREDIT_CARD',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: -250_000 },
          isArchived: false,
          sortOrder: 2,
          icon: null,
          color: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
      ],
      goals: [
        {
          id: 'goal-1',
          householdId: 'household',
          name: 'Emergency Fund',
          description: null,
          targetAmount: { amount: 1_000_000 },
          currentAmount: { amount: 500_000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: null,
          status: 'ACTIVE',
          icon: null,
          color: null,
          accountId: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
          deletedAt: null,
          syncVersion: 1,
          isSynced: true,
        },
      ],
      transactions: [],
    });

    expect(snapshot.netWorthCents).toBe(1_750_000);
    expect(snapshot.totalDebtCents).toBe(250_000);
    expect(snapshot.goals['goal-1']?.progressPercent).toBe(50);
    expect(snapshot.liabilities.liability?.balanceCents).toBe(250_000);
  });
});

describe('detectMilestones', () => {
  it('detects multiple milestone categories and skips shown IDs', () => {
    const milestones = detectMilestones({
      previous: createSnapshot({
        netWorthCents: 900_000,
        totalDebtCents: 400_000,
        savingsStreakMonths: 2,
        goals: {
          goal: {
            goalId: 'goal',
            goalName: 'Emergency Fund',
            currentAmountCents: 200_000,
            targetAmountCents: 1_000_000,
            progressPercent: 20,
          },
        },
        liabilities: {
          card: { accountId: 'card', accountName: 'Visa', balanceCents: 100_000 },
        },
      }),
      current: createSnapshot({
        netWorthCents: 2_600_000,
        totalDebtCents: 0,
        savingsStreakMonths: 3,
        goals: {
          goal: {
            goalId: 'goal',
            goalName: 'Emergency Fund',
            currentAmountCents: 800_000,
            targetAmountCents: 1_000_000,
            progressPercent: 80,
          },
        },
        liabilities: {
          card: { accountId: 'card', accountName: 'Visa', balanceCents: 0 },
        },
      }),
      shownMilestoneIds: new Set(['goal-goal-25']),
      debtBaselines: createDebtBaselines({
        totalDebtCents: 400_000,
        accountBaselines: { card: 100_000 },
      }),
      now: '2025-03-01T00:00:00Z',
    });

    expect(milestones.map((milestone) => milestone.id)).toEqual(
      expect.arrayContaining([
        'net-worth-1000000',
        'net-worth-2500000',
        'goal-goal-50',
        'goal-goal-75',
        'savings-streak-3',
        'debt-reduction-25',
        'debt-reduction-50',
        'debt-reduction-75',
        'debt-reduction-100',
        'debt-payoff-card',
      ]),
    );
    expect(milestones.find((milestone) => milestone.id === 'goal-goal-25')).toBeUndefined();
  });
});
