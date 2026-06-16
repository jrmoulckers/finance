// SPDX-License-Identifier: BUSL-1.1

/** Pure spending-digest generation for notification summaries. */

import { formatCentsForAlert, isInQuietHours } from './alert-engine';
import type { AppNotification, NotificationPreferences } from './types';

export type SpendingDigestCadence = 'weekly' | 'monthly';

export interface DigestBudgetSummary {
  readonly budgetName: string;
  readonly spentCents: number;
  readonly budgetAmountCents: number;
  readonly percentUsed: number;
  readonly paceLabel?: 'under' | 'on_track' | 'over';
}

export interface DigestCategoryChange {
  readonly categoryName: string;
  readonly currentCents: number;
  readonly previousCents: number;
}

export interface DigestUpcomingBill {
  readonly billName: string;
  readonly dueDate: string;
  readonly amountCents?: number | null;
}

export interface DigestGoalProgress {
  readonly goalName: string;
  readonly percentComplete: number;
  readonly remainingCents: number;
}

export interface SpendingDigestInput {
  readonly cadence: SpendingDigestCadence;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly createdAt?: string;
  readonly budgets?: readonly DigestBudgetSummary[];
  readonly categoryChanges?: readonly DigestCategoryChange[];
  readonly upcomingBills?: readonly DigestUpcomingBill[];
  readonly goals?: readonly DigestGoalProgress[];
  readonly notifications?: readonly AppNotification[];
}

const DIGEST_SCAN_MINUTES = 15;
const MAX_DIGEST_SCAN_STEPS = 96;

function cadenceLabel(cadence: SpendingDigestCadence): string {
  return cadence === 'weekly' ? 'Weekly' : 'Monthly';
}

function strongestBudgetSummary(budgets: readonly DigestBudgetSummary[]): string | null {
  if (budgets.length === 0) return null;
  const sorted = [...budgets].sort((left, right) => right.percentUsed - left.percentUsed);
  const budget = sorted[0];
  if (budget === undefined) return null;
  const pace = budget.paceLabel === 'over' ? 'ahead of pace' : budget.paceLabel === 'under' ? 'under pace' : 'on track';
  return `${budget.budgetName} is ${pace} at ${budget.percentUsed}% (${formatCentsForAlert(
    budget.spentCents,
  )} of ${formatCentsForAlert(budget.budgetAmountCents)}).`;
}

function largestCategoryChange(changes: readonly DigestCategoryChange[]): string | null {
  if (changes.length === 0) return null;
  const sorted = [...changes].sort(
    (left, right) => Math.abs(right.currentCents - right.previousCents) - Math.abs(left.currentCents - left.previousCents),
  );
  const change = sorted[0];
  if (change === undefined) return null;
  const delta = change.currentCents - change.previousCents;
  const direction = delta >= 0 ? 'up' : 'down';
  return `${change.categoryName} is ${direction} ${formatCentsForAlert(Math.abs(delta))} versus the comparison period.`;
}

function upcomingBillSummary(bills: readonly DigestUpcomingBill[]): string | null {
  if (bills.length === 0) return null;
  const next = [...bills].sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  if (next === undefined) return null;
  const amount = next.amountCents === null || next.amountCents === undefined ? 'amount not available' : formatCentsForAlert(next.amountCents);
  return `Next bill: ${next.billName} on ${next.dueDate} (${amount}).`;
}

function goalSummary(goals: readonly DigestGoalProgress[]): string | null {
  if (goals.length === 0) return null;
  const closest = [...goals].sort((left, right) => right.percentComplete - left.percentComplete)[0];
  if (closest === undefined) return null;
  return `${closest.goalName} is ${closest.percentComplete}% complete with ${formatCentsForAlert(
    closest.remainingCents,
  )} remaining.`;
}

function criticalAlertSummary(notifications: readonly AppNotification[]): string | null {
  const criticalUnread = notifications.filter(
    (notification) => notification.status !== 'dismissed' && notification.severity === 'critical',
  );
  if (criticalUnread.length === 0) return null;
  return `${criticalUnread.length} critical alert${criticalUnread.length === 1 ? '' : 's'} still need attention.`;
}

export function buildSpendingDigestNotification(input: SpendingDigestInput): AppNotification {
  const budgets = input.budgets ?? [];
  const categoryChanges = input.categoryChanges ?? [];
  const upcomingBills = input.upcomingBills ?? [];
  const goals = input.goals ?? [];
  const notifications = input.notifications ?? [];

  const sections = [
    strongestBudgetSummary(budgets),
    largestCategoryChange(categoryChanges),
    upcomingBillSummary(upcomingBills),
    goalSummary(goals),
    criticalAlertSummary(notifications),
  ].filter((section): section is string => section !== null);

  const quietMessage = sections.length === 0
    ? 'Low-activity period: no budget, bill, goal, or critical-alert changes need attention.'
    : sections.join(' ');

  return {
    id: `spending-digest-${input.cadence}-${input.periodStart}-${input.periodEnd}`,
    type: 'spending_digest',
    severity: notifications.some((notification) => notification.status !== 'dismissed' && notification.severity === 'critical')
      ? 'warning'
      : 'info',
    title: `${cadenceLabel(input.cadence)} spending digest`,
    message: quietMessage,
    createdAt: input.createdAt ?? new Date(`${input.periodEnd}T12:00:00Z`).toISOString(),
    status: 'unread',
    actionLabel: 'View digest',
    deduplicationKey: `spending-digest-${input.cadence}-${input.periodStart}-${input.periodEnd}`,
  };
}

export function scheduleDigestDelivery(
  requestedDelivery: Date,
  preferences: NotificationPreferences,
): Date {
  let candidate = new Date(requestedDelivery.getTime());
  for (let step = 0; step < MAX_DIGEST_SCAN_STEPS; step += 1) {
    if (!isInQuietHours({ ...preferences, doNotDisturb: false }, candidate)) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + DIGEST_SCAN_MINUTES * 60_000);
  }
  return candidate;
}
