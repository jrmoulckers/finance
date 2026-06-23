// SPDX-License-Identifier: BUSL-1.1

/**
 * Barrel for the shared-goal contribution engine (issue #2147).
 *
 * Keep this barrel small and import it only from the Goals surface so it never
 * bloats unrelated route chunks.
 */

export {
  allocateEven,
  allocateProportionally,
  buildContributorProgress,
  buildMilestoneProgress,
  householdPercentComplete,
  monthsUntil,
  relativeEffortLabel,
  suggestedMonthlyContributions,
  summarizeSharedGoal,
  totalContributedCents,
} from './shared-goal';

export type {
  ContributorProgress,
  GoalContributionPrivacy,
  GoalContributor,
  GoalMilestone,
  MilestoneProgress,
  RelativeEffort,
  SharedGoalSummary,
  SuggestedMonthlyContribution,
  SuggestedMonthlyOptions,
  SuggestedMonthlyPlan,
} from './shared-goal';
