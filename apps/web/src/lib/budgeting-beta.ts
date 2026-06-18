// SPDX-License-Identifier: BUSL-1.1

import type { BudgetPeriod } from '../kmp/bridge';
import { calculateZeroBasedSummary, getAllocationStatus } from './budgeting-zero-based';

export type PlanningCadence = Extract<BudgetPeriod, 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>;

export interface BudgetPlanItem {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly amountCents: number;
  readonly spentCents: number;
  readonly period: BudgetPeriod;
  readonly isRollover: boolean;
}

export interface IncomeEventInput {
  readonly id: string;
  readonly source: string;
  readonly amountCents: number;
  readonly date: string;
}

export interface EnvelopeBalance {
  readonly budgetId: string;
  readonly name: string;
  readonly allocatedCents: number;
  readonly spentCents: number;
  readonly remainingCents: number;
  readonly isEnvelope: boolean;
  readonly envelopeBalanceCents: number;
}

export interface EnvelopeSummary {
  readonly totalIncomeCents: number;
  readonly totalAssignedCents: number;
  readonly readyToAssignCents: number;
  readonly status: ReturnType<typeof getAllocationStatus>;
  readonly envelopes: readonly EnvelopeBalance[];
}

const PERIODS_PER_YEAR: Record<BudgetPeriod, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

function roundCents(value: number): number {
  return Math.round(value);
}

export function normalizeBudgetAmountCents(
  amountCents: number,
  fromPeriod: BudgetPeriod,
  toPeriod: BudgetPeriod,
): number {
  if (fromPeriod === toPeriod) {
    return amountCents;
  }

  const annualized = amountCents * PERIODS_PER_YEAR[fromPeriod];
  return roundCents(annualized / PERIODS_PER_YEAR[toPeriod]);
}

