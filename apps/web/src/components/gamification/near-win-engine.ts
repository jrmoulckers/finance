// SPDX-License-Identifier: BUSL-1.1

/**
 * Near-win engine.
 *
 * Turns the already-computed gamification state (streaks, locked badges, and
 * goal progress) into a small set of motivating "near-win" cues that nudge a
 * teen toward their next healthy-habit win — e.g. "2 more check-ins to earn
 * Getting Started", "Log today to keep your 5-day streak alive", or "One more
 * contribution to hit 50% on Car Fund".
 *
 * Design principles:
 * - Pure and deterministic: no clock reads, no randomness, no side effects.
 * - Healthy-habit framing ONLY. Cues reward consistent check-ins, saving, and
 *   on-time budgeting — never raw spending volume.
 * - Builds ON the existing engine rather than re-deriving streaks/achievements.
 *
 * Refs #2211
 */

import type { IconName } from '../icons';
import type {
  Achievement,
  GamificationState,
  GoalMilestone,
  StreakData,
} from './achievements-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The source a near-win cue is derived from. */
export type NearWinKind = 'streak' | 'goal' | 'badge';

/** A single motivating near-win cue ready to render. */
export interface NearWinCue {
  /** Stable identifier (badge id, goal id, or streak type). */
  readonly id: string;
  /** Which signal the cue is derived from. */
  readonly kind: NearWinKind;
  /** Short label naming the thing being worked toward. */
  readonly title: string;
  /** Encouraging, non-manipulative one-liner shown to the user. */
  readonly message: string;
  /**
   * Progress toward the next win (0-100), or `null` for time-sensitive cues
   * (like keep-alive) that have no meaningful percentage.
   */
  readonly progress: number | null;
  /** Decorative icon name. */
  readonly icon: IconName;
}

/** A freshly-unlocked achievement worth celebrating. */
export interface UnlockCelebration {
  readonly achievementId: string;
  readonly name: string;
  readonly description: string;
  readonly icon: IconName;
}

/** Tuning knobs for {@link computeNearWinCues}. */
export interface NearWinOptions {
  /** Max number of badge cues to surface (default 3). */
  readonly maxBadgeCues?: number;
  /** Max number of goal cues to surface (default 2). */
  readonly maxGoalCues?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCY_LOCALE = 'en-US';
const CURRENCY_CODE = 'USD';

/** Format a cents amount as a whole-dollar, locale-fixed string (e.g. "$250"). */
export function formatRemainingCurrency(cents: number): string {
  const dollars = Math.ceil(Math.max(0, cents) / 100);
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    maximumFractionDigits: 0,
  }).format(dollars);
}

/** Pluralize a singular unit noun for a count (handles consonant + y -> ies). */
export function pluralizeUnit(unit: string, count: number): string {
  if (count === 1) return unit;
  if (/[^aeiou]y$/i.test(unit)) {
    return `${unit.slice(0, -1)}ies`;
  }
  return `${unit}s`;
}

const STREAK_ICON: IconName = 'flame';
const GOAL_ICON: IconName = 'target';

// ---------------------------------------------------------------------------
// Cue builders (each pure + independently testable)
// ---------------------------------------------------------------------------

/**
 * Build a "keep your streak alive" cue when the daily streak action is still
 * pending today. Returns `null` when there is no streak to protect or the
 * action has already been completed.
 */
export function streakKeepAliveCue(
  streaks: readonly StreakData[],
  loggedToday: boolean,
): NearWinCue | null {
  const daily = streaks.find((s) => s.type === 'daily_logging');
  if (!daily || daily.current <= 0 || loggedToday) {
    return null;
  }

  return {
    id: `streak-${daily.type}`,
    kind: 'streak',
    title: daily.label,
    message: `Log today to keep your ${daily.current}-day ${daily.label.toLowerCase()} streak alive.`,
    progress: null,
    icon: STREAK_ICON,
  };
}

