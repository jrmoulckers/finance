// SPDX-License-Identifier: BUSL-1.1

/**
 * Beta notification evaluators for bill reminders, cash-flow warnings,
 * goal momentum, and large-transaction confirmations.
 *
 * These functions are pure and return notification objects for callers to
 * schedule through useNotifications.
 */

import type {
  AccountTransactionThreshold,
  AppNotification,
  BillReminderConfig,
  BillReminderLeadDays,
  NotificationSeverity,
  TransactionConfirmation,
} from './types';
import { formatCentsForAlert } from './alert-engine';

const MS_PER_DAY = 86_400_000;
const DEFAULT_BILL_LEADS: readonly BillReminderLeadDays[] = [7, 3, 0];
const DEFAULT_STREAK_MILESTONES = [2, 4, 8, 12] as const;

function notificationId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function utcDayMs(isoDate: string): number {
  return Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

function daysUntil(today: string, targetDate: string): number {
  return Math.round((utcDayMs(targetDate) - utcDayMs(today)) / MS_PER_DAY);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(utcDayMs(isoDate));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(isoDate: string): string {
  const date = new Date(utcDayMs(isoDate));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Bill-due reminders (#2292)
// ---------------------------------------------------------------------------

export interface BillReminderEvalInput {
  readonly billId: string;
  readonly billName: string;
  readonly amountCents?: number | null;
  readonly dueDate?: string | null;
  readonly accountName?: string | null;
  readonly isAutoPay: boolean;
  readonly status?: 'UPCOMING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  readonly dueDateConfidence?: 'confirmed' | 'estimated' | 'unknown';
}

export interface BillReminderEvalOptions {
  readonly today: string;
  readonly criticalBillAlerts?: boolean;
  readonly defaultLeadDays?: readonly BillReminderLeadDays[];
}

export function evaluateBillDueReminders(
  bills: readonly BillReminderEvalInput[],
  configs: readonly BillReminderConfig[] = [],
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
  options: BillReminderEvalOptions,
): AppNotification[] {
  const notifications: AppNotification[] = [];
  const configByBill = new Map(configs.map((config) => [config.billId, config]));

  for (const bill of bills) {
    if (bill.status === 'PAID' || bill.status === 'CANCELLED') {
      continue;
    }

    const config = configByBill.get(bill.billId);
    const enabled = config?.enabled ?? true;
    if (!enabled) {
      continue;
    }

    const leadDays = config?.leadDays ?? options.defaultLeadDays ?? DEFAULT_BILL_LEADS;
    if (bill.dueDate === null || bill.dueDate === undefined) {
      if (!leadDays.includes(0)) continue;
      const deduplicationKey = `bill-${bill.billId}-unknown-due`;
      if (alreadyFiredKeys.has(deduplicationKey)) continue;
      notifications.push({
        id: notificationId('bill-due'),
        type: 'bill_due',
        severity: 'info',
        title: 'Bill reminder needs a date',
        message: `${bill.billName} has no confirmed due date. Amount ${formatOptionalAmount(
          bill.amountCents,
        )}; ${bill.accountName ?? 'account not selected'}; ${autopayLabel(bill)}.`,
        createdAt: new Date(`${options.today}T12:00:00Z`).toISOString(),
        status: 'unread',
        entityId: bill.billId,
        entityType: 'bill',
        actionLabel: 'Open bill calendar',
        deduplicationKey,
      });
      continue;
    }

    const lead = daysUntil(options.today, bill.dueDate);
    if (!leadDays.includes(lead as BillReminderLeadDays)) {
      continue;
    }

    const deduplicationKey = `bill-${bill.billId}-${bill.dueDate}-${lead}`;
    if (alreadyFiredKeys.has(deduplicationKey)) {
      continue;
    }

    const isDayOf = lead === 0;
    const criticalAllowed = config?.criticalDayOf ?? options.criticalBillAlerts ?? false;
    notifications.push({
      id: notificationId('bill-due'),
      type: 'bill_due',
      severity: isDayOf && criticalAllowed ? 'critical' : lead === 7 ? 'info' : 'warning',
      title: isDayOf ? 'Bill due today' : `Bill due in ${lead} days`,
      message: billReminderMessage(bill, lead),
      createdAt: new Date(`${options.today}T12:00:00Z`).toISOString(),
      status: 'unread',
      entityId: bill.billId,
      entityType: 'bill',
      actionLabel: 'View bill',
      deduplicationKey,
    });
  }

  return notifications;
}

function formatOptionalAmount(amountCents: number | null | undefined): string {
  return amountCents === null || amountCents === undefined
    ? 'amount not available'
    : formatCentsForAlert(amountCents);
}

function autopayLabel(bill: BillReminderEvalInput): string {
  return bill.isAutoPay ? 'autopay scheduled' : 'manual payment';
}

function billReminderMessage(bill: BillReminderEvalInput, lead: number): string {
  const dateConfidence = bill.dueDateConfidence === 'estimated' ? 'estimated due date' : 'due date';
  const timing = lead === 0 ? 'today' : `in ${lead} days`;
  return `${bill.billName} for ${formatOptionalAmount(bill.amountCents)} is due ${timing} (${dateConfidence}: ${
    bill.dueDate ?? 'not confirmed'
  }). Account: ${bill.accountName ?? 'account not selected'}. ${autopayLabel(bill)}.`;
}

// ---------------------------------------------------------------------------
// Low-balance and overdraft warnings (#2295)
// ---------------------------------------------------------------------------

export interface BalanceWarningInput {
  readonly accountId: string;
  readonly accountName: string;
  readonly currentBalanceCents: number;
  readonly thresholdCents: number;
  readonly projectedBalanceCents?: number;
  readonly projectionDate?: string;
  readonly projectedOverdraftEnabled?: boolean;
  readonly nextBestAction?: string;
}

export interface BalanceWarningOptions {
  readonly materialProjectionChangeCents?: number;
}

export function evaluateBalanceWarnings(
  accounts: readonly BalanceWarningInput[],
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
  options: BalanceWarningOptions = {},
): AppNotification[] {
  const materialProjectionChangeCents = options.materialProjectionChangeCents ?? 2_500;

  return accounts.flatMap((account) => {
    const projectedOverdraft =
      account.projectedOverdraftEnabled === true &&
      account.projectedBalanceCents !== undefined &&
      account.projectedBalanceCents < 0;
    const currentOverdraft = account.currentBalanceCents < 0;
    const belowThreshold = account.currentBalanceCents < account.thresholdCents;

    if (!currentOverdraft && !projectedOverdraft && !belowThreshold) {
      return [];
    }

    const severity: NotificationSeverity =
      currentOverdraft || projectedOverdraft ? 'critical' : 'warning';
    const type = severity === 'critical' ? 'balance_overdraft' : 'balance_low';
    const projectionBucket =
      account.projectedBalanceCents === undefined
        ? 'none'
        : Math.trunc(account.projectedBalanceCents / materialProjectionChangeCents);
    const deduplicationKey = currentOverdraft
      ? `balance-${account.accountId}-overdraft-current`
      : projectedOverdraft
        ? `balance-${account.accountId}-overdraft-projected-${account.projectionDate ?? 'next'}-${projectionBucket}`
        : `balance-${account.accountId}-low`;

    if (alreadyFiredKeys.has(deduplicationKey)) {
      return [];
    }

    const current = formatCentsForAlert(account.currentBalanceCents);
    const threshold = formatCentsForAlert(account.thresholdCents);
    const projected =
      account.projectedBalanceCents === undefined
        ? null
        : formatCentsForAlert(account.projectedBalanceCents);
    const action =
      account.nextBestAction ??
      (severity === 'critical'
        ? 'Move money or review upcoming bills.'
        : 'Consider a transfer or spending pause.');

    const projectionCopy =
      projected === null
        ? ''
        : ` Projected balance${account.projectionDate ? ` on ${account.projectionDate}` : ''}: ${projected}.`;

    return [
      {
        id: notificationId('balance'),
        type,
        severity,
        title: severity === 'critical' ? 'Overdraft risk' : 'Low balance warning',
        message: `${account.accountName} balance is ${current}; threshold ${threshold}.${projectionCopy} Next step: ${action}`,
        createdAt: new Date().toISOString(),
        status: 'unread',
        entityId: account.accountId,
        entityType: 'account',
        actionLabel: projectedOverdraft ? 'Review cash flow' : 'View account',
        deduplicationKey,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Goal nudges and streak celebrations (#2309)
// ---------------------------------------------------------------------------

export interface GoalMomentumInput {
  readonly goalId: string;
  readonly goalName: string;
  readonly targetAmountCents: number;
  readonly currentAmountCents: number;
  readonly status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  readonly suggestedContributionCents?: number;
  readonly safeToContributeCents?: number;
}

export interface GoalContributionRecord {
  readonly goalId: string;
  readonly date: string;
  readonly amountCents: number;
}

export interface GoalMomentumOptions {
  readonly today: string;
  readonly nudgesEnabled?: boolean;
  readonly streakCelebrationsEnabled?: boolean;
  readonly streakMilestones?: readonly number[];
}

export function evaluateGoalNudges(
  goals: readonly GoalMomentumInput[],
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
  options: GoalMomentumOptions,
): AppNotification[] {
  if (options.nudgesEnabled === false) {
    return [];
  }

  const monthKey = options.today.slice(0, 7);
  return goals.flatMap((goal) => {
    if (goal.status === 'PAUSED' || goal.status === 'COMPLETED' || goal.status === 'CANCELLED') {
      return [];
    }
    if (goal.targetAmountCents <= 0 || goal.currentAmountCents >= goal.targetAmountCents) {
      return [];
    }

    const safeAmount = goal.safeToContributeCents ?? 0;
    const suggested = Math.min(goal.suggestedContributionCents ?? 0, safeAmount);
    if (suggested <= 0) {
      return [];
    }

    const deduplicationKey = `goal-${goal.goalId}-nudge-${monthKey}`;
    if (alreadyFiredKeys.has(deduplicationKey)) {
      return [];
    }

    return [
      {
        id: notificationId('goal-nudge'),
        type: 'goal_nudge',
        severity: 'info',
        title: 'Small goal boost available',
        message: `${goal.goalName} could use a ${formatCentsForAlert(
          suggested,
        )} contribution based on current cash flow. No pressure if now is not the right time.`,
        createdAt: new Date(`${options.today}T12:00:00Z`).toISOString(),
        status: 'unread',
        entityId: goal.goalId,
        entityType: 'goal',
        actionLabel: 'View goal',
        deduplicationKey,
      },
    ];
  });
}

export function calculateSavingsStreak(
  contributions: readonly GoalContributionRecord[],
  today: string,
): number {
  const weeksWithContribution = new Set(
    contributions.filter((item) => item.amountCents > 0).map((item) => startOfWeek(item.date)),
  );
  if (weeksWithContribution.size === 0) return 0;

  let cursor = startOfWeek(today);
  if (!weeksWithContribution.has(cursor)) {
    const previous = addDays(cursor, -7);
    if (!weeksWithContribution.has(previous)) return 0;
    cursor = previous;
  }

  let streak = 0;
  while (weeksWithContribution.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export function evaluateGoalStreakCelebrations(
  goals: readonly GoalMomentumInput[],
  contributions: readonly GoalContributionRecord[],
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
  options: GoalMomentumOptions,
): AppNotification[] {
  if (options.streakCelebrationsEnabled === false) {
    return [];
  }

  const milestones = options.streakMilestones ?? DEFAULT_STREAK_MILESTONES;
  return goals.flatMap((goal) => {
    const streak = calculateSavingsStreak(
      contributions.filter((contribution) => contribution.goalId === goal.goalId),
      options.today,
    );
    if (!milestones.includes(streak)) {
      return [];
    }

    const deduplicationKey = `goal-${goal.goalId}-streak-${streak}`;
    if (alreadyFiredKeys.has(deduplicationKey)) {
      return [];
    }

    return [
      {
        id: notificationId('goal-streak'),
        type: 'goal_streak',
        severity: 'success',
        title: `${streak}-week savings streak`,
        message: `${goal.goalName} has received contributions for ${streak} weeks in a row. Nice consistency!`,
        createdAt: new Date(`${options.today}T12:00:00Z`).toISOString(),
        status: 'unread',
        entityId: goal.goalId,
        entityType: 'goal',
        actionLabel: 'View goal',
        deduplicationKey,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Large-transaction confirmations (#2314)
// ---------------------------------------------------------------------------

export interface LargeTransactionConfirmationInput extends TransactionConfirmation {
  readonly accountId: string;
  readonly status?: 'PENDING' | 'CLEARED' | 'RECONCILED' | 'VOID';
}

export interface LargeTransactionConfirmationConfig {
  readonly enabled: boolean;
  readonly globalThresholdCents: number;
  readonly accountThresholds?: readonly AccountTransactionThreshold[];
}

export function evaluateLargeTransactionConfirmations(
  transactions: readonly LargeTransactionConfirmationInput[],
  config: LargeTransactionConfirmationConfig,
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): AppNotification[] {
  if (!config.enabled) {
    return [];
  }

  const candidates = transactions.filter((transaction) => {
    if (transaction.status === 'VOID') return false;
    const threshold = thresholdForAccount(transaction.accountId, config);
    return Math.abs(transaction.amountCents) >= threshold;
  });

  const unseen = candidates.filter(
    (transaction) => !alreadyFiredKeys.has(largeTransactionDeduplicationKey(transaction)),
  );
  if (unseen.length === 0) {
    return [];
  }

  if (unseen.length > 1) {
    const deduplicationKey = `large-batch-${unseen
      .map((transaction) => `${transaction.transactionId}:${transaction.amountCents}`)
      .sort()
      .join('|')}`;
    if (alreadyFiredKeys.has(deduplicationKey)) return [];
    return [buildLargeTransactionBatchNotification(unseen, deduplicationKey)];
  }

  const [transaction] = unseen;
  return transaction === undefined ? [] : [buildLargeTransactionNotification(transaction)];
}

function thresholdForAccount(
  accountId: string,
  config: LargeTransactionConfirmationConfig,
): number {
  return (
    config.accountThresholds?.find((threshold) => threshold.accountId === accountId)
      ?.thresholdCents ?? config.globalThresholdCents
  );
}

function largeTransactionDeduplicationKey(transaction: LargeTransactionConfirmationInput): string {
  return `large-transaction-${transaction.transactionId}-${transaction.amountCents}-${transaction.timestamp}`;
}

export function buildLargeTransactionNotification(
  transaction: LargeTransactionConfirmationInput,
): AppNotification {
  const amount = formatCentsForAlert(Math.abs(transaction.amountCents));
  return {
    id: notificationId('large-transaction'),
    type: 'transaction_confirmation',
    severity: 'warning',
    title: 'Confirm large transaction',
    message: `${amount} ${transaction.type.toLowerCase()} at ${transaction.payee} on ${transaction.accountName} at ${transaction.timestamp}. Confirm it, flag an issue, edit category, or dismiss.`,
    createdAt: transaction.timestamp,
    status: 'unread',
    entityId: transaction.transactionId,
    entityType: 'transaction',
    actionLabel: 'Confirm transaction',
    deduplicationKey: largeTransactionDeduplicationKey(transaction),
  };
}

function buildLargeTransactionBatchNotification(
  transactions: readonly LargeTransactionConfirmationInput[],
  deduplicationKey: string,
): AppNotification {
  const totalCents = transactions.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amountCents),
    0,
  );
  const accounts = [...new Set(transactions.map((transaction) => transaction.accountName))];
  const latestTimestamp = transactions
    .map((transaction) => transaction.timestamp)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

  return {
    id: notificationId('large-transaction-batch'),
    type: 'batch_confirmation',
    severity: 'warning',
    title: `${transactions.length} large transactions to confirm`,
    message: `${formatCentsForAlert(totalCents)} across ${accounts.join(
      ', ',
    )}. Review the batch to confirm, flag issues, edit categories, or dismiss.`,
    createdAt: latestTimestamp ?? new Date().toISOString(),
    status: 'unread',
    actionLabel: 'Review transactions',
    deduplicationKey,
  };
}
