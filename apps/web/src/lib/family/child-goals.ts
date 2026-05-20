// SPDX-License-Identifier: BUSL-1.1

/**
 * Child savings goals engine with kid-friendly progress UX data.
 *
 * Pure functions for goal creation, contribution tracking, milestone
 * generation, parent matching, and progress calculation.
 * All monetary values in integer cents.
 *
 * References: #1799
 */

import type { ChildGoal, GoalContribution, GoalMilestone } from './types';
import { bankersRound, safeDivide, clamp } from './utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default milestone percentages for kid-friendly progress. */
const DEFAULT_MILESTONES: readonly { readonly percent: number; readonly label: string }[] = [
  { percent: 10, label: '🌱 Great start!' },
  { percent: 25, label: '⭐ Quarter way there!' },
  { percent: 50, label: '🎯 Halfway!' },
  { percent: 75, label: '🚀 Almost there!' },
  { percent: 90, label: '🔥 So close!' },
  { percent: 100, label: '🎉 Goal reached!' },
];

// ---------------------------------------------------------------------------
// Goal management
// ---------------------------------------------------------------------------

/**
 * Creates a new child savings goal.
 *
 * @param params - Goal creation parameters
 * @returns A new ChildGoal
 * @throws If targetCents is not positive
 */
export function createChildGoal(params: {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly targetCents: number;
  readonly parentMatchRate: number;
  readonly now: string;
}): ChildGoal {
  if (params.targetCents <= 0) {
    throw new RangeError('Target amount must be positive');
  }
  if (params.parentMatchRate < 0 || params.parentMatchRate > 1) {
    throw new RangeError('Parent match rate must be between 0 and 1');
  }

  return {
    id: params.id,
    accountId: params.accountId,
    name: params.name,
    targetCents: params.targetCents,
    currentCents: 0,
    progressPercent: 0,
    completed: false,
    parentMatchRate: params.parentMatchRate,
    createdAt: params.now,
  };
}

/**
 * Calculates the progress percentage for a goal.
 *
 * @param currentCents - Current amount saved in cents
 * @param targetCents - Target amount in cents
 * @returns Progress percentage (0-100), clamped
 */
export function calculateProgress(currentCents: number, targetCents: number): number {
  const raw = safeDivide(currentCents * 100, targetCents);
  return clamp(bankersRound(raw), 0, 100);
}

/**
 * Records a contribution to a goal and applies parent matching.
 *
 * Returns the contribution records (child + optional match) and
 * the updated goal state.
 *
 * @param goal - The current goal
 * @param params - Contribution parameters
 * @returns Updated goal and contribution records
 * @throws If amountCents is not positive
 */
export function addContribution(
  goal: ChildGoal,
  params: {
    readonly contributionId: string;
    readonly matchContributionId: string;
    readonly amountCents: number;
    readonly source: 'child' | 'reward' | 'bonus';
    readonly now: string;
  },
): {
  readonly updatedGoal: ChildGoal;
  readonly contributions: readonly GoalContribution[];
} {
  if (params.amountCents <= 0) {
    throw new RangeError('Contribution amount must be positive');
  }

  const contributions: GoalContribution[] = [
    {
      id: params.contributionId,
      goalId: goal.id,
      amountCents: params.amountCents,
      source: params.source,
      contributedAt: params.now,
    },
  ];

  let totalAdded = params.amountCents;

  // Parent matching
  if (goal.parentMatchRate > 0) {
    const matchAmount = bankersRound(params.amountCents * goal.parentMatchRate);
    if (matchAmount > 0) {
      contributions.push({
        id: params.matchContributionId,
        goalId: goal.id,
        amountCents: matchAmount,
        source: 'parent-match',
        contributedAt: params.now,
      });
      totalAdded += matchAmount;
    }
  }

  const newCurrent = goal.currentCents + totalAdded;
  // Don't exceed target for progress calculation, but allow overfunding
  const progressPercent = calculateProgress(newCurrent, goal.targetCents);
  const completed = newCurrent >= goal.targetCents;

  const updatedGoal: ChildGoal = {
    ...goal,
    currentCents: newCurrent,
    progressPercent,
    completed,
  };

  return { updatedGoal, contributions };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/**
 * Generates milestone data for a goal's current progress.
 *
 * @param goal - The child goal
 * @param now - Current ISO-8601 timestamp (used for newly-reached milestones)
 * @param existingMilestones - Previously generated milestones (to preserve dates)
 * @returns Array of goal milestones
 */
export function generateMilestones(
  goal: ChildGoal,
  now: string,
  existingMilestones?: readonly GoalMilestone[],
): readonly GoalMilestone[] {
  return DEFAULT_MILESTONES.map((m) => {
    const existing = existingMilestones?.find((e) => e.percent === m.percent);
    const reached = goal.progressPercent >= m.percent;

    if (existing?.reached) {
      // Already reached — preserve the date
      return existing;
    }

    return {
      percent: m.percent,
      label: m.label,
      reached,
      reachedDate: reached ? now : '',
    };
  });
}

/**
 * Returns milestones that were newly reached compared to a previous set.
 *
 * @param previous - Previous milestones
 * @param current - Current milestones
 * @returns Array of newly-reached milestones (for celebration UX)
 */
export function getNewlyReachedMilestones(
  previous: readonly GoalMilestone[],
  current: readonly GoalMilestone[],
): readonly GoalMilestone[] {
  return current.filter((c) => {
    const prev = previous.find((p) => p.percent === c.percent);
    return c.reached && (!prev || !prev.reached);
  });
}

/**
 * Calculates a kid-friendly progress bar representation.
 *
 * @param goal - The child goal
 * @returns Progress bar data for rendering
 */
export function getProgressBarData(goal: ChildGoal): {
  readonly percent: number;
  readonly currentFormatted: string;
  readonly targetFormatted: string;
  readonly remainingCents: number;
  readonly completed: boolean;
} {
  const remainingCents = Math.max(0, goal.targetCents - goal.currentCents);
  return {
    percent: goal.progressPercent,
    currentFormatted: formatCentsForKids(goal.currentCents),
    targetFormatted: formatCentsForKids(goal.targetCents),
    remainingCents,
    completed: goal.completed,
  };
}

/**
 * Formats cents into a kid-friendly dollar string.
 *
 * @param cents - Amount in cents
 * @returns Formatted string (e.g. "$12.50")
 */
export function formatCentsForKids(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100);
  const remainder = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${dollars}.${String(remainder).padStart(2, '0')}`;
}

/**
 * Calculates how much a parent would contribute as matching
 * for a given child contribution.
 *
 * @param childAmountCents - Child's contribution in cents
 * @param matchRate - Parent match rate (0-1)
 * @returns Parent match amount in cents (banker's rounded)
 */
export function calculateParentMatch(childAmountCents: number, matchRate: number): number {
  if (matchRate <= 0 || childAmountCents <= 0) return 0;
  return bankersRound(childAmountCents * matchRate);
}