/**
 * Build a "one more contribution to hit X%" cue for a goal that has not yet
 * reached its next milestone. Returns `null` for completed goals or goals
 * with no further milestone.
 */
export function goalNearWinCue(milestone: GoalMilestone): NearWinCue | null {
  if (milestone.progress >= 100 || milestone.nextMilestone === null) {
    return null;
  }

  const gap = milestone.nextMilestone - milestone.progress;
  return {
    id: `goal-${milestone.goalId}`,
    kind: 'goal',
    title: milestone.goalName,
    message: `You're ${gap}% away. One more contribution to hit ${milestone.nextMilestone}% on ${milestone.goalName}.`,
    progress: milestone.progress,
    icon: GOAL_ICON,
  };
}

/**
 * Build a "N more <unit>" cue for a locked badge with a near-win metric.
 * Returns `null` for unlocked badges or badges without a healthy-habit metric.
 */
export function badgeNearWinCue(achievement: Achievement): NearWinCue | null {
  if (achievement.status === 'unlocked' || !achievement.nearWin) {
    return null;
  }

  const { remaining, unit, format } = achievement.nearWin;
  const message =
    format === 'currency'
      ? `${formatRemainingCurrency(remaining)} more ${unit} to earn ${achievement.name}.`
      : `${remaining} more ${pluralizeUnit(unit, remaining)} to earn ${achievement.name}.`;

  return {
    id: `badge-${achievement.id}`,
    kind: 'badge',
    title: achievement.name,
    message,
    progress: achievement.progress,
    icon: achievement.icon,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose the full, ordered list of near-win cues from gamification state.
 *
 * Ordering favours urgency then momentum: the streak keep-alive cue (if any)
 * comes first, then the goals closest to their next milestone, then the locked
 * badges closest to unlocking.
 */
export function computeNearWinCues(
  state: GamificationState,
  options: NearWinOptions = {},
): NearWinCue[] {
  const maxBadgeCues = options.maxBadgeCues ?? 3;
  const maxGoalCues = options.maxGoalCues ?? 2;

  const cues: NearWinCue[] = [];

  // 1. Streak keep-alive (most time-sensitive).
  const keepAlive = streakKeepAliveCue(state.streaks, state.loggedToday);
  if (keepAlive) {
    cues.push(keepAlive);
  }

  // 2. Goals closest to their next milestone.
  const goalCues = state.milestones
    .map((m) => ({ cue: goalNearWinCue(m), gap: (m.nextMilestone ?? 100) - m.progress }))
    .filter((entry): entry is { cue: NearWinCue; gap: number } => entry.cue !== null)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, maxGoalCues)
    .map((entry) => entry.cue);
  cues.push(...goalCues);

  // 3. Locked badges closest to unlocking (highest progress first).
  const badgeCues = state.achievements
    .map((a) => badgeNearWinCue(a))
    .filter((cue): cue is NearWinCue => cue !== null)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, maxBadgeCues);
  cues.push(...badgeCues);

  return cues;
}

/**
 * Determine which achievements have unlocked since the user last saw them.
 *
 * On the very first visit (`seenIds === null`) nothing is celebrated — the
 * caller should seed the seen set with the returned `unlockedIds` so that only
 * *future* unlocks trigger a celebration.
 */
export function selectNewlyUnlocked(
  achievements: readonly Achievement[],
  seenIds: readonly string[] | null,
): { seedOnly: boolean; unlockedIds: string[]; celebrations: UnlockCelebration[] } {
  const unlocked = achievements.filter((a) => a.status === 'unlocked');
  const unlockedIds = unlocked.map((a) => a.id);

  if (seenIds === null) {
    return { seedOnly: true, unlockedIds, celebrations: [] };
  }

  const seen = new Set(seenIds);
  const celebrations: UnlockCelebration[] = unlocked
    .filter((a) => !seen.has(a.id))
    .map((a) => ({
      achievementId: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
    }));

  return { seedOnly: false, unlockedIds, celebrations };
}
