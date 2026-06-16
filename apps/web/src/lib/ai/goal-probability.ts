// SPDX-License-Identifier: BUSL-1.1

import type { Goal, Transaction } from '../../kmp/bridge';

export interface PlannedGoalContribution {
  readonly goalId: string;
  readonly monthlyAmountCents: number;
}

export interface GoalProbabilityInput {
  readonly goals: readonly Goal[];
  readonly transactions: readonly Transaction[];
  readonly asOfDate?: string;
  readonly plannedContributions?: readonly PlannedGoalContribution[];
  readonly minimumProbability?: number;
}

export interface GoalAchievementEstimate {
  readonly goalId: string;
  readonly goalName: string;
  readonly status: 'ready' | 'no-target-date' | 'already-complete' | 'insufficient-history';
  readonly probability: number | null;
  readonly requiredMonthlyContributionCents: number | null;
  readonly expectedMonthlyContributionCents: number | null;
  readonly monthlyGapCents: number | null;
  readonly conservativeOutcomeCents: number | null;
  readonly expectedOutcomeCents: number | null;
  readonly optimisticOutcomeCents: number | null;
  readonly adjustmentOptions: readonly string[];
  readonly explanation: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function monthsUntil(asOfDate: string, targetDate: string): number {
  return Math.max(0, (parseDate(targetDate) - parseDate(asOfDate)) / DAY_MS / 30.4375);
}

function amount(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

function monthlyNetHistory(transactions: readonly Transaction[]): readonly number[] {
  const byMonth = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.status === 'VOID' || transaction.type === 'TRANSFER') continue;
    const signed = transaction.type === 'INCOME' ? amount(transaction) : -amount(transaction);
    byMonth.set(monthKey(transaction.date), (byMonth.get(monthKey(transaction.date)) ?? 0) + signed);
  }
  return Array.from(byMonth.values());
}

