// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure helpers for supervised teen money-education accounts.
 *
 * The account is intentionally separate from adult household accounts: callers
 * pass only child/teen learning inputs, and the returned view never includes
 * adult balances, transactions, or net-worth data.
 *
 * References: issue #2237
 */

export type TeenLearningAction =
  | 'SIMULATED_TRANSFER'
  | 'SPENDING_CATEGORY_CHANGE'
  | 'GOAL_WITHDRAWAL'
  | 'LEARNING_PROMPT_COMPLETE';

export type TeenApprovalStatus = 'NOT_REQUIRED' | 'REQUIRES_PARENT_APPROVAL' | 'DENIED';

export interface TeenLearningEnvelope {
  readonly id: string;
  readonly name: string;
  readonly allocatedCents: number;
  readonly spentCents: number;
}

export interface TeenSavingsChallenge {
  readonly id: string;
  readonly name: string;
  readonly targetCents: number;
  readonly savedCents: number;
}

export interface TeenLearningAccountInput {
  readonly teenId: string;
  readonly displayName: string;
  readonly age: number;
  readonly seedBalanceCents?: number;
  readonly allowanceBalanceCents?: number;
  readonly completedChoreEarningsCents?: number;
  readonly envelopes?: readonly TeenLearningEnvelope[];
  readonly savingsChallenges?: readonly TeenSavingsChallenge[];
  readonly requireApprovalFor?: readonly TeenLearningAction[];
}

export interface TeenLearningAccount {
  readonly teenId: string;
  readonly displayName: string;
  readonly age: number;
  readonly learningBalanceCents: number;
  readonly envelopes: readonly TeenLearningEnvelope[];
  readonly savingsChallenges: readonly TeenSavingsChallenge[];
  readonly approvalRequiredFor: readonly TeenLearningAction[];
  readonly privacyNotice: string;
}

export interface TeenActionReview {
  readonly action: TeenLearningAction;
  readonly status: TeenApprovalStatus;
  readonly reason: string;
}

export interface TeenActivitySignal {
  readonly type: 'SAVE' | 'SPEND' | 'EARN' | 'LEARN';
  readonly amountCents?: number;
  readonly label: string;
}

export interface TeenActivitySummary {
  readonly teenId: string;
  readonly earnedCents: number;
  readonly spentCents: number;
  readonly savedCents: number;
  readonly teachableMoments: readonly string[];
  readonly privacyNotice: string;
}

function clampCents(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value ?? 0)) : 0;
}

function uniqueActions(actions: readonly TeenLearningAction[] | undefined): TeenLearningAction[] {
  return Array.from(new Set(actions ?? ['SIMULATED_TRANSFER', 'SPENDING_CATEGORY_CHANGE', 'GOAL_WITHDRAWAL']));
}

export function buildTeenLearningAccount(input: TeenLearningAccountInput): TeenLearningAccount {
  const learningBalanceCents =
    clampCents(input.seedBalanceCents) +
    clampCents(input.allowanceBalanceCents) +
    clampCents(input.completedChoreEarningsCents);

  return {
    teenId: input.teenId,
    displayName: input.displayName.trim(),
    age: input.age,
    learningBalanceCents,
    envelopes: input.envelopes ?? [],
    savingsChallenges: input.savingsChallenges ?? [],
    approvalRequiredFor: uniqueActions(input.requireApprovalFor),
    privacyNotice: 'Teen learning accounts show practice balances only; adult household finances stay hidden.',
  };
}

export function reviewTeenLearningAction(
  account: Pick<TeenLearningAccount, 'age' | 'approvalRequiredFor' | 'learningBalanceCents'>,
  action: TeenLearningAction,
  amountCents = 0,
): TeenActionReview {
  if (account.age < 13) {
    return { action, status: 'DENIED', reason: 'Teen learning accounts require a child age of at least 13.' };
  }

  if (amountCents > account.learningBalanceCents && action !== 'LEARNING_PROMPT_COMPLETE') {
    return { action, status: 'DENIED', reason: 'The simulated action exceeds the teen learning balance.' };
  }

  if (account.approvalRequiredFor.includes(action)) {
    return { action, status: 'REQUIRES_PARENT_APPROVAL', reason: 'A parent must review this learning action first.' };
  }

  return { action, status: 'NOT_REQUIRED', reason: 'This learning action can be completed without approval.' };
}

export function buildTeenActivitySummary(
  teenId: string,
  signals: readonly TeenActivitySignal[],
): TeenActivitySummary {
  const earnedCents = signals
    .filter((signal) => signal.type === 'EARN')
    .reduce((sum, signal) => sum + clampCents(signal.amountCents), 0);
  const spentCents = signals
    .filter((signal) => signal.type === 'SPEND')
    .reduce((sum, signal) => sum + clampCents(signal.amountCents), 0);
  const savedCents = signals
    .filter((signal) => signal.type === 'SAVE')
    .reduce((sum, signal) => sum + clampCents(signal.amountCents), 0);

  const teachableMoments = [
    spentCents > earnedCents ? 'Spending is ahead of earning; review tradeoffs before the next purchase.' : null,
    savedCents > 0 ? 'Celebrate progress toward savings challenges and discuss what made it easier to save.' : null,
    signals.some((signal) => signal.type === 'LEARN') ? 'Ask the teen to explain one concept they practiced this week.' : null,
  ].filter((message): message is string => Boolean(message));

  return {
    teenId,
    earnedCents,
    spentCents,
    savedCents,
    teachableMoments,
    privacyNotice: 'Summary excludes adult account balances, net worth, and transaction details.',
  };
}
