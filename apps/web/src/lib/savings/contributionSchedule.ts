// SPDX-License-Identifier: BUSL-1.1

import type {
  ContributionFrequency,
  ContributionPlan,
  ContributionPlanOption,
  ContributionScheduleInput,
} from './types';

const MIN_CONTRIBUTION_CENTS = 2_500;

const CONTRIBUTIONS_PER_MONTH: Record<ContributionFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToNearestTwentyFiveDollars(cents: number): number {
  return Math.max(0, Math.round(cents / 2_500) * 2_500);
}

function pickRecommendedFrequency(monthlyContributionCents: number): ContributionFrequency {
  if (monthlyContributionCents <= 75_000) {
    return 'weekly';
  }

  if (monthlyContributionCents <= 200_000) {
    return 'biweekly';
  }

  return 'monthly';
}

export function getContributionAmountForFrequency(
  monthlyEquivalentCents: number,
  frequency: ContributionFrequency,
): number {
  const contributionsPerMonth = CONTRIBUTIONS_PER_MONTH[frequency];
  if (monthlyEquivalentCents <= 0 || contributionsPerMonth <= 0) {
    return 0;
  }

  return Math.ceil(monthlyEquivalentCents / contributionsPerMonth);
}

export function buildContributionOptions(
  monthlyEquivalentCents: number,
  monthlySurplusCents: number,
): ContributionPlanOption[] {
  return (Object.keys(CONTRIBUTIONS_PER_MONTH) as ContributionFrequency[]).map((frequency) => ({
    frequency,
    contributionCents: getContributionAmountForFrequency(monthlyEquivalentCents, frequency),
    monthlyEquivalentCents,
    percentOfSurplus:
      monthlySurplusCents > 0
        ? Math.min(999, Math.round((monthlyEquivalentCents / monthlySurplusCents) * 100))
        : 0,
  }));
}

export function calculateContributionPlan(input: ContributionScheduleInput): ContributionPlan {
  const shortfallCents = Math.max(input.targetCents - input.currentCents, 0);
  if (shortfallCents === 0) {
    return {
      recommendedFrequency: 'monthly',
      recommendedMonthlyContributionCents: 0,
      minimumMonthlyContributionCents: 0,
      stretchMonthlyContributionCents: 0,
      estimatedMonths: 0,
      options: buildContributionOptions(0, input.monthlyCapacityCents),
    };
  }

  const roundedCapacity = roundToNearestTwentyFiveDollars(input.monthlyCapacityCents);
  const minimumMonthlyContributionCents =
    shortfallCents <= MIN_CONTRIBUTION_CENTS
      ? shortfallCents
      : Math.min(
          shortfallCents,
          Math.max(
            MIN_CONTRIBUTION_CENTS,
            roundToNearestTwentyFiveDollars(Math.ceil(shortfallCents / 24)),
          ),
        );

  const desiredMonthlyContributionCents = roundToNearestTwentyFiveDollars(
    input.desiredMonthlyContributionCents ?? Math.ceil(shortfallCents / 12),
  );

  const upperBound =
    roundedCapacity > 0
      ? Math.max(roundedCapacity, minimumMonthlyContributionCents)
      : shortfallCents;
  const recommendedMonthlyContributionCents = clamp(
    desiredMonthlyContributionCents > 0
      ? desiredMonthlyContributionCents
      : minimumMonthlyContributionCents,
    Math.min(minimumMonthlyContributionCents, upperBound),
    upperBound,
  );

  const stretchMonthlyContributionCents = Math.max(
    recommendedMonthlyContributionCents,
    roundedCapacity > 0
      ? roundedCapacity
      : roundToNearestTwentyFiveDollars(Math.ceil(shortfallCents / 6)) ||
          recommendedMonthlyContributionCents,
  );

  return {
    recommendedFrequency: pickRecommendedFrequency(recommendedMonthlyContributionCents),
    recommendedMonthlyContributionCents,
    minimumMonthlyContributionCents,
    stretchMonthlyContributionCents,
    estimatedMonths:
      recommendedMonthlyContributionCents > 0
        ? Math.ceil(shortfallCents / recommendedMonthlyContributionCents)
        : -1,
    options: buildContributionOptions(
      recommendedMonthlyContributionCents,
      input.monthlyCapacityCents,
    ),
  };
}
