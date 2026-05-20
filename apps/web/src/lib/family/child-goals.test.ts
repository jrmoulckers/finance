// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for child savings goals engine.
 *
 * References: #1799
 */

import { describe, it, expect } from 'vitest';
import {
  createChildGoal,
  calculateProgress,
  addContribution,
  generateMilestones,
  getNewlyReachedMilestones,
  getProgressBarData,
  formatCentsForKids,
  calculateParentMatch,
} from './child-goals';

const NOW = '2025-01-15T12:00:00.000Z';

describe('child-goals', () => {
  describe('createChildGoal', () => {
    it('creates a goal with zero progress', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'New Bicycle',
        targetCents: 15000,
        parentMatchRate: 0.5,
        now: NOW,
      });
      expect(goal.currentCents).toBe(0);
      expect(goal.progressPercent).toBe(0);
      expect(goal.completed).toBe(false);
      expect(goal.parentMatchRate).toBe(0.5);
    });

    it('throws for non-positive target', () => {
      expect(() =>
        createChildGoal({
          id: 'goal-1',
          accountId: 'acc-1',
          name: 'X',
          targetCents: 0,
          parentMatchRate: 0,
          now: NOW,
        }),
      ).toThrow(RangeError);
    });

    it('throws for invalid match rate', () => {
      expect(() =>
        createChildGoal({
          id: 'goal-1',
          accountId: 'acc-1',
          name: 'X',
          targetCents: 1000,
          parentMatchRate: 1.5,
          now: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 for zero current', () => {
      expect(calculateProgress(0, 10000)).toBe(0);
    });

    it('returns 50 for halfway', () => {
      expect(calculateProgress(5000, 10000)).toBe(50);
    });

    it('returns 100 when at target', () => {
      expect(calculateProgress(10000, 10000)).toBe(100);
    });

    it('clamps to 100 when over target', () => {
      expect(calculateProgress(15000, 10000)).toBe(100);
    });

    it('handles zero target without divide-by-zero', () => {
      expect(calculateProgress(1000, 0)).toBe(0);
    });
  });

  describe('addContribution', () => {
    it('adds child contribution and parent match', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'Bicycle',
        targetCents: 10000,
        parentMatchRate: 0.5,
        now: NOW,
      });

      const { updatedGoal, contributions } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 2000,
        source: 'child',
        now: NOW,
      });

      expect(contributions).toHaveLength(2);
      expect(contributions[0].amountCents).toBe(2000);
      expect(contributions[0].source).toBe('child');
      expect(contributions[1].amountCents).toBe(1000); // 50% match
      expect(contributions[1].source).toBe('parent-match');
      expect(updatedGoal.currentCents).toBe(3000);
      expect(updatedGoal.progressPercent).toBe(30);
    });

    it('skips parent match when rate is 0', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'Toy',
        targetCents: 5000,
        parentMatchRate: 0,
        now: NOW,
      });

      const { contributions } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 1000,
        source: 'child',
        now: NOW,
      });

      expect(contributions).toHaveLength(1);
    });

    it('marks goal as completed when target reached', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'Toy',
        targetCents: 1000,
        parentMatchRate: 0,
        now: NOW,
      });

      const { updatedGoal } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 1000,
        source: 'child',
        now: NOW,
      });

      expect(updatedGoal.completed).toBe(true);
      expect(updatedGoal.progressPercent).toBe(100);
    });

    it('throws for non-positive contribution', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'X',
        targetCents: 1000,
        parentMatchRate: 0,
        now: NOW,
      });

      expect(() =>
        addContribution(goal, {
          contributionId: 'c1',
          matchContributionId: 'c2',
          amountCents: 0,
          source: 'child',
          now: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('generateMilestones', () => {
    it('marks reached milestones based on progress', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'Bicycle',
        targetCents: 10000,
        parentMatchRate: 0,
        now: NOW,
      });

      // 30% progress
      const { updatedGoal } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 3000,
        source: 'child',
        now: NOW,
      });

      const milestones = generateMilestones(updatedGoal, NOW);
      expect(milestones.find((m) => m.percent === 10)?.reached).toBe(true);
      expect(milestones.find((m) => m.percent === 25)?.reached).toBe(true);
      expect(milestones.find((m) => m.percent === 50)?.reached).toBe(false);
    });

    it('preserves existing milestone dates', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'X',
        targetCents: 1000,
        parentMatchRate: 0,
        now: NOW,
      });
      const { updatedGoal } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 500,
        source: 'child',
        now: NOW,
      });

      const existing = generateMilestones(updatedGoal, '2025-01-10T00:00:00.000Z');
      const later = generateMilestones(updatedGoal, '2025-01-20T00:00:00.000Z', existing);

      // 10% milestone should keep the earlier date
      const m10 = later.find((m) => m.percent === 10);
      expect(m10?.reachedDate).toBe('2025-01-10T00:00:00.000Z');
    });
  });

  describe('getNewlyReachedMilestones', () => {
    it('identifies newly reached milestones', () => {
      const prev = [
        { percent: 10, label: '🌱', reached: true, reachedDate: NOW },
        { percent: 25, label: '⭐', reached: false, reachedDate: '' },
      ];
      const curr = [
        { percent: 10, label: '🌱', reached: true, reachedDate: NOW },
        { percent: 25, label: '⭐', reached: true, reachedDate: NOW },
      ];
      const newMilestones = getNewlyReachedMilestones(prev, curr);
      expect(newMilestones).toHaveLength(1);
      expect(newMilestones[0].percent).toBe(25);
    });
  });

  describe('getProgressBarData', () => {
    it('returns correct progress bar data', () => {
      const goal = createChildGoal({
        id: 'goal-1',
        accountId: 'acc-1',
        name: 'Bicycle',
        targetCents: 10000,
        parentMatchRate: 0,
        now: NOW,
      });
      const { updatedGoal } = addContribution(goal, {
        contributionId: 'c1',
        matchContributionId: 'c2',
        amountCents: 5000,
        source: 'child',
        now: NOW,
      });

      const data = getProgressBarData(updatedGoal);
      expect(data.percent).toBe(50);
      expect(data.currentFormatted).toBe('$50.00');
      expect(data.targetFormatted).toBe('$100.00');
      expect(data.remainingCents).toBe(5000);
      expect(data.completed).toBe(false);
    });
  });

  describe('formatCentsForKids', () => {
    it('formats positive amounts', () => {
      expect(formatCentsForKids(1050)).toBe('$10.50');
    });

    it('formats zero', () => {
      expect(formatCentsForKids(0)).toBe('$0.00');
    });

    it('formats negative amounts', () => {
      expect(formatCentsForKids(-500)).toBe('-$5.00');
    });

    it('pads cents correctly', () => {
      expect(formatCentsForKids(5)).toBe('$0.05');
    });
  });

  describe('calculateParentMatch', () => {
    it('calculates match correctly', () => {
      expect(calculateParentMatch(2000, 0.5)).toBe(1000);
    });

    it('returns 0 for zero match rate', () => {
      expect(calculateParentMatch(2000, 0)).toBe(0);
    });

    it('returns 0 for zero contribution', () => {
      expect(calculateParentMatch(0, 0.5)).toBe(0);
    });

    it('uses bankers rounding for odd amounts', () => {
      // 333 * 0.5 = 166.5 -> banker's round to 166 (even)
      expect(calculateParentMatch(333, 0.5)).toBe(166);
    });
  });
});