export function calculateActiveCadenceRange(cadence: PlanningCadence, today: Date = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (cadence === 'MONTHLY') {
    return {
      startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
      ).padStart(2, '0')}`,
    };
  }

  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + (cadence === 'BIWEEKLY' ? 13 : 6));

  return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function summarizeEnvelopePlan(
  expectedIncomeCents: number,
  budgets: readonly BudgetPlanItem[],
  cadence: PlanningCadence = 'MONTHLY',
): EnvelopeSummary {
  const allocations = budgets.map((budget) => ({
    categoryId: budget.categoryId,
    name: budget.name,
    allocatedCents: normalizeBudgetAmountCents(budget.amountCents, budget.period, cadence),
    spentCents: budget.spentCents,
  }));
  const zeroBased = calculateZeroBasedSummary(expectedIncomeCents, allocations);

  return {
    totalIncomeCents: zeroBased.totalIncomeCents,
    totalAssignedCents: zeroBased.totalAllocatedCents,
    readyToAssignCents: zeroBased.readyToAssignCents,
    status: zeroBased.status,
    envelopes: budgets.map((budget, index) => {
      const allocatedCents = allocations[index].allocatedCents;
      const remainingCents = allocatedCents - budget.spentCents;
      return {
        budgetId: budget.id,
        name: budget.name,
        allocatedCents,
        spentCents: budget.spentCents,
        remainingCents,
        isEnvelope: budget.isRollover,
        envelopeBalanceCents: budget.isRollover ? remainingCents : 0,
      };
    }),
  };
}

export function summarizeCadenceIncome(
  incomeEvents: readonly IncomeEventInput[],
  cadence: PlanningCadence,
) {
  const cadenceIncomeCents = incomeEvents.reduce((sum, event) => sum + event.amountCents, 0);
  return {
    cadenceIncomeCents,
    projectedMonthlyIncomeCents: normalizeBudgetAmountCents(cadenceIncomeCents, cadence, 'MONTHLY'),
    eventCount: incomeEvents.length,
  };
}

export interface RolloverPeriodInput {
  readonly label: string;
  readonly allocationCents: number;
  readonly spentCents: number;
}

export interface RolloverPeriodResult extends RolloverPeriodInput {
  readonly beginningCarryoverCents: number;
  readonly endingBalanceCents: number;
}

export function calculateRolloverLedger(
  periods: readonly RolloverPeriodInput[],
): RolloverPeriodResult[] {
  let carryover = 0;
  return periods.map((period) => {
    const beginningCarryoverCents = carryover;
    const endingBalanceCents = beginningCarryoverCents + period.allocationCents - period.spentCents;
    carryover = endingBalanceCents;
    return { ...period, beginningCarryoverCents, endingBalanceCents };
  });
}

export interface VarianceBudgetInput {
  readonly categoryId: string;
  readonly name: string;
  readonly budgetedCents: number;
  readonly actualCents: number;
  readonly priorActualCents?: number | null;
}

export type VarianceKind = 'over' | 'under' | 'on-track';
export type VarianceTrend = 'recurring-trend' | 'one-time-spike' | 'no-prior-period';

export interface VarianceInsight {
  readonly categoryId: string;
  readonly name: string;
  readonly kind: VarianceKind;
  readonly varianceCents: number;
  readonly variancePercent: number;
  readonly trend: VarianceTrend;
  readonly action: string;
}

export function generateVarianceInsights(
  budgets: readonly VarianceBudgetInput[],
  limit = 4,
): VarianceInsight[] {
  return budgets
    .map((budget): VarianceInsight => {
      const varianceCents = budget.actualCents - budget.budgetedCents;
      const variancePercent =
        budget.budgetedCents > 0 ? Math.round((varianceCents / budget.budgetedCents) * 100) : 0;
      const kind: VarianceKind =
        varianceCents > 0
          ? 'over'
          : budget.actualCents <= budget.budgetedCents * 0.5
            ? 'under'
            : 'on-track';
      const priorVariance =
        budget.priorActualCents == null ? null : budget.priorActualCents - budget.budgetedCents;
      const trend: VarianceTrend =
        priorVariance == null
          ? 'no-prior-period'
          : (varianceCents > 0 && priorVariance > 0) || (varianceCents < 0 && priorVariance < 0)
            ? 'recurring-trend'
            : 'one-time-spike';
      return {
        categoryId: budget.categoryId,
        name: budget.name,
        kind,
        varianceCents,
        variancePercent,
        trend,
        action: buildVarianceAction(budget.name, kind, trend, Math.abs(varianceCents)),
      };
    })
    .filter((insight) => insight.kind !== 'on-track')
    .sort((a, b) => Math.abs(b.varianceCents) - Math.abs(a.varianceCents))
    .slice(0, limit);
}

function buildVarianceAction(
  name: string,
  kind: VarianceKind,
  trend: VarianceTrend,
  absoluteVarianceCents: number,
): string {
  if (kind === 'over') {
    return trend === 'recurring-trend'
      ? `Consider raising ${name} or moving ${formatDollars(absoluteVarianceCents)} from a lower-priority envelope next period.`
      : `Check whether this ${name} increase was one-time before changing next period.`;
  }

  return `Consider moving up to ${formatDollars(absoluteVarianceCents)} from ${name} to an underfunded priority.`;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface ForecastEvent {
  readonly id: string;
  readonly label: string;
  readonly date: string;
  readonly amountCents: number;
}

export interface MonthEndForecastInput {
  readonly currentBalanceCents: number;
  readonly today: string;
  readonly monthEnd: string;
  readonly expectedIncome: readonly ForecastEvent[];
  readonly scheduledOutflows: readonly ForecastEvent[];
  readonly remainingBudgetedSpendCents: number;
}

export interface MonthEndForecast {
  readonly projectedEndBalanceCents: number;
  readonly lowestBalanceCents: number;
  readonly lowestBalanceDate: string;
  readonly totalExpectedIncomeCents: number;
  readonly totalScheduledOutflowsCents: number;
  readonly remainingBudgetedSpendCents: number;
  readonly hasShortfall: boolean;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly assumptions: readonly string[];
}

export function forecastMonthEndBalance(input: MonthEndForecastInput): MonthEndForecast {
  const events = [
    ...input.expectedIncome.map((event) => ({
      ...event,
      amountCents: Math.abs(event.amountCents),
    })),
    ...input.scheduledOutflows.map((event) => ({
      ...event,
      amountCents: -Math.abs(event.amountCents),
    })),
    {
      id: 'remaining-budget',
      label: 'Remaining budgeted spending',
      date: input.monthEnd,
      amountCents: -Math.abs(input.remainingBudgetedSpendCents),
    },
  ].sort((a, b) => a.date.localeCompare(b.date));

  let balance = input.currentBalanceCents;
  let lowestBalanceCents = balance;
  let lowestBalanceDate = input.today;
  for (const event of events) {
    balance += event.amountCents;
    if (balance < lowestBalanceCents) {
      lowestBalanceCents = balance;
      lowestBalanceDate = event.date;
    }
  }

  const totalExpectedIncomeCents = input.expectedIncome.reduce(
    (sum, event) => sum + Math.abs(event.amountCents),
    0,
  );
  const totalScheduledOutflowsCents = input.scheduledOutflows.reduce(
    (sum, event) => sum + Math.abs(event.amountCents),
    0,
  );
  const assumptions = [
    'Uses current household balance, expected income, scheduled outflows, and remaining budgeted spending.',
    input.expectedIncome.length === 0
      ? 'No expected income is scheduled before month end.'
      : `${input.expectedIncome.length} income event(s) are expected before month end.`,
    input.remainingBudgetedSpendCents > 0
      ? 'Assumes unspent budget allocations are spent by month end.'
      : 'No remaining budgeted spending is included.',
  ];

  return {
    projectedEndBalanceCents: balance,
    lowestBalanceCents,
    lowestBalanceDate,
    totalExpectedIncomeCents,
    totalScheduledOutflowsCents,
    remainingBudgetedSpendCents: Math.abs(input.remainingBudgetedSpendCents),
    hasShortfall: lowestBalanceCents < 0 || balance < 0,
    confidence:
      input.expectedIncome.length > 0 && input.scheduledOutflows.length > 0
        ? 'high'
        : input.expectedIncome.length > 0 || input.scheduledOutflows.length > 0
          ? 'medium'
          : 'low',
    assumptions,
  };
}
