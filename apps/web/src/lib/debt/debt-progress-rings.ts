// SPDX-License-Identifier: BUSL-1.1

import type { DebtMilestoneSummary, StrategyResult, StudentLoanDashboardSummary } from '../debt-types';

export interface DebtProgressRingCard {
  readonly id: 'debt-payoff' | 'student-loans';
  readonly title: string;
  readonly percent: number;
  readonly ariaLabel: string;
  readonly primaryText: string;
  readonly secondaryText: string;
  readonly detailItems: readonly string[];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function formatMonths(months: number | null): string {
  if (months === null) return 'payoff date unavailable';
  if (months <= 0) return 'paid off today';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`;
  if (remainingMonths === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'}, ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`;
}

function nextMilestoneText(summary: DebtMilestoneSummary): string {
  const next = summary.milestones.find((milestone) => !milestone.isReached);
  if (!next) return 'All milestone rings complete';
  return `Next milestone: ${next.thresholdPercent}% paid off`;
}

export function buildDebtPayoffProgressRingCard(input: {
  readonly milestones: DebtMilestoneSummary;
  readonly activeResult: StrategyResult;
  readonly interestSavedCents: number;
  readonly debtFreeLabel: string;
}): DebtProgressRingCard {
  const percent = clampPercent(input.milestones.percentPaidOff);
  const nextMilestone = nextMilestoneText(input.milestones);
  return {
    id: 'debt-payoff',
    title: 'Debt payoff progress',
    percent,
    ariaLabel: `Debt payoff progress ${percent}% paid off. ${nextMilestone}.`,
    primaryText: `${percent.toFixed(1)}% paid off`,
    secondaryText: input.debtFreeLabel,
    detailItems: [
      `Interest saved versus minimum payments: ${input.interestSavedCents} cents`,
      `Debt-free estimate: ${input.debtFreeLabel}`,
      nextMilestone,
      `Modeled payoff timeline: ${formatMonths(input.activeResult.totalMonths)}`,
    ],
  };
}

export function buildStudentLoanProgressRingCard(input: {
  readonly summary: StudentLoanDashboardSummary;
  readonly interestSavedCents: number;
}): DebtProgressRingCard {
  const percent = clampPercent(input.summary.percentPaidOff);
  const payoffText = input.summary.estimatedPayoffDate
    ? `Estimated payoff: ${input.summary.estimatedPayoffDate}`
    : 'Estimated payoff unavailable';
  return {
    id: 'student-loans',
    title: 'Student loan progress',
    percent,
    ariaLabel: `Student loan progress ${percent}% paid off. ${payoffText}.`,
    primaryText: `${percent.toFixed(1)}% paid off`,
    secondaryText: payoffText,
    detailItems: [
      payoffText,
      `Interest saved with current what-if: ${input.interestSavedCents} cents`,
      `Remaining interest estimate: ${input.summary.totalInterestCents} cents`,
    ],
  };
}
