// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for privacy-preserving accountability partner and group challenge utilities.
 *
 * References: #1777
 */

import { describe, it, expect } from 'vitest';
import {
  createPartner,
  acceptPartner,
  updateStreak,
  createChallenge,
  addParticipant,
  removeParticipant,
  challengeDurationDays,
  calculateProgress,
  shareGoalProgress,
  buildLeaderboard,
  calculateStreak,
  createPrivacySafeExport,
} from './accountability';
import type { ChallengeProgress } from './types';

// ---------------------------------------------------------------------------
// Partner management
// ---------------------------------------------------------------------------

describe('createPartner', () => {
  it('creates a partner with default values', () => {
    const partner = createPartner('p1', 'Alice', '2024-01-01');
    expect(partner.id).toBe('p1');
    expect(partner.displayName).toBe('Alice');
    expect(partner.accepted).toBe(false);
    expect(partner.streakDays).toBe(0);
  });
});

describe('acceptPartner', () => {
  it('sets accepted to true', () => {
    const partner = createPartner('p1', 'Alice', '2024-01-01');
    const accepted = acceptPartner(partner);
    expect(accepted.accepted).toBe(true);
    expect(accepted.id).toBe('p1');
  });
});

describe('updateStreak', () => {
  it('updates the streak count', () => {
    const partner = createPartner('p1', 'Alice', '2024-01-01');
    const updated = updateStreak(partner, 7);
    expect(updated.streakDays).toBe(7);
  });

  it('floors streak at 0', () => {
    const partner = createPartner('p1', 'Alice', '2024-01-01');
    const updated = updateStreak(partner, -5);
    expect(updated.streakDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Challenge creation & management
// ---------------------------------------------------------------------------

describe('createChallenge', () => {
  it('creates a challenge with all fields', () => {
    const challenge = createChallenge(
      'c1',
      'No Spend Week',
      'no_spend',
      'No discretionary spending',
      '2024-01-01',
      '2024-01-07',
      7,
      ['p1', 'p2'],
    );
    expect(challenge.id).toBe('c1');
    expect(challenge.type).toBe('no_spend');
    expect(challenge.participantIds).toEqual(['p1', 'p2']);
  });
});

describe('addParticipant', () => {
  it('adds a new participant', () => {
    const challenge = createChallenge('c1', 'Test', 'custom', '', '2024-01-01', '2024-01-31', 100, [
      'p1',
    ]);
    const updated = addParticipant(challenge, 'p2');
    expect(updated.participantIds).toContain('p2');
    expect(updated.participantIds).toHaveLength(2);
  });

  it('does not duplicate existing participant', () => {
    const challenge = createChallenge('c1', 'Test', 'custom', '', '2024-01-01', '2024-01-31', 100, [
      'p1',
    ]);
    const updated = addParticipant(challenge, 'p1');
    expect(updated.participantIds).toHaveLength(1);
  });
});

describe('removeParticipant', () => {
  it('removes a participant', () => {
    const challenge = createChallenge('c1', 'Test', 'custom', '', '2024-01-01', '2024-01-31', 100, [
      'p1',
      'p2',
    ]);
    const updated = removeParticipant(challenge, 'p1');
    expect(updated.participantIds).toEqual(['p2']);
  });

  it('handles removing non-existent participant', () => {
    const challenge = createChallenge('c1', 'Test', 'custom', '', '2024-01-01', '2024-01-31', 100, [
      'p1',
    ]);
    const updated = removeParticipant(challenge, 'p999');
    expect(updated.participantIds).toEqual(['p1']);
  });
});

describe('challengeDurationDays', () => {
  it('calculates duration for a week challenge', () => {
    const challenge = createChallenge(
      'c1',
      'Test',
      'no_spend',
      '',
      '2024-01-01',
      '2024-01-08',
      7,
      [],
    );
    expect(challengeDurationDays(challenge)).toBe(7);
  });

  it('returns minimum of 1 day', () => {
    const challenge = createChallenge(
      'c1',
      'Test',
      'custom',
      '',
      '2024-01-01',
      '2024-01-01',
      1,
      [],
    );
    expect(challengeDurationDays(challenge)).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

describe('calculateProgress', () => {
  it('calculates progress as percentage', () => {
    const progress = calculateProgress('c1', 'p1', 'Alice', 50, 100, 5);
    expect(progress.progressPercent).toBe(50);
    expect(progress.completed).toBe(false);
    expect(progress.streakDays).toBe(5);
  });

  it('caps progress at 100', () => {
    const progress = calculateProgress('c1', 'p1', 'Alice', 150, 100, 10);
    expect(progress.progressPercent).toBe(100);
    expect(progress.completed).toBe(true);
  });

  it('handles zero target (divide-by-zero guard)', () => {
    const progress = calculateProgress('c1', 'p1', 'Alice', 50, 0, 0);
    expect(progress.progressPercent).toBe(0);
  });

  it('floors streak at 0', () => {
    const progress = calculateProgress('c1', 'p1', 'Alice', 0, 100, -5);
    expect(progress.streakDays).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// shareGoalProgress
// ---------------------------------------------------------------------------

describe('shareGoalProgress', () => {
  it('shares only goal name and percentage — no dollar amounts', () => {
    const shared = shareGoalProgress('Emergency Fund', 500000, 1000000);
    expect(shared.goalName).toBe('Emergency Fund');
    expect(shared.progressPercent).toBe(50);
    // Verify NO dollar amount properties
    expect('currentCents' in shared).toBe(false);
    expect('targetCents' in shared).toBe(false);
  });

  it('handles zero target', () => {
    const shared = shareGoalProgress('Goal', 100, 0);
    expect(shared.progressPercent).toBe(0);
  });

  it('caps at 100', () => {
    const shared = shareGoalProgress('Goal', 200000, 100000);
    expect(shared.progressPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

describe('buildLeaderboard', () => {
  const progressEntries: ChallengeProgress[] = [
    {
      challengeId: 'c1',
      participantId: 'p1',
      displayName: 'Alice',
      progressPercent: 75,
      streakDays: 5,
      completed: false,
      completedDate: null,
    },
    {
      challengeId: 'c1',
      participantId: 'p2',
      displayName: 'Bob',
      progressPercent: 90,
      streakDays: 3,
      completed: false,
      completedDate: null,
    },
    {
      challengeId: 'c1',
      participantId: 'p3',
      displayName: 'Carol',
      progressPercent: 100,
      streakDays: 10,
      completed: true,
      completedDate: '2024-01-15',
    },
    {
      challengeId: 'c1',
      participantId: 'p4',
      displayName: 'Dave',
      progressPercent: 75,
      streakDays: 8,
      completed: false,
      completedDate: null,
    },
  ];

  it('ranks by progress descending', () => {
    const board = buildLeaderboard(progressEntries);
    expect(board[0].displayName).toBe('Carol');
    expect(board[0].rank).toBe(1);
    expect(board[1].displayName).toBe('Bob');
    expect(board[1].rank).toBe(2);
  });

  it('breaks ties by streak descending', () => {
    const board = buildLeaderboard(progressEntries);
    // Alice (75%, 5 days) and Dave (75%, 8 days)
    const alice = board.find((e) => e.displayName === 'Alice');
    const dave = board.find((e) => e.displayName === 'Dave');
    expect(dave!.rank).toBeLessThan(alice!.rank);
  });

  it('includes NO dollar amounts', () => {
    const board = buildLeaderboard(progressEntries);
    for (const entry of board) {
      expect('amountCents' in entry).toBe(false);
      expect('dollarAmount' in entry).toBe(false);
    }
  });

  it('handles empty entries', () => {
    expect(buildLeaderboard([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Streak tracking
// ---------------------------------------------------------------------------

describe('calculateStreak', () => {
  it('calculates consecutive day streak', () => {
    const dates = ['2024-01-13', '2024-01-14', '2024-01-15'];
    expect(calculateStreak(dates, '2024-01-15')).toBe(3);
  });

  it('returns 0 for no activity', () => {
    expect(calculateStreak([], '2024-01-15')).toBe(0);
  });

  it('returns 0 if latest activity was more than 1 day ago', () => {
    const dates = ['2024-01-10', '2024-01-11'];
    expect(calculateStreak(dates, '2024-01-15')).toBe(0);
  });

  it('counts streak from yesterday', () => {
    const dates = ['2024-01-13', '2024-01-14'];
    expect(calculateStreak(dates, '2024-01-15')).toBe(2);
  });

  it('breaks streak on gap', () => {
    const dates = ['2024-01-10', '2024-01-13', '2024-01-14', '2024-01-15'];
    expect(calculateStreak(dates, '2024-01-15')).toBe(3);
  });

  it('handles duplicate dates', () => {
    const dates = ['2024-01-14', '2024-01-14', '2024-01-15', '2024-01-15'];
    expect(calculateStreak(dates, '2024-01-15')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Privacy-safe export
// ---------------------------------------------------------------------------

describe('createPrivacySafeExport', () => {
  it('creates export with only safe data', () => {
    const exported = createPrivacySafeExport(
      'Savings Challenge',
      65,
      ['groceries', 'entertainment'],
      7,
      '2024-01-01',
      '2024-01-31',
    );
    expect(exported.challengeName).toBe('Savings Challenge');
    expect(exported.progressPercent).toBe(65);
    expect(exported.categories).toEqual(['groceries', 'entertainment']);
    expect(exported.streakDays).toBe(7);
  });

  it('clamps progress to 0-100', () => {
    const over = createPrivacySafeExport('Test', 150, [], 0, '2024-01-01', '2024-01-31');
    expect(over.progressPercent).toBe(100);

    const under = createPrivacySafeExport('Test', -10, [], 0, '2024-01-01', '2024-01-31');
    expect(under.progressPercent).toBe(0);
  });

  it('floors streak at 0', () => {
    const exported = createPrivacySafeExport('Test', 50, [], -3, '2024-01-01', '2024-01-31');
    expect(exported.streakDays).toBe(0);
  });

  it('contains NO dollar amounts', () => {
    const exported = createPrivacySafeExport('Test', 50, ['food'], 5, '2024-01-01', '2024-01-31');
    const keys = Object.keys(exported);
    expect(keys).not.toContain('amountCents');
    expect(keys).not.toContain('dollarAmount');
    expect(keys).not.toContain('totalCents');
  });
});
