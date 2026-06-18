// SPDX-License-Identifier: BUSL-1.1

import {
  summarizeSinkingFundPortfolio,
  type SinkingFundPlannerInput,
  type SinkingFundStatus,
} from './sinking-fund-planner';

export interface SinkingFundSurfaceInput extends SinkingFundPlannerInput {
  readonly isArchived?: boolean;
}

export interface SinkingFundSurfaceCard {
  readonly fundId: string;
  readonly name: string;
  readonly targetCents: number;
  readonly savedToDateCents: number;
  readonly remainingCents: number;
  readonly contributionPerPeriodCents: number;
  readonly monthsRemaining: number;
  readonly status: SinkingFundStatus;
  readonly isArchived: boolean;
}

export interface SinkingFundSurfaceState {
  readonly activeCards: readonly SinkingFundSurfaceCard[];
  readonly archivedCards: readonly SinkingFundSurfaceCard[];
  readonly totalActiveContributionCents: number;
  readonly totalActiveRemainingCents: number;
  readonly offlineFriendlyMessage: string;
}

export function buildSinkingFundSurfaceState(
  funds: readonly SinkingFundSurfaceInput[],
  today: string,
): SinkingFundSurfaceState {
  const activeFunds = funds.filter((fund) => fund.isArchived !== true);
  const archivedFunds = funds.filter((fund) => fund.isArchived === true);
  const activeSummary = summarizeSinkingFundPortfolio(activeFunds, today);
  const archivedSummary = summarizeSinkingFundPortfolio(archivedFunds, today);

  return {
    activeCards: activeSummary.plans.map((plan) => ({ ...toCard(plan), isArchived: false })),
    archivedCards: archivedSummary.plans.map((plan) => ({ ...toCard(plan), isArchived: true })),
    totalActiveContributionCents: activeSummary.totalContributionCents,
    totalActiveRemainingCents: activeSummary.totalRemainingCents,
    offlineFriendlyMessage:
      'Sinking funds are calculated from locally saved plans and remain available offline.',
  };
}

function toCard(
  plan: ReturnType<typeof summarizeSinkingFundPortfolio>['plans'][number],
): Omit<SinkingFundSurfaceCard, 'isArchived'> {
  return {
    fundId: plan.fundId,
    name: plan.name,
    targetCents: plan.targetCents,
    savedToDateCents: plan.savedToDateCents,
    remainingCents: plan.remainingCents,
    contributionPerPeriodCents: plan.contributionPerPeriodCents,
    monthsRemaining: plan.monthsRemaining,
    status: plan.status,
  };
}
