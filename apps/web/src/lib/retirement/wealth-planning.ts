// SPDX-License-Identifier: BUSL-1.1

/**
 * Collaborative wealth planning with partner and advisor access.
 *
 * Supports joint net worth aggregation with yours/mine/ours ownership,
 * shared vs individual goal tracking, and partner contribution analysis.
 *
 * All monetary values are integer cents. Uses banker's rounding.
 *
 * References: #1744
 */

import type {
  JointNetWorth,
  OwnershipType,
  SharedGoal,
  SharedGoalProgress,
  WealthPlanAsset,
  WealthPlanLiability,
} from './types';
import { bankersRound, safeDivide } from './withdrawal-optimizer';

// ---------------------------------------------------------------------------
// Joint net worth aggregation
// ---------------------------------------------------------------------------

/**
 * Calculate joint net worth with breakdown by ownership.
 *
 * @param assets - All assets with ownership assignments.
 * @param liabilities - All liabilities with ownership assignments.
 * @returns Aggregated joint net worth breakdown.
 */
export function calculateJointNetWorth(
  assets: readonly WealthPlanAsset[],
  liabilities: readonly WealthPlanLiability[],
): JointNetWorth {
  const sumAssets = (ownership: OwnershipType) =>
    assets.filter((a) => a.ownership === ownership).reduce((sum, a) => sum + a.valueCents, 0);

  const sumLiabilities = (ownership: OwnershipType) =>
    liabilities
      .filter((l) => l.ownership === ownership)
      .reduce((sum, l) => sum + l.balanceCents, 0);

  const assetACents = sumAssets('individual-a');
  const assetBCents = sumAssets('individual-b');
  const assetJointCents = sumAssets('joint');
  const totalAssetsCents = assetACents + assetBCents + assetJointCents;

  const liabilityACents = sumLiabilities('individual-a');
  const liabilityBCents = sumLiabilities('individual-b');
  const liabilityJointCents = sumLiabilities('joint');
  const totalLiabilitiesCents = liabilityACents + liabilityBCents + liabilityJointCents;

  return {
    assetACents,
    assetBCents,
    assetJointCents,
    totalAssetsCents,
    liabilityACents,
    liabilityBCents,
    liabilityJointCents,
    totalLiabilitiesCents,
    netWorthCents: totalAssetsCents - totalLiabilitiesCents,
  };
}

// ---------------------------------------------------------------------------
// Shared goal tracking
// ---------------------------------------------------------------------------

/**
 * Calculate progress for a shared goal.
 *
 * @param goal - The shared goal.
 * @returns Progress report with contribution percentages.
 */
export function calculateSharedGoalProgress(goal: SharedGoal): SharedGoalProgress {
  const progressPercent =
    goal.targetCents > 0
      ? Math.min(100, Math.round(safeDivide(goal.currentCents * 10000, goal.targetCents)) / 100)
      : 0;

  const totalContributions = goal.contributionACents + goal.contributionBCents;

  return {
    goalId: goal.id,
    goalName: goal.name,
    progressPercent,
    remainingCents: Math.max(0, goal.targetCents - goal.currentCents),
    contributionAPercent:
      totalContributions > 0
        ? Math.round(safeDivide(goal.contributionACents * 10000, totalContributions)) / 100
        : 0,
    contributionBPercent:
      totalContributions > 0
        ? Math.round(safeDivide(goal.contributionBCents * 10000, totalContributions)) / 100
        : 0,
  };
}

/**
 * Calculate progress for multiple shared goals.
 *
 * @param goals - Array of shared goals.
 * @returns Array of progress reports.
 */
export function calculateAllSharedGoalProgress(
  goals: readonly SharedGoal[],
): readonly SharedGoalProgress[] {
  return goals.map(calculateSharedGoalProgress);
}

// ---------------------------------------------------------------------------
// Wealth plan milestones
// ---------------------------------------------------------------------------

