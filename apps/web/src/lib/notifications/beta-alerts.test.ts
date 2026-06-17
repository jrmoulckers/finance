// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { BillReminderConfig } from './types';
import {
  calculateSavingsStreak,
  evaluateBalanceWarnings,
  evaluateBillDueReminders,
  evaluateGoalNudges,
  evaluateGoalStreakCelebrations,
  evaluateLargeTransactionConfirmations,
} from './beta-alerts';

// ---------------------------------------------------------------------------
// Bill-due reminders (#2292)
// ---------------------------------------------------------------------------

describe('evaluateBillDueReminders', () => {
  const config: BillReminderConfig = {
    billId: 'bill-1',
    enabled: true,
    leadDays: [7, 3, 0],
    criticalDayOf: true,
  };

  it('emits default 7/3/day-of reminders with bill context and cycle dedupe', () => {
    const alerts = evaluateBillDueReminders(
      [
        {
          billId: 'bill-1',
          billName: 'Electric bill',
          amountCents: 12_345,
          dueDate: '2025-04-08',
          accountName: 'Checking',
          isAutoPay: false,
        },
      ],
      [config],
      new Set(),
      { today: '2025-04-01' },
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('bill_due');
    expect(alerts[0].severity).toBe('info');
    expect(alerts[0].message).toContain('Electric bill');
    expect(alerts[0].message).toContain('$123.45');
    expect(alerts[0].message).toContain('Checking');
    expect(alerts[0].message).toContain('manual payment');
    expect(alerts[0].deduplicationKey).toBe('bill-bill-1-2025-04-08-7');
  });

  it('marks day-of reminders critical only when critical bill alerts are enabled', () => {
    const [alert] = evaluateBillDueReminders(
      [
        {
          billId: 'bill-1',
          billName: 'Rent',
          amountCents: 150_000,
          dueDate: '2025-04-01',
          accountName: 'Checking',
          isAutoPay: true,
        },
      ],
      [config],
      new Set(),
      { today: '2025-04-01', criticalBillAlerts: true },
    );

    expect(alert?.severity).toBe('critical');
    expect(alert?.message).toContain('autopay scheduled');
  });

  it('uses plain fallback copy when amount or due date confidence is missing', () => {
    const [alert] = evaluateBillDueReminders(
      [
        {
          billId: 'bill-2',
          billName: 'Water',
          amountCents: null,
          dueDate: null,
          accountName: null,
          isAutoPay: false,
        },
      ],
      [],
      new Set(),
      { today: '2025-04-01' },
    );

    expect(alert?.message).toContain('amount not available');
    expect(alert?.message).toContain('account not selected');
    expect(alert?.actionLabel).toBe('Open bill calendar');
  });
});

// ---------------------------------------------------------------------------
// Low-balance and overdraft warnings (#2295)
// ---------------------------------------------------------------------------

describe('evaluateBalanceWarnings', () => {
  it('emits warning-level low-balance alerts with next best action', () => {
    const [alert] = evaluateBalanceWarnings([
      {
        accountId: 'acct-1',
        accountName: 'Checking',
        currentBalanceCents: 7_500,
        thresholdCents: 10_000,
        nextBestAction: 'Transfer from savings.',
      },
    ]);

    expect(alert?.type).toBe('balance_low');
    expect(alert?.severity).toBe('warning');
    expect(alert?.message).toContain('$75.00');
    expect(alert?.message).toContain('$100.00');
    expect(alert?.message).toContain('Transfer from savings');
  });

  it('escalates projected overdrafts to critical and dedupes by material projection bucket', () => {
    const [alert] = evaluateBalanceWarnings([
      {
        accountId: 'acct-1',
        accountName: 'Checking',
        currentBalanceCents: 7_500,
        thresholdCents: 10_000,
        projectedBalanceCents: -2_600,
        projectionDate: '2025-04-03',
        projectedOverdraftEnabled: true,
      },
    ]);

    expect(alert?.type).toBe('balance_overdraft');
    expect(alert?.severity).toBe('critical');
    expect(alert?.actionLabel).toBe('Review cash flow');
    expect(alert?.deduplicationKey).toBe('balance-acct-1-overdraft-projected-2025-04-03--1');

    const duplicateAlerts = evaluateBalanceWarnings(
      [
        {
          accountId: 'acct-1',
          accountName: 'Checking',
          currentBalanceCents: 7_500,
          thresholdCents: 10_000,
          projectedBalanceCents: -2_700,
          projectionDate: '2025-04-03',
          projectedOverdraftEnabled: true,
        },
      ],
      new Set(['balance-acct-1-overdraft-projected-2025-04-03--1']),
    );

    expect(duplicateAlerts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Goal nudges and streaks (#2309)
// ---------------------------------------------------------------------------

describe('goal nudges and streak celebrations', () => {
  it('nudges only when cash flow says a contribution is safe', () => {
    const [alert] = evaluateGoalNudges(
      [
        {
          goalId: 'goal-1',
          goalName: 'Emergency fund',
          targetAmountCents: 100_000,
          currentAmountCents: 40_000,
          suggestedContributionCents: 10_000,
          safeToContributeCents: 7_500,
        },
      ],
      new Set(),
      { today: '2025-04-15' },
    );

    expect(alert?.type).toBe('goal_nudge');
    expect(alert?.message).toContain('$75.00');
    expect(alert?.message).toContain('No pressure');
  });

  it('does not nudge paused goals or unsafe contributions', () => {
    const alerts = evaluateGoalNudges(
      [
        {
          goalId: 'goal-1',
          goalName: 'Vacation',
          targetAmountCents: 100_000,
          currentAmountCents: 40_000,
          status: 'PAUSED',
          suggestedContributionCents: 10_000,
          safeToContributeCents: 10_000,
        },
        {
          goalId: 'goal-2',
          goalName: 'Car',
          targetAmountCents: 100_000,
          currentAmountCents: 40_000,
          suggestedContributionCents: 10_000,
          safeToContributeCents: 0,
        },
      ],
      new Set(),
      { today: '2025-04-15' },
    );

    expect(alerts).toEqual([]);
  });

  it('calculates weekly savings streaks and emits success celebrations', () => {
    const contributions = [
      { goalId: 'goal-1', date: '2025-04-01', amountCents: 2_500 },
      { goalId: 'goal-1', date: '2025-04-08', amountCents: 2_500 },
      { goalId: 'goal-1', date: '2025-04-15', amountCents: 2_500 },
      { goalId: 'goal-1', date: '2025-04-22', amountCents: 2_500 },
    ];

    expect(calculateSavingsStreak(contributions, '2025-04-23')).toBe(4);

    const [alert] = evaluateGoalStreakCelebrations(
      [
        {
          goalId: 'goal-1',
          goalName: 'Emergency fund',
          targetAmountCents: 100_000,
          currentAmountCents: 50_000,
        },
      ],
      contributions,
      new Set(),
      { today: '2025-04-23' },
    );

    expect(alert?.type).toBe('goal_streak');
    expect(alert?.severity).toBe('success');
    expect(alert?.message).toContain('4 weeks in a row');
  });
});

// ---------------------------------------------------------------------------
// Large-transaction confirmations (#2314)
// ---------------------------------------------------------------------------

describe('evaluateLargeTransactionConfirmations', () => {
  const baseTransaction = {
    transactionId: 'txn-1',
    accountId: 'acct-1',
    accountName: 'Checking',
    amountCents: 75_000,
    payee: 'Appliance Store',
    type: 'EXPENSE' as const,
    timestamp: '2025-04-01T10:00:00Z',
    status: 'CLEARED' as const,
  };

  it('prompts for a single transaction above the global threshold', () => {
    const [alert] = evaluateLargeTransactionConfirmations([baseTransaction], {
      enabled: true,
      globalThresholdCents: 50_000,
    });

    expect(alert?.type).toBe('transaction_confirmation');
    expect(alert?.message).toContain('$750.00');
    expect(alert?.message).toContain('Appliance Store');
    expect(alert?.message).toContain('Checking');
    expect(alert?.message).toContain('Confirm it, flag an issue, edit category, or dismiss');
  });

  it('honors account thresholds, skips void transactions, and suppresses duplicate confirmations', () => {
    const alerts = evaluateLargeTransactionConfirmations(
      [
        baseTransaction,
        { ...baseTransaction, transactionId: 'txn-2', amountCents: 55_000, status: 'VOID' },
      ],
      {
        enabled: true,
        globalThresholdCents: 100_000,
        accountThresholds: [{ accountId: 'acct-1', thresholdCents: 50_000 }],
      },
      new Set(['large-transaction-txn-1-75000-2025-04-01T10:00:00Z']),
    );

    expect(alerts).toEqual([]);
  });

  it('batches multiple large confirmations to avoid overload', () => {
    const [alert] = evaluateLargeTransactionConfirmations(
      [baseTransaction, { ...baseTransaction, transactionId: 'txn-2', payee: 'Furniture', amountCents: 80_000 }],
      { enabled: true, globalThresholdCents: 50_000 },
    );

    expect(alert?.type).toBe('batch_confirmation');
    expect(alert?.title).toContain('2 large transactions');
    expect(alert?.message).toContain('$1,550.00');
  });
});
