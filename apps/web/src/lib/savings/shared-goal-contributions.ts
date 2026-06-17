// SPDX-License-Identifier: BUSL-1.1

export type ContributionPrivacy = 'visible' | 'percent-only' | 'hidden';

export interface GoalContributor {
  readonly id: string;
  readonly name: string;
  readonly splitPercent: number;
  readonly privacy: ContributionPrivacy;
}

export interface GoalContribution {
  readonly contributorId: string;
  readonly date: string;
  readonly amountCents: number;
}

export interface ContributorSummary {
  readonly contributorId: string;
  readonly displayName: string | null;
  readonly amountCents: number | null;
  readonly percentOfTotal: number;
}

export interface SharedGoalContributionSummary {
  readonly remainingCents: number;
  readonly monthlyTargetCents: number;
  readonly catchUpCents: number;
  readonly projectedMilestoneDate: string | null;
  readonly contributors: readonly ContributorSummary[];
}

function monthsUntil(today: string, dueDate: string): number {
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(`${dueDate}T00:00:00.000Z`);
  return Math.max(1, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
}

export function summarizeGoalContributions(
  targetCents: number,
  currentCents: number,
  dueDate: string,
  today: string,
  contributors: readonly GoalContributor[],
  history: readonly GoalContribution[],
): SharedGoalContributionSummary {
  const remainingCents = Math.max(0, targetCents - currentCents);
  const monthlyTargetCents = Math.ceil(remainingCents / monthsUntil(today, dueDate));
  const contributedTotal = history.reduce((sum, item) => sum + item.amountCents, 0);
  const expectedBySplit = contributors.reduce((sum, item) => sum + Math.round((contributedTotal * item.splitPercent) / 100), 0);
  const catchUpCents = Math.max(0, expectedBySplit - contributedTotal);
  const contributorsSummary = contributors.map((contributor) => {
    const amount = history.filter((item) => item.contributorId === contributor.id).reduce((sum, item) => sum + item.amountCents, 0);
    return {
      contributorId: contributor.id,
      displayName: contributor.privacy === 'hidden' ? null : contributor.name,
      amountCents: contributor.privacy === 'visible' ? amount : null,
      percentOfTotal: contributedTotal === 0 ? 0 : Math.round((amount / contributedTotal) * 10000) / 100,
    };
  });

  return {
    remainingCents,
    monthlyTargetCents,
    catchUpCents,
    projectedMilestoneDate: remainingCents === 0 ? today : dueDate,
    contributors: contributorsSummary,
  };
}
