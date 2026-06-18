// SPDX-License-Identifier: BUSL-1.1

import { formatCentsForAlert } from './alert-engine';
import type { AppNotification } from './types';
import type {
  DigestBudgetSummary,
  DigestCategoryChange,
  DigestGoalProgress,
  DigestUpcomingBill,
  SpendingDigestInput,
} from './spending-digests';

export type SpendingDigestDetailSectionKind =
  | 'budget_pace'
  | 'category_delta'
  | 'upcoming_bill'
  | 'goal_progress'
  | 'critical_alert'
  | 'low_activity';

export interface SpendingDigestDetailSection {
  readonly kind: SpendingDigestDetailSectionKind;
  readonly title: string;
  readonly body: string;
  readonly severity: 'positive' | 'neutral' | 'attention';
  readonly entityId?: string;
}

export interface SpendingDigestDetailView {
  readonly digestId: string;
  readonly title: string;
  readonly periodLabel: string;
  readonly sections: readonly SpendingDigestDetailSection[];
}

export function buildSpendingDigestDetailView(
  digest: AppNotification,
  input: SpendingDigestInput,
): SpendingDigestDetailView {
  const sections = [
    ...budgetSections(input.budgets ?? []),
    ...categorySections(input.categoryChanges ?? []),
    ...billSections(input.upcomingBills ?? []),
    ...goalSections(input.goals ?? []),
    ...criticalAlertSections(input.notifications ?? []),
  ];

  return {
    digestId: digest.id,
    title: digest.title,
    periodLabel: `${input.periodStart} to ${input.periodEnd}`,
    sections: sections.length > 0 ? sections : [lowActivitySection(input.cadence)],
  };
}

function budgetSections(budgets: readonly DigestBudgetSummary[]): SpendingDigestDetailSection[] {
  return budgets.map((budget) => ({
    kind: 'budget_pace',
    title: `${budget.budgetName} budget pace`,
    body: `${formatCentsForAlert(budget.spentCents)} of ${formatCentsForAlert(budget.budgetAmountCents)} used (${budget.percentUsed}%).`,
    severity:
      budget.paceLabel === 'over' || budget.percentUsed >= 100
        ? 'attention'
        : budget.paceLabel === 'under'
          ? 'positive'
          : 'neutral',
  }));
}

function categorySections(changes: readonly DigestCategoryChange[]): SpendingDigestDetailSection[] {
  return changes.map((change) => {
    const delta = change.currentCents - change.previousCents;
    return {
      kind: 'category_delta',
      title: `${change.categoryName} changed`,
      body: `${delta >= 0 ? 'Up' : 'Down'} ${formatCentsForAlert(Math.abs(delta))} versus the comparison period.`,
      severity: delta > 0 ? 'attention' : delta < 0 ? 'positive' : 'neutral',
    };
  });
}

function billSections(bills: readonly DigestUpcomingBill[]): SpendingDigestDetailSection[] {
  return [...bills]
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .map((bill) => ({
      kind: 'upcoming_bill',
      title: `${bill.billName} due ${bill.dueDate}`,
      body:
        bill.amountCents === null || bill.amountCents === undefined
          ? 'Amount not available.'
          : `${formatCentsForAlert(bill.amountCents)} upcoming.`,
      severity: 'neutral',
    }));
}

function goalSections(goals: readonly DigestGoalProgress[]): SpendingDigestDetailSection[] {
  return goals.map((goal) => ({
    kind: 'goal_progress',
    title: `${goal.goalName} progress`,
    body: `${goal.percentComplete}% complete with ${formatCentsForAlert(goal.remainingCents)} remaining.`,
    severity: goal.percentComplete >= 80 ? 'positive' : 'neutral',
  }));
}

function criticalAlertSections(
  notifications: readonly AppNotification[],
): SpendingDigestDetailSection[] {
  return notifications
    .filter(
      (notification) => notification.severity === 'critical' && notification.status !== 'dismissed',
    )
    .map((notification) => ({
      kind: 'critical_alert',
      title: notification.title,
      body: notification.message,
      severity: 'attention',
      entityId: notification.entityId,
    }));
}

function lowActivitySection(cadence: SpendingDigestInput['cadence']): SpendingDigestDetailSection {
  return {
    kind: 'low_activity',
    title: `${cadence === 'weekly' ? 'Weekly' : 'Monthly'} low-activity summary`,
    body: 'No budget pace, category, bill, goal, or unresolved critical-alert changes need attention.',
    severity: 'positive',
  };
}
