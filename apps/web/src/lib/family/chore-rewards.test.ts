// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for chore-linked rewards engine.
 *
 * References: #1798
 */

import { describe, it, expect } from 'vitest';
import {
  createChore,
  deactivateChore,
  reassignChore,
  rotateChoreAssignment,
  calculateStreak,
  calculateReward,
  recordCompletion,
  reviewCompletion,
  totalRewardsEarned,
  getCompletionsForMember,
} from './chore-rewards';
import type { Chore, ChoreCompletion } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

function makeChore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: 'chore-1',
    title: 'Clean Room',
    description: 'Clean your bedroom',
    rewardCents: 200,
    assignedTo: 'mem-1',
    recurrence: 'weekly',
    active: true,
    createdAt: NOW,
    ...overrides,
  };
}

function makeCompletion(overrides: Partial<ChoreCompletion> = {}): ChoreCompletion {
  return {
    id: 'comp-1',
    choreId: 'chore-1',
    completedBy: 'mem-1',
    status: 'approved',
    rewardCents: 200,
    streakBonusApplied: false,
    completedAt: NOW,
    reviewedAt: NOW,
    ...overrides,
  };
}

describe('chore-rewards', () => {
  describe('createChore', () => {
    it('creates a chore with correct defaults', () => {
      const chore = createChore({
        id: 'c1',
        title: 'Dishes',
        description: 'Wash the dishes',
        rewardCents: 150,
        assignedTo: 'mem-1',
        recurrence: 'daily' as never, // not in RecurrenceFrequency but valid
        now: NOW,
      });
      // recurrence gets set from params
      expect(chore.active).toBe(true);
      expect(chore.rewardCents).toBe(150);
    });

    it('throws for negative reward', () => {
      expect(() =>
        createChore({
          id: 'c1',
          title: 'X',
          description: '',
          rewardCents: -100,
          assignedTo: 'mem-1',
          recurrence: null,
          now: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('deactivateChore', () => {
    it('sets active to false', () => {
      const chore = makeChore();
      expect(deactivateChore(chore).active).toBe(false);
    });
  });

  describe('reassignChore', () => {
    it('changes the assignee', () => {
      const chore = makeChore({ assignedTo: 'mem-1' });
      const updated = reassignChore(chore, 'mem-2');
      expect(updated.assignedTo).toBe('mem-2');
    });
  });

  describe('rotateChoreAssignment', () => {
    it('rotates to next member', () => {
      const chore = makeChore({ assignedTo: 'mem-1' });
      const rotated = rotateChoreAssignment(chore, ['mem-1', 'mem-2', 'mem-3']);
      expect(rotated.assignedTo).toBe('mem-2');
    });

    it('wraps around to first member', () => {
      const chore = makeChore({ assignedTo: 'mem-3' });
      const rotated = rotateChoreAssignment(chore, ['mem-1', 'mem-2', 'mem-3']);
      expect(rotated.assignedTo).toBe('mem-1');
    });

    it('handles empty members list', () => {
      const chore = makeChore();
      expect(rotateChoreAssignment(chore, []).assignedTo).toBe(chore.assignedTo);
    });

    it('handles assignee not in list (defaults to index 0)', () => {
      const chore = makeChore({ assignedTo: 'unknown' });
      const rotated = rotateChoreAssignment(chore, ['mem-1', 'mem-2']);
      expect(rotated.assignedTo).toBe('mem-1');
    });
  });

  describe('calculateStreak', () => {
    it('counts consecutive approved completions', () => {
      const completions = [
        makeCompletion({ id: 'c1', status: 'approved' }),
        makeCompletion({ id: 'c2', status: 'approved' }),
        makeCompletion({ id: 'c3', status: 'approved' }),
      ];
      expect(calculateStreak(completions, 'chore-1')).toBe(3);
    });

    it('returns 0 for no completions', () => {
      expect(calculateStreak([], 'chore-1')).toBe(0);
    });

    it('filters by chore ID', () => {
      const completions = [
        makeCompletion({ choreId: 'chore-1' }),
        makeCompletion({ choreId: 'chore-2' }),
      ];
      expect(calculateStreak(completions, 'chore-1')).toBe(1);
    });
  });

  describe('calculateReward', () => {
    const chore = makeChore({ rewardCents: 200 });

    it('returns base reward without streak bonus', () => {
      const result = calculateReward(chore, 2);
      expect(result.rewardCents).toBe(200);
      expect(result.streakBonusApplied).toBe(false);
    });

    it('applies streak bonus at threshold (5th completion)', () => {
      const result = calculateReward(chore, 4); // 4 previous + this = 5
      expect(result.rewardCents).toBe(220); // 200 + 10% = 220
      expect(result.streakBonusApplied).toBe(true);
    });

    it('applies streak bonus at multiple of threshold', () => {
      const result = calculateReward(chore, 9); // 9 + 1 = 10
      expect(result.streakBonusApplied).toBe(true);
    });

    it('does not apply bonus at non-threshold counts', () => {
      const result = calculateReward(chore, 5); // 5 + 1 = 6
      expect(result.streakBonusApplied).toBe(false);
    });
  });

  describe('recordCompletion', () => {
    it('creates a pending completion', () => {
      const chore = makeChore({ rewardCents: 200 });
      const completion = recordCompletion({
        id: 'comp-new',
        chore,
        completedBy: 'mem-1',
        currentStreak: 2,
        now: NOW,
      });
      expect(completion.status).toBe('pending');
      expect(completion.rewardCents).toBe(200);
      expect(completion.reviewedAt).toBe('');
    });
  });

  describe('reviewCompletion', () => {
    it('approves a completion', () => {
      const completion = makeCompletion({ status: 'pending', reviewedAt: '' });
      const reviewed = reviewCompletion(completion, 'approved', NOW);
      expect(reviewed.status).toBe('approved');
      expect(reviewed.rewardCents).toBe(200);
    });

    it('denies a completion and zeros reward', () => {
      const completion = makeCompletion({ status: 'pending', reviewedAt: '' });
      const reviewed = reviewCompletion(completion, 'denied', NOW);
      expect(reviewed.status).toBe('denied');
      expect(reviewed.rewardCents).toBe(0);
    });

    it('throws for non-pending completion', () => {
      const completion = makeCompletion({ status: 'approved' });
      expect(() => reviewCompletion(completion, 'denied', NOW)).toThrow();
    });
  });

  describe('totalRewardsEarned', () => {
    it('sums approved completion rewards', () => {
      const completions = [
        makeCompletion({ rewardCents: 200, status: 'approved' }),
        makeCompletion({ rewardCents: 300, status: 'approved' }),
        makeCompletion({ rewardCents: 100, status: 'denied' }),
        makeCompletion({ rewardCents: 150, status: 'pending' }),
      ];
      expect(totalRewardsEarned(completions)).toBe(500);
    });
  });

  describe('getCompletionsForMember', () => {
    const completions = [
      makeCompletion({ completedBy: 'mem-1', status: 'approved' }),
      makeCompletion({ completedBy: 'mem-1', status: 'pending' }),
      makeCompletion({ completedBy: 'mem-2', status: 'approved' }),
    ];

    it('filters by member', () => {
      expect(getCompletionsForMember(completions, 'mem-1')).toHaveLength(2);
    });

    it('filters by member and status', () => {
      expect(getCompletionsForMember(completions, 'mem-1', 'pending')).toHaveLength(1);
    });
  });
});
