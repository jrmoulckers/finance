// SPDX-License-Identifier: BUSL-1.1

/**
 * Relationship Transition Finance Wizard.
 *
 * Guides users through separating shared finances when a relationship
 * changes: separate accounts, divide goals, split recurring expenses,
 * reassign ownership, and review a post-transition checklist.
 *
 * This is a **premium** feature — all entry-point functions verify the
 * `isPremium` flag and return `null` or an unchanged plan when the user
 * does not have premium access.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1772
 */

import type {
  AssetDivision,
  HouseholdId,
  ISODateString,
  MemberShare,
  PostTransitionChecklistItem,
  TransitionPlan,
  TransitionStep,
  TransitionStepId,
  TransitionStepStatus,
  TransitionTimelineEvent,
  UserId,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSITION_STEPS: readonly Omit<TransitionStep, 'status'>[] = [
  {
    id: 'separate_accounts',
    title: 'Separate Shared Accounts',
    description: 'Move shared accounts to individual ownership.',
  },
  {
    id: 'divide_goals',
    title: 'Divide Shared Goals',
    description: 'Allocate shared savings goals between members.',
  },
  {
    id: 'split_recurring',
    title: 'Split Recurring Expenses',
    description: 'Reassign or cancel shared recurring expenses.',
  },
  {
    id: 'reassign_ownership',
    title: 'Reassign Ownership',
    description: 'Transfer remaining shared items to individual members.',
  },
  {
    id: 'review_checklist',
    title: 'Review Checklist',
    description: 'Verify all post-transition action items.',
  },
];

const DEFAULT_CHECKLIST: readonly Omit<PostTransitionChecklistItem, 'completed'>[] = [
  { id: 'update_auto_pay', description: 'Update automatic payment methods on shared bills.' },
  { id: 'notify_institutions', description: 'Notify financial institutions of account changes.' },
  { id: 'update_beneficiaries', description: 'Review and update beneficiary designations.' },
  { id: 'close_joint', description: 'Close any remaining joint accounts.' },
  { id: 'update_budget', description: 'Create a new individual budget.' },
];

// ---------------------------------------------------------------------------
// Plan Creation
// ---------------------------------------------------------------------------

/**
 * Create a new transition plan.
 *
 * Returns `null` if the user does not have premium access.
 *
 * @param householdId - Household undergoing transition.
 * @param isPremium - Whether the user has premium access.
 * @param now - Current ISO timestamp.
 * @returns A new {@link TransitionPlan}, or `null` if not premium.
 */
export function createTransitionPlan(
  householdId: HouseholdId,
  isPremium: boolean,
  now: ISODateString,
): TransitionPlan | null {
  if (!isPremium) return null;

  const steps: TransitionStep[] = TRANSITION_STEPS.map((s) => ({
    ...s,
    status: 'pending' as const,
  }));

  return {
    householdId,
    isPremium,
    steps,
    currentStepIndex: 0,
    createdAt: now,
    completedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Step Navigation
// ---------------------------------------------------------------------------

/**
 * Advance the current step to a new status.
 *
 * @param plan - Current transition plan.
 * @param status - New status for the current step.
 * @param now - Current ISO timestamp (used when completing the final step).
 * @returns Updated plan (unchanged if not premium or out of bounds).
 */
export function advanceStep(
  plan: TransitionPlan,
  status: TransitionStepStatus,
  now: ISODateString,
): TransitionPlan {
  if (!plan.isPremium) return plan;
  const { steps, currentStepIndex } = plan;
  if (currentStepIndex >= steps.length) return plan;

  const updatedSteps = steps.map((s, i) => (i === currentStepIndex ? { ...s, status } : s));

  const shouldAdvance = status === 'completed' || status === 'skipped';
  const nextIndex = shouldAdvance ? currentStepIndex + 1 : currentStepIndex;
  const isFinished = nextIndex >= steps.length;

  return {
    ...plan,
    steps: updatedSteps,
    currentStepIndex: isFinished ? currentStepIndex : nextIndex,
    completedAt: isFinished ? now : null,
  };
}

/**
 * Return the current step of the plan.
 *
 * @param plan - Current transition plan.
 * @returns The current {@link TransitionStep}, or `null` if finished.
 */
export function getCurrentTransitionStep(plan: TransitionPlan): TransitionStep | null {
  return plan.steps[plan.currentStepIndex] ?? null;
}

/**
 * Check whether the entire transition plan is complete.
 *
 * @param plan - Current transition plan.
 * @returns `true` when all steps are completed or skipped.
 */
export function isTransitionComplete(plan: TransitionPlan): boolean {
  return plan.steps.every((s) => s.status === 'completed' || s.status === 'skipped');
}

// ---------------------------------------------------------------------------
// Asset Division Calculator
// ---------------------------------------------------------------------------

/**
 * Divide a total amount among members using banker's rounding.
 *
 * Any rounding remainder is allocated to the first member so the sum
 * of shares always equals the total exactly.
 *
 * @param totalCents - Total amount in cents to divide.
 * @param memberIds - IDs of the members sharing the amount.
 * @returns An {@link AssetDivision} with per-member shares and a fairness flag.
 */
export function divideAssets(totalCents: number, memberIds: readonly UserId[]): AssetDivision {
  if (memberIds.length === 0) {
    return { totalCents, shares: [], isFair: true };
  }

  const count = memberIds.length;
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;

  const shares: MemberShare[] = memberIds.map((userId, i) => {
    const amountCents = baseCents + (i < remainder ? 1 : 0);
    return {
      userId,
      amountCents,
      percentage: totalCents === 0 ? 0 : bankersRoundPercent(amountCents, totalCents),
    };
  });

  // Fair if the max deviation between any two shares is ≤ 1 cent
  const amounts = shares.map((s) => s.amountCents);
  const maxDev = Math.max(...amounts) - Math.min(...amounts);
  const isFair = maxDev <= 1;

  return { totalCents, shares, isFair };
}

/**
 * Divide assets using custom percentage weights.
 *
 * Weights must sum to 100. Any rounding remainder goes to the first member.
 *
 * @param totalCents - Total amount in cents.
 * @param members - Array of `{ userId, weight }` where weight is a percentage (0–100).
 * @returns An {@link AssetDivision}.
 */
export function divideAssetsByWeight(
  totalCents: number,
  members: readonly { userId: UserId; weight: number }[],
): AssetDivision {
  if (members.length === 0) {
    return { totalCents, shares: [], isFair: true };
  }

  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);

  if (totalWeight === 0) {
    return {
      totalCents,
      shares: members.map((m) => ({
        userId: m.userId,
        amountCents: 0,
        percentage: 0,
      })),
      isFair: true,
    };
  }

  const rawShares: MemberShare[] = members.map((m) => {
    const fraction = m.weight / totalWeight;
    const amountCents = Math.floor(totalCents * fraction);
    return {
      userId: m.userId,
      amountCents,
      percentage: bankersRoundPercent(m.weight, totalWeight),
    };
  });

  // Distribute remainder to first member
  const allocated = rawShares.reduce((s, sh) => s + sh.amountCents, 0);
  const diff = totalCents - allocated;
  if (diff !== 0 && rawShares.length > 0) {
    rawShares[0] = { ...rawShares[0], amountCents: rawShares[0].amountCents + diff };
  }

  const amounts = rawShares.map((s) => s.amountCents);
  const maxDev = Math.max(...amounts) - Math.min(...amounts);
  const isFair = maxDev <= 1;

  return { totalCents, shares: rawShares, isFair };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Build a timeline event for a step transition.
 *
 * @param stepId - The step that changed.
 * @param status - The new status.
 * @param now - Current ISO timestamp.
 * @param note - Optional note.
 * @returns A {@link TransitionTimelineEvent}.
 */
export function createTimelineEvent(
  stepId: TransitionStepId,
  status: TransitionStepStatus,
  now: ISODateString,
  note: string = '',
): TransitionTimelineEvent {
  return { stepId, status, timestamp: now, note };
}

// ---------------------------------------------------------------------------
// Post-Transition Checklist
// ---------------------------------------------------------------------------

/**
 * Return the default post-transition checklist.
 *
 * @returns Array of {@link PostTransitionChecklistItem} with all items uncompleted.
 */
export function getDefaultChecklist(): PostTransitionChecklistItem[] {
  return DEFAULT_CHECKLIST.map((item) => ({ ...item, completed: false }));
}

/**
 * Toggle a checklist item's completed status.
 *
 * @param checklist - Current checklist.
 * @param itemId - The item to toggle.
 * @returns Updated checklist.
 */
export function toggleChecklistItem(
  checklist: readonly PostTransitionChecklistItem[],
  itemId: string,
): PostTransitionChecklistItem[] {
  return checklist.map((item) =>
    item.id === itemId ? { ...item, completed: !item.completed } : item,
  );
}

/**
 * Check whether all checklist items are completed.
 *
 * @param checklist - Current checklist.
 * @returns `true` when every item is completed.
 */
export function isChecklistComplete(checklist: readonly PostTransitionChecklistItem[]): boolean {
  return checklist.length > 0 && checklist.every((item) => item.completed);
}

// ---------------------------------------------------------------------------
// Premium Gate
// ---------------------------------------------------------------------------

/**
 * Check whether a user has premium access for the transition wizard.
 *
 * This is a pure check — in production the `isPremium` flag would come
 * from subscription state.
 *
 * @param isPremium - Whether the user is a premium subscriber.
 * @returns `true` if the feature is accessible.
 */
export function hasPremiumAccess(isPremium: boolean): boolean {
  return isPremium;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function bankersRoundPercent(part: number, total: number): number {
  if (total === 0) return 0;
  const raw = (part / total) * 100;
  const factor = 100; // 2 decimal places
  const shifted = raw * factor;
  const floored = Math.floor(shifted);
  const diff = shifted - floored;
  if (Math.abs(diff - 0.5) < 1e-9) {
    return (floored % 2 === 0 ? floored : floored + 1) / factor;
  }
  return Math.round(shifted) / factor;
}