/** Standard wealth milestones in cents. */
export const WEALTH_MILESTONES_CENTS: readonly number[] = [
  10000_00, // $10K
  25000_00, // $25K
  50000_00, // $50K
  100000_00, // $100K
  250000_00, // $250K
  500000_00, // $500K
  1000000_00, // $1M
  2500000_00, // $2.5M
  5000000_00, // $5M
  10000000_00, // $10M
];

/**
 * Determine which wealth milestones have been reached.
 *
 * @param netWorthCents - Current net worth in cents.
 * @returns Array of milestone amounts that have been reached (in cents).
 */
export function getReachedMilestones(netWorthCents: number): readonly number[] {
  return WEALTH_MILESTONES_CENTS.filter((m) => netWorthCents >= m);
}

/**
 * Get the next upcoming wealth milestone.
 *
 * @param netWorthCents - Current net worth in cents.
 * @returns Next milestone in cents, or null if all are reached.
 */
export function getNextMilestone(netWorthCents: number): number | null {
  const next = WEALTH_MILESTONES_CENTS.find((m) => netWorthCents < m);
  return next ?? null;
}

/**
 * Calculate progress towards the next wealth milestone.
 *
 * @param netWorthCents - Current net worth in cents.
 * @returns Object with next milestone, remaining amount, and progress percentage.
 */
export function getMilestoneProgress(netWorthCents: number): {
  readonly nextMilestoneCents: number | null;
  readonly remainingCents: number;
  readonly progressPercent: number;
  readonly previousMilestoneCents: number;
} {
  const next = getNextMilestone(netWorthCents);

  if (next === null) {
    return {
      nextMilestoneCents: null,
      remainingCents: 0,
      progressPercent: 100,
      previousMilestoneCents: WEALTH_MILESTONES_CENTS[WEALTH_MILESTONES_CENTS.length - 1] ?? 0,
    };
  }

  // Find the previous milestone
  const reachedMilestones = getReachedMilestones(netWorthCents);
  const previous =
    reachedMilestones.length > 0 ? (reachedMilestones[reachedMilestones.length - 1] ?? 0) : 0;

  const range = next - previous;
  const progress = netWorthCents - previous;
  const progressPercent = range > 0 ? Math.round(safeDivide(progress * 10000, range)) / 100 : 0;

  return {
    nextMilestoneCents: next,
    remainingCents: Math.max(0, next - netWorthCents),
    progressPercent,
    previousMilestoneCents: previous,
  };
}

// ---------------------------------------------------------------------------
// Partner contribution analysis
// ---------------------------------------------------------------------------

/**
 * Calculate each partner's contribution percentage to joint net worth.
 *
 * Individual assets + half of joint assets for each partner.
 *
 * @param netWorth - Joint net worth breakdown.
 * @returns Object with each partner's effective percentage.
 */
export function calculatePartnerContributions(netWorth: JointNetWorth): {
  readonly partnerAPercent: number;
  readonly partnerBPercent: number;
  readonly partnerAEffectiveCents: number;
  readonly partnerBEffectiveCents: number;
} {
  const halfJointAssets = bankersRound(netWorth.assetJointCents / 2);
  const halfJointLiabilities = bankersRound(netWorth.liabilityJointCents / 2);

  const effectiveA =
    netWorth.assetACents + halfJointAssets - netWorth.liabilityACents - halfJointLiabilities;
  const effectiveB =
    netWorth.assetBCents + halfJointAssets - netWorth.liabilityBCents - halfJointLiabilities;

  const total = effectiveA + effectiveB;

  return {
    partnerAPercent: total !== 0 ? Math.round(safeDivide(effectiveA * 10000, total)) / 100 : 50,
    partnerBPercent: total !== 0 ? Math.round(safeDivide(effectiveB * 10000, total)) / 100 : 50,
    partnerAEffectiveCents: effectiveA,
    partnerBEffectiveCents: effectiveB,
  };
}
