// SPDX-License-Identifier: BUSL-1.1

import type { Account, Goal, Transaction } from '../../kmp/bridge';
import { computeCurrentNetWorth, isLiabilityType } from '../analytics/net-worth';
import { formatCurrency } from '../currency';
import {
  DEBT_REDUCTION_THRESHOLDS,
  GOAL_PROGRESS_THRESHOLDS,
  NET_WORTH_THRESHOLDS,
  SAVINGS_STREAK_THRESHOLDS,
} from './thresholds';
import type { DetectMilestonesInput, DetectedMilestone, MilestoneSnapshot } from './types';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function previousMonthKey(key: string): string {
  const [yearPart, monthPart] = key.split('-').map(Number);
  const date = new Date(Date.UTC(yearPart, monthPart - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calculateSavingsStreakMonths(transactions: readonly Transaction[]): number {
  const monthTotals = new Map<string, { income: number; expenses: number }>();

  for (const transaction of transactions) {
    if (transaction.status === 'VOID' || transaction.type === 'TRANSFER') {
      continue;
    }

    const key = monthKey(transaction.date);
    const totals = monthTotals.get(key) ?? { income: 0, expenses: 0 };
    const amount = Math.abs(transaction.amount.amount);

    if (transaction.type === 'INCOME') {
      totals.income += amount;
    } else {
      totals.expenses += amount;
    }

    monthTotals.set(key, totals);
  }

  const orderedMonths = Array.from(monthTotals.keys()).sort();
  if (orderedMonths.length === 0) {
    return 0;
  }

  let expectedMonth = orderedMonths[orderedMonths.length - 1];
  let streak = 0;

  for (let index = orderedMonths.length - 1; index >= 0; index -= 1) {
    const key = orderedMonths[index];
    if (key !== expectedMonth) {
      break;
    }

    const totals = monthTotals.get(key);
    if (!totals || totals.income <= totals.expenses) {
      break;
    }

    streak += 1;
    expectedMonth = previousMonthKey(expectedMonth);
  }

  return streak;
}

export function buildMilestoneSnapshot(input: {
  readonly accounts: readonly Account[];
  readonly goals: readonly Goal[];
  readonly transactions: readonly Transaction[];
}): MilestoneSnapshot {
  const netWorth = computeCurrentNetWorth([...input.accounts]);

  const goals = Object.fromEntries(
    input.goals.map((goal) => {
      const targetAmountCents = goal.targetAmount.amount;
      const currentAmountCents = goal.currentAmount.amount;
      const progressPercent =
        targetAmountCents > 0 ? clampPercent((currentAmountCents / targetAmountCents) * 100) : 0;

      return [
        goal.id,
        {
          goalId: goal.id,
          goalName: goal.name,
          currentAmountCents,
          targetAmountCents,
          progressPercent,
        },
      ];
    }),
  );

  const liabilities = Object.fromEntries(
    input.accounts
      .filter((account) => !account.isArchived && isLiabilityType(account.type))
      .map((account) => [
        account.id,
        {
          accountId: account.id,
          accountName: account.name,
          balanceCents: Math.abs(account.currentBalance.amount),
        },
      ]),
  );

  return {
    netWorthCents: netWorth.netWorth,
    totalDebtCents: netWorth.liabilities,
    savingsStreakMonths: calculateSavingsStreakMonths(input.transactions),
    goals,
    liabilities,
  };
}

function maybeAddMilestone(
  milestones: DetectedMilestone[],
  shownMilestoneIds: ReadonlySet<string>,
  milestone: DetectedMilestone,
): void {
  if (!shownMilestoneIds.has(milestone.id)) {
    milestones.push(milestone);
  }
}

function debtReductionPercent(totalDebtCents: number, baselineDebtCents: number): number {
  if (baselineDebtCents <= 0) {
    return 0;
  }

  return clampPercent(((baselineDebtCents - totalDebtCents) / baselineDebtCents) * 100);
}

export function detectMilestones(input: DetectMilestonesInput): DetectedMilestone[] {
  const milestones: DetectedMilestone[] = [];

  for (const threshold of NET_WORTH_THRESHOLDS) {
    if (
      input.previous.netWorthCents < threshold.thresholdCents &&
      input.current.netWorthCents >= threshold.thresholdCents
    ) {
      maybeAddMilestone(milestones, input.shownMilestoneIds, {
        id: `net-worth-${threshold.thresholdCents}`,
        category: 'net-worth',
        title: threshold.title,
        message: `Your net worth just crossed ${formatCurrency(threshold.thresholdCents)}. Amazing work building wealth.`,
        icon: threshold.icon,
        badge: formatCurrency(threshold.thresholdCents),
        confetti: threshold.confetti,
        createdAt: input.now,
      });
    }
  }

  for (const goal of Object.values(input.current.goals)) {
    const previousGoalPercent = input.previous.goals[goal.goalId]?.progressPercent ?? 0;

    for (const threshold of GOAL_PROGRESS_THRESHOLDS) {
      if (previousGoalPercent < threshold.percent && goal.progressPercent >= threshold.percent) {
        maybeAddMilestone(milestones, input.shownMilestoneIds, {
          id: `goal-${goal.goalId}-${threshold.percent}`,
          category: 'goal-progress',
          title: threshold.title,
          message:
            threshold.percent === 100
              ? `${goal.goalName} is fully funded at ${formatCurrency(goal.currentAmountCents)}.`
              : `${goal.goalName} reached ${threshold.percent}% funded (${formatCurrency(goal.currentAmountCents)} of ${formatCurrency(goal.targetAmountCents)}).`,
          icon: threshold.icon,
          badge: `${threshold.percent}%`,
          confetti: threshold.confetti,
          createdAt: input.now,
        });
      }
    }
  }

  for (const threshold of SAVINGS_STREAK_THRESHOLDS) {
    if (
      input.previous.savingsStreakMonths < threshold.months &&
      input.current.savingsStreakMonths >= threshold.months
    ) {
      maybeAddMilestone(milestones, input.shownMilestoneIds, {
        id: `savings-streak-${threshold.months}`,
        category: 'savings-streak',
        title: threshold.title,
        message: `You have saved more than you spent for ${threshold.months} straight month${threshold.months === 1 ? '' : 's'}.`,
        icon: threshold.icon,
        badge: `${threshold.months} mo`,
        confetti: threshold.confetti,
        createdAt: input.now,
      });
    }
  }

  const totalDebtBaseline = input.debtBaselines.totalDebtCents;
  const previousDebtReduction = debtReductionPercent(
    input.previous.totalDebtCents,
    totalDebtBaseline,
  );
  const currentDebtReduction = debtReductionPercent(
    input.current.totalDebtCents,
    totalDebtBaseline,
  );

  for (const threshold of DEBT_REDUCTION_THRESHOLDS) {
    if (previousDebtReduction < threshold.percent && currentDebtReduction >= threshold.percent) {
      maybeAddMilestone(milestones, input.shownMilestoneIds, {
        id: `debt-reduction-${threshold.percent}`,
        category: 'debt-reduction',
        title: threshold.title,
        message:
          threshold.percent === 100
            ? 'You have completely paid down the debt tracked in your accounts.'
            : `Your total debt is down ${threshold.percent}% from its highest tracked balance.`,
        icon: threshold.icon,
        badge: `${threshold.percent}%`,
        confetti: threshold.confetti,
        createdAt: input.now,
      });
    }
  }

  for (const liability of Object.values(input.current.liabilities)) {
    const previousBalance = input.previous.liabilities[liability.accountId]?.balanceCents ?? 0;
    if (previousBalance > 0 && liability.balanceCents <= 0) {
      maybeAddMilestone(milestones, input.shownMilestoneIds, {
        id: `debt-payoff-${liability.accountId}`,
        category: 'debt-payoff',
        title: 'Debt paid off!',
        message: `${liability.accountName} is fully paid off. Nicely done.`,
        icon: 'check-circle',
        badge: 'Paid off',
        confetti: true,
        createdAt: input.now,
      });
    }
  }

  return milestones;
}
