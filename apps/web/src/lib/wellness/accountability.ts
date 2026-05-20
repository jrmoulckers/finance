// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy-preserving accountability partner and group challenge utilities.
 *
 * Partners share goal progress and challenge results but NEVER raw
 * transaction data or dollar amounts. Only percentages, categories,
 * and streaks are shared.
 *
 * All monetary values are in integer cents (internal only — never exported).
 *
 * References: #1777
 */

import type {
  AccountabilityPartner,
  Challenge,
  ChallengeProgress,
  ChallengeType,
  LeaderboardEntry,
  PrivacySafeExport,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding: rounds half to even.
 *
 * @param value - The value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Partner management
// ---------------------------------------------------------------------------

/**
 * Create a new accountability partner.
 *
 * @param id - Unique identifier
 * @param displayName - Display name
 * @param joinedDate - Date joined (ISO string)
 * @returns A new AccountabilityPartner
 */
export function createPartner(
  id: string,
  displayName: string,
  joinedDate: string,
): AccountabilityPartner {
  return {
    id,
    displayName,
    accepted: false,
    joinedDate,
    streakDays: 0,
  };
}

/**
 * Accept a partner invitation.
 *
 * @param partner - Partner to accept
 * @returns Updated partner with accepted = true
 */
export function acceptPartner(partner: AccountabilityPartner): AccountabilityPartner {
  return { ...partner, accepted: true };
}

/**
 * Update a partner's streak.
 *
 * @param partner - Partner to update
 * @param streakDays - New streak in days
 * @returns Updated partner
 */
export function updateStreak(
  partner: AccountabilityPartner,
  streakDays: number,
): AccountabilityPartner {
  return { ...partner, streakDays: Math.max(0, streakDays) };
}

// ---------------------------------------------------------------------------
// Challenge creation & management
// ---------------------------------------------------------------------------

/**
 * Create a new challenge.
 *
 * @param id - Unique identifier
 * @param name - Challenge name
 * @param type - Challenge type
 * @param description - Description
 * @param startDate - Start date (ISO string)
 * @param endDate - End date (ISO string)
 * @param targetValue - Target value (meaning depends on type)
 * @param participantIds - Participant IDs
 * @returns A new Challenge
 */
export function createChallenge(
  id: string,
  name: string,
  type: ChallengeType,
  description: string,
  startDate: string,
  endDate: string,
  targetValue: number,
  participantIds: readonly string[],
): Challenge {
  return {
    id,
    name,
    type,
    description,
    startDate,
    endDate,
    targetValue,
    participantIds: [...participantIds],
  };
}

/**
 * Add a participant to a challenge.
 *
 * @param challenge - The challenge
 * @param participantId - ID to add
 * @returns Updated challenge
 */
export function addParticipant(challenge: Challenge, participantId: string): Challenge {
  if (challenge.participantIds.includes(participantId)) {
    return challenge;
  }
  return {
    ...challenge,
    participantIds: [...challenge.participantIds, participantId],
  };
}

/**
 * Remove a participant from a challenge.
 *
 * @param challenge - The challenge
 * @param participantId - ID to remove
 * @returns Updated challenge
 */
export function removeParticipant(challenge: Challenge, participantId: string): Challenge {
  return {
    ...challenge,
    participantIds: challenge.participantIds.filter((id) => id !== participantId),
  };
}

/**
 * Calculate the number of days in a challenge.
 *
 * @param challenge - The challenge
 * @returns Number of days (minimum 1)
 */
export function challengeDurationDays(challenge: Challenge): number {
  const startMs = new Date(challenge.startDate).getTime();
  const endMs = new Date(challenge.endDate).getTime();
  return Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

/**
 * Create a progress entry for a participant.
 *
 * Progress is expressed as a percentage only — no dollar amounts.
 *
 * @param challengeId - Challenge ID
 * @param participantId - Participant ID
 * @param displayName - Display name
 * @param currentValue - Current progress value (same unit as targetValue)
 * @param targetValue - Target value from the challenge
 * @param streakDays - Current streak
 * @returns A ChallengeProgress entry
 */
export function calculateProgress(
  challengeId: string,
  participantId: string,
  displayName: string,
  currentValue: number,
  targetValue: number,
  streakDays: number,
): ChallengeProgress {
  const progressPercent =
    targetValue > 0 ? Math.min(100, bankersRound((currentValue / targetValue) * 100)) : 0;
  const completed = progressPercent >= 100;

  return {
    challengeId,
    participantId,
    displayName,
    progressPercent,
    streakDays: Math.max(0, streakDays),
    completed,
    completedDate: completed ? (new Date().toISOString().split('T')[0] ?? null) : null,
  };
}

/**
 * Calculate goal sharing progress as a percentage.
 *
 * Shares ONLY goal name + progress percentage, NOT dollar amounts.
 *
 * @param goalName - Name of the goal
 * @param currentCents - Current progress in cents (internal)
 * @param targetCents - Target in cents (internal)
 * @returns Object with goalName and progressPercent only
 */
export function shareGoalProgress(
  goalName: string,
  currentCents: number,
  targetCents: number,
): { readonly goalName: string; readonly progressPercent: number } {
  const progressPercent =
    targetCents > 0 ? Math.min(100, bankersRound((currentCents / targetCents) * 100)) : 0;

  return { goalName, progressPercent };
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * Build a privacy-safe leaderboard from progress entries.
 *
 * Sorted by progress descending, then streak descending. Includes
 * ONLY percentages and streaks — no financial amounts.
 *
 * @param progressEntries - All participant progress entries
 * @returns Ranked leaderboard entries
 */
export function buildLeaderboard(
  progressEntries: readonly ChallengeProgress[],
): LeaderboardEntry[] {
  const sorted = [...progressEntries].sort((a, b) => {
    if (b.progressPercent !== a.progressPercent) {
      return b.progressPercent - a.progressPercent;
    }
    return b.streakDays - a.streakDays;
  });

  return sorted.map((entry, index) => ({
    displayName: entry.displayName,
    progressPercent: entry.progressPercent,
    streakDays: entry.streakDays,
    rank: index + 1,
    completed: entry.completed,
  }));
}

// ---------------------------------------------------------------------------
// Streak tracking
// ---------------------------------------------------------------------------

/**
 * Calculate streak from a list of activity dates.
 *
 * A streak is the number of consecutive days with activity ending at
 * the reference date.
 *
 * @param activityDates - Sorted ISO date strings (oldest first)
 * @param referenceDate - Current date (ISO string)
 * @returns Streak length in days
 */
export function calculateStreak(activityDates: readonly string[], referenceDate: string): number {
  if (activityDates.length === 0) return 0;

  const uniqueDates = [...new Set(activityDates)].sort().reverse();
  const refMs = new Date(referenceDate).getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  // The most recent activity must be today or yesterday
  const latestMs = new Date(uniqueDates[0]).getTime();
  const daysSinceLatest = Math.floor((refMs - latestMs) / msPerDay);
  if (daysSinceLatest > 1) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prevMs = new Date(uniqueDates[i - 1]).getTime();
    const currMs = new Date(uniqueDates[i]).getTime();
    const gap = Math.floor((prevMs - currMs) / msPerDay);
    if (gap === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Privacy-safe data export
// ---------------------------------------------------------------------------

/**
 * Create a privacy-safe export for sharing with accountability partners.
 *
 * Exports ONLY: challenge name, progress percentage, categories (no amounts),
 * streak, and time period. NEVER includes dollar amounts or transaction details.
 *
 * @param challengeName - Name of the challenge
 * @param progressPercent - Progress as 0-100 percentage
 * @param categories - Spending categories (names only, no amounts)
 * @param streakDays - Streak in days
 * @param periodStart - Period start (ISO string)
 * @param periodEnd - Period end (ISO string)
 * @returns Privacy-safe export object
 */
export function createPrivacySafeExport(
  challengeName: string,
  progressPercent: number,
  categories: readonly string[],
  streakDays: number,
  periodStart: string,
  periodEnd: string,
): PrivacySafeExport {
  return {
    challengeName,
    progressPercent: Math.min(100, Math.max(0, Math.round(progressPercent))),
    categories: [...categories],
    streakDays: Math.max(0, streakDays),
    periodStart,
    periodEnd,
  };
}
