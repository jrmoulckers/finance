// SPDX-License-Identifier: BUSL-1.1

import type { TeenActivitySignal, TeenLearningAccount } from './teen-education';
import { buildTeenActivitySummary } from './teen-education';

export interface TeenParentReviewSummary {
  readonly teenId: string;
  readonly displayName: string;
  readonly practiceBalanceCents: number;
  readonly earnedCents: number;
  readonly spentCents: number;
  readonly savedCents: number;
  readonly completedLessonCount: number;
  readonly teachableMoments: readonly string[];
  readonly householdPageCopy: string;
  readonly privacyNotice: string;
}

export const TEEN_LEARNING_HOUSEHOLD_COPY =
  'Teen learning accounts use practice balances for coaching. They do not expose adult account balances, transactions, or net worth.';

export function buildTeenParentReviewSummary(
  account: Pick<TeenLearningAccount, 'teenId' | 'displayName' | 'learningBalanceCents'>,
  signals: readonly TeenActivitySignal[],
): TeenParentReviewSummary {
  const activity = buildTeenActivitySummary(account.teenId, signals);
  const completedLessonCount = signals.filter((signal) => signal.type === 'LEARN').length;
  const savingsPrompt =
    activity.savedCents > 0
      ? 'Savings progress is visible; ask what helped and whether the next goal still feels realistic.'
      : null;

  return {
    teenId: account.teenId,
    displayName: account.displayName,
    practiceBalanceCents: account.learningBalanceCents,
    earnedCents: activity.earnedCents,
    spentCents: activity.spentCents,
    savedCents: activity.savedCents,
    completedLessonCount,
    teachableMoments: [...activity.teachableMoments, savingsPrompt].filter(
      (message): message is string => Boolean(message),
    ),
    householdPageCopy: TEEN_LEARNING_HOUSEHOLD_COPY,
    privacyNotice: activity.privacyNotice,
  };
}
