// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type {
  Achievement,
  GamificationState,
  GoalMilestone,
  StreakData,
} from './achievements-engine';
import {
  badgeNearWinCue,
  computeNearWinCues,
  formatRemainingCurrency,
  goalNearWinCue,
  pluralizeUnit,
  selectNewlyUnlocked,
  streakKeepAliveCue,
} from './near-win-engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBadge(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'transaction-10',
    name: 'Getting Started',
    description: 'Log 10 transactions',
    icon: 'edit',
    category: 'tracking',
    status: 'locked',
    progress: 80,
    nearWin: { remaining: 2, unit: 'check-in', format: 'count' },
    ...overrides,
  };
}

function makeStreak(overrides: Partial<StreakData> = {}): StreakData {
  return {
    current: 5,
    longest: 12,
    type: 'daily_logging',
    label: 'Daily Logging',
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<GoalMilestone> = {}): GoalMilestone {
  return {
    goalId: 'g1',
    goalName: 'Car Fund',
    progress: 40,
    milestonesReached: [25],
    nextMilestone: 50,
    ...overrides,
  };
}

function makeState(overrides: Partial<GamificationState> = {}): GamificationState {
  return {
    achievements: [],
    streaks: [],
    milestones: [],
    totalPoints: 0,
    level: 1,
    levelName: 'Newcomer',
    pointsToNextLevel: 50,
    loggedToday: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('pluralizeUnit', () => {
  it('keeps the singular form for a count of 1', () => {
    expect(pluralizeUnit('check-in', 1)).toBe('check-in');
    expect(pluralizeUnit('category', 1)).toBe('category');
  });

  it('adds an "s" for regular nouns', () => {
    expect(pluralizeUnit('check-in', 2)).toBe('check-ins');
    expect(pluralizeUnit('day', 3)).toBe('days');
    expect(pluralizeUnit('on-time month', 2)).toBe('on-time months');
  });

  it('uses "ies" for consonant + y nouns', () => {
    expect(pluralizeUnit('category', 4)).toBe('categories');
  });
});

describe('formatRemainingCurrency', () => {
  it('rounds cents up to whole dollars', () => {
    expect(formatRemainingCurrency(10000)).toBe('$100');
    expect(formatRemainingCurrency(10050)).toBe('$101');
    expect(formatRemainingCurrency(0)).toBe('$0');
  });
});

// ---------------------------------------------------------------------------
// Badge near-win
// ---------------------------------------------------------------------------

describe('badgeNearWinCue', () => {
  it('computes "N more" for a locked count badge', () => {
    const cue = badgeNearWinCue(
      makeBadge({ nearWin: { remaining: 2, unit: 'check-in', format: 'count' } }),
    );
    expect(cue).not.toBeNull();
    expect(cue?.kind).toBe('badge');
    expect(cue?.message).toBe('2 more check-ins to earn Getting Started.');
    expect(cue?.progress).toBe(80);
  });

  it('uses singular noun for a remaining of 1', () => {
    const cue = badgeNearWinCue(
      makeBadge({
        name: 'First Step',
        nearWin: { remaining: 1, unit: 'check-in', format: 'count' },
      }),
    );
    expect(cue?.message).toBe('1 more check-in to earn First Step.');
  });

  it('formats currency badges with whole dollars', () => {
    const cue = badgeNearWinCue(
      makeBadge({
        id: 'saved-1000',
        name: 'First Thousand',
        nearWin: { remaining: 25000, unit: 'saved', format: 'currency' },
      }),
    );
    expect(cue?.message).toBe('$250 more saved to earn First Thousand.');
  });

  it('returns null for unlocked badges', () => {
    expect(badgeNearWinCue(makeBadge({ status: 'unlocked' }))).toBeNull();
  });

  it('returns null when there is no near-win metric', () => {
    expect(badgeNearWinCue(makeBadge({ nearWin: undefined }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Streak keep-alive
// ---------------------------------------------------------------------------

describe('streakKeepAliveCue', () => {
  it('produces a keep-alive cue when today is still pending', () => {
    const cue = streakKeepAliveCue([makeStreak({ current: 5 })], false);
    expect(cue).not.toBeNull();
    expect(cue?.kind).toBe('streak');
    expect(cue?.progress).toBeNull();
    expect(cue?.message).toBe('Log today to keep your 5-day daily logging streak alive.');
  });

  it('returns null once today has been logged', () => {
    expect(streakKeepAliveCue([makeStreak({ current: 5 })], true)).toBeNull();
  });

  it('returns null when there is no active streak to protect', () => {
    expect(streakKeepAliveCue([makeStreak({ current: 0 })], false)).toBeNull();
    expect(streakKeepAliveCue([], false)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Goal near-win
// ---------------------------------------------------------------------------

describe('goalNearWinCue', () => {
  it('frames the next milestone as one more contribution', () => {
    const cue = goalNearWinCue(makeMilestone({ progress: 40, nextMilestone: 50 }));
    expect(cue).not.toBeNull();
    expect(cue?.kind).toBe('goal');
    expect(cue?.progress).toBe(40);
    expect(cue?.message).toBe("You're 10% away. One more contribution to hit 50% on Car Fund.");
  });

  it('returns null for a completed goal', () => {
    expect(goalNearWinCue(makeMilestone({ progress: 100, nextMilestone: null }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

describe('computeNearWinCues', () => {
  it('orders cues: keep-alive, then goals, then badges (closest first)', () => {
    const state = makeState({
      loggedToday: false,
      streaks: [makeStreak({ current: 4 })],
      milestones: [
        makeMilestone({ goalId: 'g1', goalName: 'Car Fund', progress: 45, nextMilestone: 50 }),
        makeMilestone({ goalId: 'g2', goalName: 'Trip', progress: 10, nextMilestone: 25 }),
      ],
      achievements: [
        makeBadge({
          id: 'b-far',
          name: 'Far',
          progress: 30,
          nearWin: { remaining: 7, unit: 'check-in', format: 'count' },
        }),
        makeBadge({
          id: 'b-near',
          name: 'Near',
          progress: 90,
          nearWin: { remaining: 1, unit: 'check-in', format: 'count' },
        }),
      ],
    });

    const cues = computeNearWinCues(state);
    expect(cues.map((c) => c.kind)).toEqual(['streak', 'goal', 'goal', 'badge', 'badge']);
    // Goal closest to its next milestone (Car Fund, 5% gap) comes before Trip (15% gap)
    expect(cues[1].title).toBe('Car Fund');
    expect(cues[2].title).toBe('Trip');
    // Badge closest to unlocking (highest progress) comes first
    expect(cues[3].title).toBe('Near');
    expect(cues[4].title).toBe('Far');
  });

  it('omits the keep-alive cue when today is already logged', () => {
    const state = makeState({
      loggedToday: true,
      streaks: [makeStreak({ current: 4 })],
    });
    expect(computeNearWinCues(state).some((c) => c.kind === 'streak')).toBe(false);
  });

  it('caps the number of badge and goal cues', () => {
    const state = makeState({
      achievements: Array.from({ length: 6 }, (_, i) =>
        makeBadge({ id: `b${i}`, name: `Badge ${i}`, progress: i * 10 }),
      ),
      milestones: Array.from({ length: 4 }, (_, i) =>
        makeMilestone({ goalId: `g${i}`, goalName: `Goal ${i}`, progress: 10, nextMilestone: 25 }),
      ),
    });
    const cues = computeNearWinCues(state);
    expect(cues.filter((c) => c.kind === 'badge')).toHaveLength(3);
    expect(cues.filter((c) => c.kind === 'goal')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Celebration selection
// ---------------------------------------------------------------------------

describe('selectNewlyUnlocked', () => {
  const achievements: Achievement[] = [
    makeBadge({ id: 'a', name: 'A', status: 'unlocked', nearWin: undefined }),
    makeBadge({ id: 'b', name: 'B', status: 'unlocked', nearWin: undefined }),
    makeBadge({ id: 'c', name: 'C', status: 'locked' }),
  ];

  it('only seeds on first visit (seenIds null) and celebrates nothing', () => {
    const result = selectNewlyUnlocked(achievements, null);
    expect(result.seedOnly).toBe(true);
    expect(result.celebrations).toHaveLength(0);
    expect(result.unlockedIds).toEqual(['a', 'b']);
  });

  it('celebrates only newly-unlocked badges', () => {
    const result = selectNewlyUnlocked(achievements, ['a']);
    expect(result.seedOnly).toBe(false);
    expect(result.celebrations.map((c) => c.achievementId)).toEqual(['b']);
    expect(result.celebrations[0].name).toBe('B');
  });

  it('celebrates nothing when everything has already been seen', () => {
    const result = selectNewlyUnlocked(achievements, ['a', 'b']);
    expect(result.celebrations).toHaveLength(0);
  });
});
