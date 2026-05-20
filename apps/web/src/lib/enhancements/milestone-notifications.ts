/**
 * Net-worth and goal milestone notifications.
 * Closes #1651.
 * @module enhancements/milestone-notifications
 */

import type { MilestoneNotification, MilestoneType } from './types';

/** Standard net-worth milestones in integer cents */
const NET_WORTH_MILESTONES_CENTS: readonly number[] = [
  10_000_00, // $10K
  50_000_00, // $50K
  100_000_00, // $100K
  500_000_00, // $500K
  1_000_000_00, // $1M
  5_000_000_00, // $5M
  10_000_000_00, // $10M
];

/** Celebration messages by milestone tier */
const CELEBRATION_MESSAGES: Readonly<Record<number, string>> = {
  [10_000_00]: '🎉 You crossed $10,000 in net worth!',
  [50_000_00]: '🚀 $50,000 milestone reached — incredible progress!',
  [100_000_00]: '💎 Six figures! Your net worth hit $100,000!',
  [500_000_00]: '🏆 Half a million! $500,000 net worth achieved!',
  [1_000_000_00]: '🎊 MILLIONAIRE! You reached $1,000,000 net worth!',
  [5_000_000_00]: '🌟 $5,000,000 — extraordinary wealth building!',
  [10_000_000_00]: '👑 $10,000,000 net worth. Legendary!',
};

/**
 * Detect which net-worth milestones have been newly crossed.
 * @param previousNetWorthCents - Prior net worth in integer cents
 * @param currentNetWorthCents - Current net worth in integer cents
 * @returns Milestone thresholds (in cents) that were just crossed
 */
export function detectNetWorthMilestones(
  previousNetWorthCents: number,
  currentNetWorthCents: number,
): readonly number[] {
  return NET_WORTH_MILESTONES_CENTS.filter(
    (m) => previousNetWorthCents < m && currentNetWorthCents >= m,
  );
}

/**
 * Generate milestone notifications for newly crossed net-worth thresholds.
 * @param previousCents - Previous net worth in integer cents
 * @param currentCents - Current net worth in integer cents
 * @param timestamp - ISO-8601 timestamp
 * @param idPrefix - Prefix for generated notification IDs
 * @returns Array of milestone notifications
 */
export function generateNetWorthNotifications(
  previousCents: number,
  currentCents: number,
  timestamp: string,
  idPrefix: string = 'nw',
): readonly MilestoneNotification[] {
  const crossed = detectNetWorthMilestones(previousCents, currentCents);
  return crossed.map((threshold, idx) => ({
    id: `${idPrefix}-${threshold}-${idx}`,
    type: 'net_worth' as MilestoneType,
    thresholdCents: threshold,
    title: 'Net Worth Milestone!',
    message:
      CELEBRATION_MESSAGES[threshold] ??
      `You crossed $${(threshold / 100).toLocaleString('en-US')} in net worth!`,
    timestamp,
    dismissed: false,
  }));
}

/**
 * Generate a goal completion notification.
 * @param id - Notification ID
 * @param goalName - Name of the completed goal
 * @param timestamp - ISO-8601 timestamp
 * @returns A goal completion milestone notification
 */
export function generateGoalCompletionNotification(
  id: string,
  goalName: string,
  timestamp: string,
): MilestoneNotification {
  return {
    id,
    type: 'goal_completion',
    title: 'Goal Completed!',
    message: `🎯 Congratulations! You completed your goal: "${goalName}".`,
    timestamp,
    dismissed: false,
  };
}

/**
 * Generate a streak milestone notification.
 * @param id - Notification ID
 * @param streakCount - Number of consecutive periods
 * @param streakLabel - Human label (e.g. "days of saving")
 * @param timestamp - ISO-8601 timestamp
 * @returns A streak milestone notification
 */
export function generateStreakNotification(
  id: string,
  streakCount: number,
  streakLabel: string,
  timestamp: string,
): MilestoneNotification {
  return {
    id,
    type: 'streak',
    streakCount,
    title: 'Streak Milestone!',
    message: `🔥 ${streakCount} ${streakLabel} — keep it going!`,
    timestamp,
    dismissed: false,
  };
}

/**
 * Dismiss a notification.
 * @param notification - The notification to dismiss
 * @returns Updated notification marked as dismissed
 */
export function dismissNotification(notification: MilestoneNotification): MilestoneNotification {
  return { ...notification, dismissed: true };
}

/**
 * Snooze a notification until a given date.
 * @param notification - The notification to snooze
 * @param until - ISO-8601 date to snooze until
 * @returns Updated notification with snooze date
 */
export function snoozeNotification(
  notification: MilestoneNotification,
  until: string,
): MilestoneNotification {
  return { ...notification, snoozedUntil: until };
}

/**
 * Filter notifications to only active (not dismissed, not snoozed) ones.
 * @param notifications - All notifications
 * @param currentDate - ISO-8601 current date
 * @returns Active notifications
 */
export function getActiveNotifications(
  notifications: readonly MilestoneNotification[],
  currentDate: string,
): readonly MilestoneNotification[] {
  return notifications.filter((n) => {
    if (n.dismissed) return false;
    if (n.snoozedUntil && currentDate < n.snoozedUntil) return false;
    return true;
  });
}

/**
 * Get the standard net-worth milestone thresholds.
 * @returns Array of thresholds in integer cents
 */
export function getNetWorthMilestones(): readonly number[] {
  return NET_WORTH_MILESTONES_CENTS;
}
