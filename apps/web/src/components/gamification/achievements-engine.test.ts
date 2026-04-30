// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeGamification,
  getUnlockedCount,
  getAchievementsByCategory,
  type GamificationInput,
} from './achievements-engine';

function makeInput(overrides: Partial<GamificationInput> = {}): GamificationInput {
  return {
    transactionCount: 0,
    budgetAdherenceMonths: 0,
    budgetCount: 0,
    currentBudgetRatio: 0,
    goalCount: 0,
    goalsCompleted: 0,
    goalProgress: [],
    dailyLoggingStreak: 0,
    longestDailyLoggingStreak: 0,
    netWorth: 0,
    accountCount: 0,
    totalSaved: 0,
    categoriesUsed: 0,
    ...overrides,
  };
}

describe('achievements-engine', () => {
  describe('computeGamification', () => {
    it('returns all achievements with locked status for empty input', () => {
      const state = computeGamification(makeInput());
      expect(state.achievements.length).toBeGreaterThan(0);
      expect(state.achievements.every((a) => a.status === 'locked')).toBe(true);
      expect(state.totalPoints).toBe(0);
    });

    it('unlocks first-transaction when transactionCount >= 1', () => {
      const state = computeGamification(makeInput({ transactionCount: 1 }));
      const badge = state.achievements.find((a) => a.id === 'first-transaction');
      expect(badge?.status).toBe('unlocked');
      expect(badge?.progress).toBe(100);
    });

    it('shows progress for transaction-10 with partial count', () => {
      const state = computeGamification(makeInput({ transactionCount: 5 }));
      const badge = state.achievements.find((a) => a.id === 'transaction-10');
      expect(badge?.status).toBe('locked');
      expect(badge?.progress).toBe(50);
    });

    it('unlocks transaction-100 at 100 transactions', () => {
      const state = computeGamification(makeInput({ transactionCount: 100 }));
      const badge = state.achievements.find((a) => a.id === 'transaction-100');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks first-budget when budgetCount >= 1', () => {
      const state = computeGamification(makeInput({ budgetCount: 1 }));
      const badge = state.achievements.find((a) => a.id === 'first-budget');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks budget-under when budgetAdherenceMonths >= 1', () => {
      const state = computeGamification(makeInput({ budgetAdherenceMonths: 1 }));
      const badge = state.achievements.find((a) => a.id === 'budget-under');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks goal-completed when goalsCompleted >= 1', () => {
      const state = computeGamification(makeInput({ goalsCompleted: 1, goalCount: 1 }));
      const badge = state.achievements.find((a) => a.id === 'goal-completed');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks saved-1000 at $1,000 saved', () => {
      const state = computeGamification(makeInput({ totalSaved: 100000 }));
      const badge = state.achievements.find((a) => a.id === 'saved-1000');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks daily-streak-7 when longest streak >= 7', () => {
      const state = computeGamification(makeInput({ longestDailyLoggingStreak: 7 }));
      const badge = state.achievements.find((a) => a.id === 'daily-streak-7');
      expect(badge?.status).toBe('unlocked');
    });

    it('unlocks positive-net-worth when netWorth > 0 with accounts', () => {
      const state = computeGamification(makeInput({ netWorth: 100, accountCount: 1 }));
      const badge = state.achievements.find((a) => a.id === 'positive-net-worth');
      expect(badge?.status).toBe('unlocked');
    });

    it('does not unlock positive-net-worth with no accounts', () => {
      const state = computeGamification(makeInput({ netWorth: 100, accountCount: 0 }));
      const badge = state.achievements.find((a) => a.id === 'positive-net-worth');
      expect(badge?.status).toBe('locked');
    });

    it('computes total points from unlocked achievements', () => {
      const state = computeGamification(
        makeInput({ transactionCount: 1, accountCount: 1, budgetCount: 1 }),
      );
      // first-transaction (10) + first-account (10) + first-budget (15)
      expect(state.totalPoints).toBe(35);
    });

    it('assigns correct level based on points', () => {
      // 0 points = Newcomer
      expect(computeGamification(makeInput()).levelName).toBe('Newcomer');

      // 35 points = Newcomer still (threshold for Beginner is 50)
      const state35 = computeGamification(
        makeInput({ transactionCount: 1, accountCount: 1, budgetCount: 1 }),
      );
      expect(state35.levelName).toBe('Newcomer');
    });

    it('computes goal milestones correctly', () => {
      const state = computeGamification(
        makeInput({
          goalCount: 1,
          goalProgress: [
            {
              goalId: 'g1',
              goalName: 'Emergency Fund',
              currentAmount: 75000,
              targetAmount: 100000,
            },
          ],
        }),
      );
      expect(state.milestones).toHaveLength(1);
      expect(state.milestones[0].progress).toBe(75);
      expect(state.milestones[0].milestonesReached).toEqual([25, 50, 75]);
      expect(state.milestones[0].nextMilestone).toBe(100);
    });

    it('marks goal as complete when 100% reached', () => {
      const state = computeGamification(
        makeInput({
          goalCount: 1,
          goalProgress: [
            { goalId: 'g1', goalName: 'Done', currentAmount: 100000, targetAmount: 100000 },
          ],
        }),
      );
      expect(state.milestones[0].progress).toBe(100);
      expect(state.milestones[0].milestonesReached).toEqual([25, 50, 75, 100]);
      expect(state.milestones[0].nextMilestone).toBeNull();
    });

    it('includes daily logging streak data', () => {
      const state = computeGamification(
        makeInput({ dailyLoggingStreak: 5, longestDailyLoggingStreak: 12 }),
      );
      expect(state.streaks).toHaveLength(1);
      expect(state.streaks[0].current).toBe(5);
      expect(state.streaks[0].longest).toBe(12);
      expect(state.streaks[0].type).toBe('daily_logging');
    });
  });

  describe('getUnlockedCount', () => {
    it('returns count of unlocked achievements', () => {
      const state = computeGamification(makeInput({ transactionCount: 10, accountCount: 2 }));
      const count = getUnlockedCount(state.achievements);
      // first-transaction (10 >= 1), transaction-10 (10 >= 10), first-account (2 >= 1)
      expect(count).toBe(3);
    });
  });

  describe('getAchievementsByCategory', () => {
    it('filters achievements by category', () => {
      const state = computeGamification(makeInput());
      const tracking = getAchievementsByCategory(state.achievements, 'tracking');
      expect(tracking.every((a) => a.category === 'tracking')).toBe(true);
      expect(tracking.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown category entries', () => {
      const state = computeGamification(makeInput());
      const result = getAchievementsByCategory(state.achievements, 'saving');
      // Saving achievements exist
      expect(result.every((a) => a.category === 'saving')).toBe(true);
    });
  });
});
