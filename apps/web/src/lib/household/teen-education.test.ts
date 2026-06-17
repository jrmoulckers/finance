// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildTeenActivitySummary,
  buildTeenLearningAccount,
  reviewTeenLearningAction,
} from './teen-education';

describe('buildTeenLearningAccount', () => {
  it('seeds the learning balance from allowance and completed chore earnings', () => {
    const account = buildTeenLearningAccount({
      teenId: 'teen-1',
      displayName: ' Jordan ',
      age: 15,
      allowanceBalanceCents: 2_500,
      completedChoreEarningsCents: 750,
    });

    expect(account.displayName).toBe('Jordan');
    expect(account.learningBalanceCents).toBe(3_250);
    expect(account.privacyNotice).toContain('adult household finances stay hidden');
  });

  it('defaults sensitive teen actions to parent approval', () => {
    const account = buildTeenLearningAccount({ teenId: 'teen-1', displayName: 'Jordan', age: 15 });

    expect(account.approvalRequiredFor).toEqual([
      'SIMULATED_TRANSFER',
      'SPENDING_CATEGORY_CHANGE',
      'GOAL_WITHDRAWAL',
    ]);
  });
});

describe('reviewTeenLearningAction', () => {
  it('requires parent approval for guarded actions within the learning balance', () => {
    const account = buildTeenLearningAccount({
      teenId: 'teen-1',
      displayName: 'Jordan',
      age: 15,
      seedBalanceCents: 500,
    });

    expect(reviewTeenLearningAction(account, 'GOAL_WITHDRAWAL', 100).status).toBe(
      'REQUIRES_PARENT_APPROVAL',
    );
  });

  it('denies actions that exceed the learning balance', () => {
    const account = buildTeenLearningAccount({
      teenId: 'teen-1',
      displayName: 'Jordan',
      age: 15,
      seedBalanceCents: 500,
    });

    expect(reviewTeenLearningAction(account, 'SIMULATED_TRANSFER', 501).status).toBe('DENIED');
  });
});

describe('buildTeenActivitySummary', () => {
  it('creates privacy-safe teachable moments', () => {
    const summary = buildTeenActivitySummary('teen-1', [
      { type: 'EARN', amountCents: 1_000, label: 'Allowance' },
      { type: 'SPEND', amountCents: 1_500, label: 'Dining' },
      { type: 'LEARN', label: 'Needs versus wants' },
    ]);

    expect(summary.spentCents).toBe(1_500);
    expect(summary.teachableMoments).toContain(
      'Spending is ahead of earning; review tradeoffs before the next purchase.',
    );
    expect(summary.privacyNotice).toContain('excludes adult account balances');
  });
});