function detectedGoalContributions(goal: Goal, transactions: readonly Transaction[]): number {
  const matches = transactions.filter((transaction) => {
    if (transaction.status === 'VOID') return false;
    if (goal.accountId !== null && transaction.accountId === goal.accountId && transaction.type !== 'EXPENSE') {
      return true;
    }
    const text = `${transaction.note ?? ''} ${transaction.payee ?? ''} ${transaction.counterpartyName ?? ''}`.toLowerCase();
    return text.includes(goal.name.toLowerCase()) && transaction.type !== 'EXPENSE';
  });
  const byMonth = new Map<string, number>();
  for (const transaction of matches) {
    byMonth.set(monthKey(transaction.date), (byMonth.get(monthKey(transaction.date)) ?? 0) + amount(transaction));
  }
  const values = Array.from(byMonth.values());
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatDollars(cents: number): string {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

export function estimateGoalAchievementProbability(
  input: GoalProbabilityInput,
): readonly GoalAchievementEstimate[] {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const minimumProbability = input.minimumProbability ?? 0.7;
  const netHistory = monthlyNetHistory(input.transactions);
  const averageNet =
    netHistory.length > 0 ? netHistory.reduce((sum, value) => sum + value, 0) / netHistory.length : 0;
  const monthlyVariance = standardDeviation(netHistory);

  return input.goals.map((goal): GoalAchievementEstimate => {
    const remainingCents = Math.max(0, goal.targetAmount.amount - goal.currentAmount.amount);
    if (remainingCents === 0 || goal.status === 'COMPLETED') {
      return {
        goalId: goal.id,
        goalName: goal.name,
        status: 'already-complete',
        probability: 1,
        requiredMonthlyContributionCents: 0,
        expectedMonthlyContributionCents: 0,
        monthlyGapCents: 0,
        conservativeOutcomeCents: goal.currentAmount.amount,
        expectedOutcomeCents: goal.currentAmount.amount,
        optimisticOutcomeCents: goal.currentAmount.amount,
        adjustmentOptions: [],
        explanation: `${goal.name} is already funded.`,
      };
    }

    if (goal.targetDate === null) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        status: 'no-target-date',
        probability: null,
        requiredMonthlyContributionCents: null,
        expectedMonthlyContributionCents: null,
        monthlyGapCents: null,
        conservativeOutcomeCents: null,
        expectedOutcomeCents: null,
        optimisticOutcomeCents: null,
        adjustmentOptions: ['Add a target date to estimate probability.'],
        explanation: `${goal.name} needs a target date before probability can be estimated.`,
      };
    }

    const months = monthsUntil(asOfDate, goal.targetDate);
    if (months <= 0) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        status: 'no-target-date',
        probability: null,
        requiredMonthlyContributionCents: remainingCents,
        expectedMonthlyContributionCents: null,
        monthlyGapCents: null,
        conservativeOutcomeCents: null,
        expectedOutcomeCents: null,
        optimisticOutcomeCents: null,
        adjustmentOptions: ['Choose a future target date.'],
        explanation: `${goal.name} has a target date that is not in the future.`,
      };
    }

    if (netHistory.length < 2 && (input.plannedContributions ?? []).every((item) => item.goalId !== goal.id)) {
      return {
        goalId: goal.id,
        goalName: goal.name,
        status: 'insufficient-history',
        probability: null,
        requiredMonthlyContributionCents: Math.ceil(remainingCents / months),
        expectedMonthlyContributionCents: null,
        monthlyGapCents: null,
        conservativeOutcomeCents: null,
        expectedOutcomeCents: null,
        optimisticOutcomeCents: null,
        adjustmentOptions: ['Add a planned monthly contribution or more history.'],
        explanation: `${goal.name} needs more local cash-flow history before estimating probability.`,
      };
    }

    const planned = input.plannedContributions?.find((item) => item.goalId === goal.id)?.monthlyAmountCents;
    const detected = detectedGoalContributions(goal, input.transactions);
    const surplusContribution = Math.max(0, Math.round(averageNet * 0.2));
    const expectedMonthlyContributionCents = planned ?? Math.max(detected, surplusContribution);
    const requiredMonthlyContributionCents = Math.ceil(remainingCents / months);
    const monthlyGapCents = Math.max(0, requiredMonthlyContributionCents - expectedMonthlyContributionCents);
    const expectedOutcomeCents = Math.round(
      goal.currentAmount.amount + expectedMonthlyContributionCents * months,
    );
    const stdAtTarget = Math.max(1, monthlyVariance * 0.2 * Math.sqrt(months));
    const zScore = (expectedOutcomeCents - goal.targetAmount.amount) / stdAtTarget;
    const probability = Math.max(0.01, Math.min(0.99, normalCdf(zScore)));
    const conservativeOutcomeCents = Math.round(expectedOutcomeCents - 1.28 * stdAtTarget);
    const optimisticOutcomeCents = Math.round(expectedOutcomeCents + 1.28 * stdAtTarget);
    const adjustmentOptions =
      probability < minimumProbability
        ? [
            `Increase contributions by about ${formatDollars(monthlyGapCents)} per month.`,
            `Or extend the date enough to reduce the required ${formatDollars(requiredMonthlyContributionCents)} monthly pace.`,
          ]
        : ['Keep the current contribution pattern and review monthly.'];

    return {
      goalId: goal.id,
      goalName: goal.name,
      status: 'ready',
      probability,
      requiredMonthlyContributionCents,
      expectedMonthlyContributionCents,
      monthlyGapCents,
      conservativeOutcomeCents,
      expectedOutcomeCents,
      optimisticOutcomeCents,
      adjustmentOptions,
      explanation: `${goal.name} needs ${formatDollars(requiredMonthlyContributionCents)} per month; current expected funding is ${formatDollars(expectedMonthlyContributionCents)}.`,
    };
  });
}
