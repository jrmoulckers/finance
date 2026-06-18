// SPDX-License-Identifier: BUSL-1.1

import { bankersRound, daysBetween } from './utils';

export type SinkingFundContributionCadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export type SinkingFundStatus = 'funded' | 'on-track' | 'catch-up' | 'due-now' | 'overdue';

export interface SinkingFundPlannerInput {
  readonly id: string;
  readonly name: string;
  readonly targetCents: number;
  readonly dueDate: string;
  readonly linkedCategoryId: string;
  readonly savedCents?: number;
  readonly currentBalanceCents?: number;
  readonly plannedContributionCents?: number;
  readonly cadence?: SinkingFundContributionCadence;
}

export interface SinkingFundContributionAllocation {
  readonly categoryId: string;
  readonly amountCents: number;
  readonly kind: 'sinking-fund-contribution';
  readonly spendingImpactCents: 0;
}

export interface SinkingFundPlan {
  readonly fundId: string;
  readonly name: string;
  readonly linkedCategoryId: string;
  readonly targetCents: number;
  readonly savedToDateCents: number;
  readonly remainingCents: number;
  readonly dueDate: string;
  readonly cadence: SinkingFundContributionCadence;
  readonly periodsRemaining: number;
  readonly monthsRemaining: number;
  readonly contributionPerPeriodCents: number;
  readonly plannedContributionCents: number | null;
  readonly projectedSavedByDueCents: number;
  readonly fundingGapAtDueCents: number;
  readonly status: SinkingFundStatus;
  readonly allocation: SinkingFundContributionAllocation;
  readonly guidance: string;
}

export interface SinkingFundPortfolioSummary {
  readonly plans: readonly SinkingFundPlan[];
  readonly totalContributionCents: number;
  readonly totalRemainingCents: number;
  readonly catchUpCount: number;
  readonly fundedCount: number;
}

const CADENCE_DAYS: Record<SinkingFundContributionCadence, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
};

function positiveCents(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, bankersRound(value)) : 0;
}

function calculatePeriodsRemaining(
  today: string,
  dueDate: string,
  cadence: SinkingFundContributionCadence,
): number {
  const remainingDays = daysBetween(today, dueDate);
  if (remainingDays <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(remainingDays / CADENCE_DAYS[cadence]));
}

function buildGuidance(
  status: SinkingFundStatus,
  plan: Pick<SinkingFundPlan, 'name' | 'contributionPerPeriodCents' | 'fundingGapAtDueCents'>,
): string {
  switch (status) {
    case 'funded':
      return `${plan.name} is fully funded.`;
    case 'overdue':
      return `${plan.name} is past due; reserve the remaining amount before spending from this category.`;
    case 'due-now':
      return `${plan.name} is due now; reserve the remaining amount in this period.`;
    case 'catch-up':
      return `Increase ${plan.name} contributions or move the due date; current plan misses by ${formatDollars(plan.fundingGapAtDueCents)}.`;
    case 'on-track':
      return `Reserve ${formatDollars(plan.contributionPerPeriodCents)} per period for ${plan.name}.`;
  }
}

function formatDollars(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function calculateSinkingFundPlan(
  fund: SinkingFundPlannerInput,
  today: string,
): SinkingFundPlan {
  const cadence = fund.cadence ?? 'MONTHLY';
  const targetCents = positiveCents(fund.targetCents);
  const savedToDateCents = positiveCents(fund.savedCents ?? fund.currentBalanceCents);
  const remainingCents = Math.max(0, targetCents - savedToDateCents);
  const daysUntilDue = daysBetween(today, fund.dueDate);
  const periodsRemaining = calculatePeriodsRemaining(today, fund.dueDate, cadence);
  const monthsRemaining =
    daysUntilDue > 0 ? Math.max(1, Math.ceil(daysUntilDue / CADENCE_DAYS.MONTHLY)) : 0;
  const contributionPerPeriodCents =
    remainingCents > 0 && periodsRemaining > 0
      ? bankersRound(remainingCents / periodsRemaining)
      : remainingCents;
  const plannedContributionCents =
    fund.plannedContributionCents === undefined
      ? null
      : positiveCents(fund.plannedContributionCents);
  const projectedSavedByDueCents = Math.min(
    targetCents,
    savedToDateCents + (plannedContributionCents ?? contributionPerPeriodCents) * periodsRemaining,
  );
  const fundingGapAtDueCents = Math.max(0, targetCents - projectedSavedByDueCents);
  const status: SinkingFundStatus =
    remainingCents === 0
      ? 'funded'
      : daysUntilDue < 0
        ? 'overdue'
        : periodsRemaining === 0
          ? 'due-now'
          : fundingGapAtDueCents > 0
            ? 'catch-up'
            : 'on-track';

  const partialPlan = {
    name: fund.name,
    contributionPerPeriodCents,
    fundingGapAtDueCents,
  };

  return {
    fundId: fund.id,
    name: fund.name,
    linkedCategoryId: fund.linkedCategoryId,
    targetCents,
    savedToDateCents,
    remainingCents,
    dueDate: fund.dueDate,
    cadence,
    periodsRemaining,
    monthsRemaining,
    contributionPerPeriodCents,
    plannedContributionCents,
    projectedSavedByDueCents,
    fundingGapAtDueCents,
    status,
    allocation: {
      categoryId: fund.linkedCategoryId,
      amountCents: contributionPerPeriodCents,
      kind: 'sinking-fund-contribution',
      spendingImpactCents: 0,
    },
    guidance: buildGuidance(status, partialPlan),
  };
}

export function summarizeSinkingFundPortfolio(
  funds: readonly SinkingFundPlannerInput[],
  today: string,
): SinkingFundPortfolioSummary {
  const plans = funds.map((fund) => calculateSinkingFundPlan(fund, today));

  return {
    plans,
    totalContributionCents: plans.reduce((sum, plan) => sum + plan.contributionPerPeriodCents, 0),
    totalRemainingCents: plans.reduce((sum, plan) => sum + plan.remainingCents, 0),
    catchUpCount: plans.filter((plan) => plan.status === 'catch-up' || plan.status === 'overdue')
      .length,
    fundedCount: plans.filter((plan) => plan.status === 'funded').length,
  };
}
