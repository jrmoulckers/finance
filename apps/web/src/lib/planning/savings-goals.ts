// SPDX-License-Identifier: BUSL-1.1

/**
 * Savings goal tracking utilities.
 *
 * Computes progress, milestones, projected completion, and contribution
 * history for linked-account savings goals.
 *
 * All monetary values are in cents (integers).
 *
 * References: #1644
 */

import type { GoalContribution, GoalMilestone, LinkedGoal } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard milestone percentages. */
const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;

/** Milestone celebration messages. */
const MILESTONE_LABELS: Record<number, string> = {
  25: 'Quarter way there! 🎉',
  50: 'Halfway milestone! 🌟',
  75: 'Almost there! 🚀',
  100: 'Goal complete! 🏆',
};

// ---------------------------------------------------------------------------
// Progress computation
// ---------------------------------------------------------------------------

/**
 * Calculate progress percentage for a goal.
 *
 * @param currentCents - Current amount saved in cents
 * @param targetCents - Target amount in cents
 * @returns Progress as 0-100 integer
 */
export function calculateProgress(currentCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.min(100, Math.round((currentCents / targetCents) * 100));
}

/**
 * Generate milestones with completion status.
 *
 * @param currentCents - Current saved amount in cents
 * @param targetCents - Target amount in cents
 * @param contributionDates - Historical contribution dates for milestone dating
 * @returns Array of milestones
 */
export function generateMilestones(
  currentCents: number,
  targetCents: number,
  contributionDates?: readonly GoalContribution[],
): GoalMilestone[] {
  const progress = calculateProgress(currentCents, targetCents);

  return MILESTONE_PERCENTS.map((percent) => {
    const reached = progress >= percent;
    let reachedDate: string | null = null;

    if (reached && contributionDates && contributionDates.length > 0) {
      // Find the first contribution where running total crossed this milestone
      const thresholdCents = Math.round((targetCents * percent) / 100);
      const crossing = contributionDates.find((c) => c.runningTotalCents >= thresholdCents);
      reachedDate = crossing?.date ?? null;
    }

    return {
      percent,
      label: MILESTONE_LABELS[percent] ?? `${percent}% reached`,
      reached,
      reachedDate,
    };
  });
}

// ---------------------------------------------------------------------------
// Pace & projection
// ---------------------------------------------------------------------------

/**
 * Calculate monthly contribution pace from contribution history.
 *
 * Uses the span of contributions to compute an average monthly rate.
 *
 * @param contributions - Sorted contribution history (oldest first)
 * @returns Average monthly contribution in cents
 */
export function calculateMonthlyPace(contributions: readonly GoalContribution[]): number {
  if (contributions.length < 2) {
    // With 0 or 1 contributions, use the single contribution or 0
    return contributions.length === 1 ? contributions[0].amountCents : 0;
  }

  const firstDate = new Date(contributions[0].date);
  const lastDate = new Date(contributions[contributions.length - 1].date);
  const monthSpan = Math.max(
    1,
    (lastDate.getTime() - firstDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  );

  const totalContributed = contributions.reduce((sum, c) => sum + c.amountCents, 0);
  return Math.round(totalContributed / monthSpan);
}

/**
 * Project when a goal will be completed based on current pace.
 *
 * @param currentCents - Current saved amount in cents
 * @param targetCents - Target amount in cents
 * @param monthlyPaceCents - Monthly contribution pace in cents
 * @returns ISO-8601 projected completion date, or null if pace is zero
 */
export function projectCompletionDate(
  currentCents: number,
  targetCents: number,
  monthlyPaceCents: number,
): string | null {
  if (currentCents >= targetCents) {
    return new Date().toISOString().split('T')[0] ?? null;
  }

  if (monthlyPaceCents <= 0) {
    return null;
  }

  const remainingCents = targetCents - currentCents;
  const monthsRemaining = Math.ceil(remainingCents / monthlyPaceCents);

  const completionDate = new Date();
  completionDate.setMonth(completionDate.getMonth() + monthsRemaining);
  return completionDate.toISOString().split('T')[0] ?? null;
}

/**
 * Minimum number of dated contributions required to compute a trustworthy
 * pace/projection. A single data point cannot establish a rate over time —
 * projecting from it (as the old lump-sum shim did) produces a meaningless
 * completion date (#3381).
 */
const MIN_CONTRIBUTIONS_FOR_PACE = 2;

/**
 * Build a complete LinkedGoal from raw goal and account data.
 *
 * @param goal - Goal metadata
 * @param accountBalance - Linked account balance in cents (or null)
 * @param accountName - Linked account name (or null)
 * @param contributions - Historical contributions
 * @returns Fully computed LinkedGoal
 */
export function buildLinkedGoal(
  goal: {
    id: string;
    name: string;
    targetCents: number;
    currentCents: number;
    accountId: string | null;
  },
  accountBalance: number | null,
  accountName: string | null,
  contributions: readonly GoalContribution[],
): LinkedGoal {
  // Use account balance as current progress if linked
  const currentCents = accountBalance ?? goal.currentCents;
  const progressPercent = calculateProgress(currentCents, goal.targetCents);
  // A pace/projection is only meaningful with at least two real, dated
  // contributions. With fewer, we report zero pace and let the projection fall
  // through to null (unless the goal is already complete) rather than inventing
  // an optimistic completion date from a single point (#3381).
  const hasSufficientHistory = contributions.length >= MIN_CONTRIBUTIONS_FOR_PACE;
  const monthlyPaceCents = hasSufficientHistory ? calculateMonthlyPace(contributions) : 0;
  const projectedCompletionDate = projectCompletionDate(
    currentCents,
    goal.targetCents,
    monthlyPaceCents,
  );
  const milestones = generateMilestones(currentCents, goal.targetCents, contributions);

  return {
    goalId: goal.id,
    name: goal.name,
    targetCents: goal.targetCents,
    currentCents,
    accountId: goal.accountId,
    accountName,
    progressPercent,
    projectedCompletionDate,
    monthlyPaceCents,
    hasSufficientHistory,
    contributions: [...contributions],
    milestones,
  };
}
