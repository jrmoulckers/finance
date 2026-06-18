// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildTeenLearningAccount } from './teen-education';
import {
  buildTeenParentReviewSummary,
  TEEN_LEARNING_HOUSEHOLD_COPY,
} from './teen-review-summaries';

describe('buildTeenParentReviewSummary', () => {
  it('summarizes earn, spend, save, and lesson activity without adult finance details', () => {
    const account = buildTeenLearningAccount({
      teenId: 'teen-1',
      displayName: 'Jordan',
      age: 15,
      seedBalanceCents: 5_000,
    });

    const summary = buildTeenParentReviewSummary(account, [
      { type: 'EARN', amountCents: 1_000, label: 'Allowance' },
      { type: 'SPEND', amountCents: 1_500, label: 'Snacks' },
      { type: 'SAVE', amountCents: 500, label: 'Headphones goal' },
      { type: 'LEARN', label: 'Needs versus wants' },
    ]);

    expect(summary.earnedCents).toBe(1_000);
    expect(summary.spentCents).toBe(1_500);
    expect(summary.savedCents).toBe(500);
    expect(summary.completedLessonCount).toBe(1);
    expect(summary.teachableMoments).toEqual([
      'Spending is ahead of earning; review tradeoffs before the next purchase.',
      'Celebrate progress toward savings challenges and discuss what made it easier to save.',
      'Ask the teen to explain one concept they practiced this week.',
      'Savings progress is visible; ask what helped and whether the next goal still feels realistic.',
    ]);
    expect(summary).not.toHaveProperty('adultAccountBalances');
    expect(summary).not.toHaveProperty('adultNetWorthCents');
    expect(summary).not.toHaveProperty('adultTransactions');
  });

  it('provides Household page copy that labels balances as practice money', () => {
    expect(TEEN_LEARNING_HOUSEHOLD_COPY).toContain('practice balances');
    expect(TEEN_LEARNING_HOUSEHOLD_COPY).toContain('do not expose adult account balances');
  });
});
