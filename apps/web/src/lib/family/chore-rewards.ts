// SPDX-License-Identifier: BUSL-1.1

/**
 * Chore-linked rewards engine with approval workflow.
 *
 * Pure functions for chore definition, completion tracking,
 * parent approval, reward payout calculation, and streak bonuses.
 * All monetary values in integer cents.
 *
 * References: #1798
 */

import type { Chore, ChoreCompletion, ApprovalStatus, RecurrenceFrequency } from './types';
import { bankersRound, safeDivide } from './utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of consecutive completions required for a streak bonus. */
const STREAK_THRESHOLD = 5;

/** Streak bonus percentage (e.g. 10 = 10% extra). */
const STREAK_BONUS_PERCENT = 10;

// ---------------------------------------------------------------------------
// Chore management
// ---------------------------------------------------------------------------

/**
 * Creates a new chore definition.
 *
 * @param params - Chore creation parameters
 * @returns A new Chore object
 * @throws If rewardCents is negative
 */
export function createChore(params: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly rewardCents: number;
  readonly assignedTo: string;
  readonly recurrence: RecurrenceFrequency | null;
  readonly now: string;
}): Chore {
  if (params.rewardCents < 0) {
    throw new RangeError('Reward amount cannot be negative');
  }
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    rewardCents: params.rewardCents,
    assignedTo: params.assignedTo,
    recurrence: params.recurrence,
    active: true,
    createdAt: params.now,
  };
}

/**
 * Deactivates a chore.
 *
 * @param chore - The chore to deactivate
 * @returns Updated chore with active=false
 */
export function deactivateChore(chore: Chore): Chore {
  return { ...chore, active: false };
}

/**
 * Reassigns a chore to a different member (for rotation scheduling).
 *
 * @param chore - The chore to reassign
 * @param newAssignee - New member ID
 * @returns Updated chore
 */
export function reassignChore(chore: Chore, newAssignee: string): Chore {
  return { ...chore, assignedTo: newAssignee };
}

/**
 * Rotates a chore assignment through a list of members.
 *
 * @param chore - The current chore
 * @param members - Ordered list of member IDs to rotate through
 * @returns Updated chore assigned to the next member in rotation
 */
export function rotateChoreAssignment(chore: Chore, members: readonly string[]): Chore {
  if (members.length === 0) return chore;
  const currentIndex = members.indexOf(chore.assignedTo);
  const nextIndex = (currentIndex + 1) % members.length;
  return { ...chore, assignedTo: members[nextIndex] };
}

// ---------------------------------------------------------------------------
// Completion & streaks
// ---------------------------------------------------------------------------

/**
 * Counts the current streak of consecutive approved completions
 * for a specific chore.
 *
 * @param completions - All completions, sorted by completedAt ascending
 * @param choreId - The chore to check
 * @returns Current streak count
 */
export function calculateStreak(completions: readonly ChoreCompletion[], choreId: string): number {
  const choreCompletions = completions.filter(
    (c) => c.choreId === choreId && c.status === 'approved',
  );
  // Count from the end backwards
  let streak = 0;
  for (let i = choreCompletions.length - 1; i >= 0; i--) {
    if (choreCompletions[i].status === 'approved') {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Calculates the reward for a chore completion including streak bonus.
 *
 * @param chore - The chore being completed
 * @param currentStreak - Number of consecutive approved completions (before this one)
 * @returns Reward in cents (base + streak bonus if applicable)
 */
export function calculateReward(
  chore: Chore,
  currentStreak: number,
): { readonly rewardCents: number; readonly streakBonusApplied: boolean } {
  // Streak is applied when the NEXT completion would be at the threshold
  const qualifiesForBonus =
    currentStreak + 1 >= STREAK_THRESHOLD && (currentStreak + 1) % STREAK_THRESHOLD === 0;

  if (qualifiesForBonus) {
    const bonus = bankersRound(safeDivide(chore.rewardCents * STREAK_BONUS_PERCENT, 100));
    return {
      rewardCents: chore.rewardCents + bonus,
      streakBonusApplied: true,
    };
  }

  return {
    rewardCents: chore.rewardCents,
    streakBonusApplied: false,
  };
}

/**
 * Records a chore completion (pending approval).
 *
 * @param params - Completion parameters
 * @returns A new ChoreCompletion in pending status
 */
export function recordCompletion(params: {
  readonly id: string;
  readonly chore: Chore;
  readonly completedBy: string;
  readonly currentStreak: number;
  readonly now: string;
}): ChoreCompletion {
  const { rewardCents, streakBonusApplied } = calculateReward(params.chore, params.currentStreak);

  return {
    id: params.id,
    choreId: params.chore.id,
    completedBy: params.completedBy,
    status: 'pending',
    rewardCents,
    streakBonusApplied,
    completedAt: params.now,
    reviewedAt: '',
  };
}

/**
 * Approves or denies a pending chore completion.
 *
 * @param completion - The pending completion
 * @param decision - Approve or deny
 * @param now - Current ISO-8601 timestamp
 * @returns Updated completion with the decision
 * @throws If the completion is not pending
 */
export function reviewCompletion(
  completion: ChoreCompletion,
  decision: 'approved' | 'denied',
  now: string,
): ChoreCompletion {
  if (completion.status !== 'pending') {
    throw new Error(`Completion ${completion.id} is '${completion.status}', expected 'pending'`);
  }
  return {
    ...completion,
    status: decision,
    reviewedAt: now,
    // If denied, zero out reward
    rewardCents: decision === 'approved' ? completion.rewardCents : 0,
  };
}

/**
 * Computes total rewards earned from approved completions.
 *
 * @param completions - Array of completions
 * @returns Total approved rewards in cents
 */
export function totalRewardsEarned(completions: readonly ChoreCompletion[]): number {
  return completions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.rewardCents, 0);
}

/**
 * Returns completions for a specific member, optionally filtered by status.
 *
 * @param completions - All completions
 * @param memberId - Member ID to filter
 * @param status - Optional status filter
 * @returns Filtered completions
 */
export function getCompletionsForMember(
  completions: readonly ChoreCompletion[],
  memberId: string,
  status?: ApprovalStatus,
): readonly ChoreCompletion[] {
  return completions.filter(
    (c) => c.completedBy === memberId && (status === undefined || c.status === status),
  );
}
