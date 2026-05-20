// SPDX-License-Identifier: BUSL-1.1

/**
 * Quiet hours and focus-aware notification suppression engine.
 *
 * Manages configurable quiet hours (start/end time), focus mode detection,
 * notification queueing during suppressed periods, and delivery of queued
 * notifications when quiet hours end.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1664
 */

import type { QueuedNotification, QuietHoursConfig } from './types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default quiet hours configuration (disabled). */
export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '07:00',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  focusModeActive: false,
};

// ---------------------------------------------------------------------------
// Time parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse an "HH:MM" time string into total minutes from midnight.
 *
 * @param time - Time string in "HH:MM" 24-hour format.
 * @returns Minutes from midnight (0–1439).
 * @throws {Error} If the format is invalid.
 */
export function parseTimeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Invalid time format: "${time}". Expected "HH:MM".`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Time out of range: "${time}".`);
  }
  return hours * 60 + minutes;
}

/**
 * Extract the current time-of-day in minutes and the day-of-week from a Date.
 *
 * @param now - The current date/time.
 * @returns Object with `minuteOfDay` (0–1439) and `dayOfWeek` (0–6, 0 = Sunday).
 */
export function extractTimeInfo(now: Date): { minuteOfDay: number; dayOfWeek: number } {
  return {
    minuteOfDay: now.getHours() * 60 + now.getMinutes(),
    dayOfWeek: now.getDay(),
  };
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Determine whether the current time falls within the quiet hours window.
 *
 * Handles overnight spans (e.g. 22:00–07:00) correctly.
 *
 * @param config - Quiet hours configuration.
 * @param now    - Current date/time.
 * @returns `true` if the current time is within quiet hours.
 */
export function isInQuietHours(config: QuietHoursConfig, now: Date): boolean {
  if (!config.enabled) return false;

  const { minuteOfDay, dayOfWeek } = extractTimeInfo(now);
  if (!config.activeDays.includes(dayOfWeek)) return false;

  const start = parseTimeToMinutes(config.startTime);
  const end = parseTimeToMinutes(config.endTime);

  if (start <= end) {
    // Same-day span (e.g. 09:00–17:00)
    return minuteOfDay >= start && minuteOfDay < end;
  }
  // Overnight span (e.g. 22:00–07:00)
  return minuteOfDay >= start || minuteOfDay < end;
}

/**
 * Determine whether notifications should be suppressed right now.
 *
 * Notifications are suppressed when either quiet hours are active OR
 * focus mode is manually enabled. Critical-priority notifications are
 * never suppressed.
 *
 * @param config   - Quiet hours configuration.
 * @param now      - Current date/time.
 * @param priority - Notification priority level.
 * @returns `true` if the notification should be suppressed (queued).
 */
export function shouldSuppressNotification(
  config: QuietHoursConfig,
  now: Date,
  priority: QueuedNotification['priority'] = 'normal',
): boolean {
  // Critical notifications always break through
  if (priority === 'critical') return false;

  // Focus mode always suppresses non-critical
  if (config.focusModeActive) return true;

  return isInQuietHours(config, now);
}

/**
 * Queue a notification for later delivery.
 *
 * Appends a new notification to the existing queue. Does not mutate the
 * input array.
 *
 * @param queue        - Existing queued notifications.
 * @param notification - Notification to add to the queue.
 * @returns A new queue array with the notification appended.
 */
export function enqueueNotification(
  queue: readonly QueuedNotification[],
  notification: QueuedNotification,
): QueuedNotification[] {
  return [...queue, notification];
}

/**
 * Drain all queued notifications (deliver them when quiet hours end).
 *
 * Returns the notifications sorted by priority (high first) then by
 * trigger time (oldest first).
 *
 * @param queue - Queued notifications to deliver.
 * @returns Sorted array of notifications to deliver, and the emptied queue.
 */
export function drainNotificationQueue(queue: readonly QueuedNotification[]): {
  toDeliver: QueuedNotification[];
  remainingQueue: QueuedNotification[];
} {
  const priorityOrder: Record<QueuedNotification['priority'], number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  const sorted = [...queue].sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.triggeredAt.localeCompare(b.triggeredAt);
  });

  return { toDeliver: sorted, remainingQueue: [] };
}

/**
 * Toggle focus mode on or off.
 *
 * @param config - Current quiet hours configuration.
 * @param active - Whether focus mode should be active.
 * @returns A new configuration with focus mode updated.
 */
export function setFocusMode(config: QuietHoursConfig, active: boolean): QuietHoursConfig {
  return { ...config, focusModeActive: active };
}

/**
 * Update quiet hours time range.
 *
 * Validates the time format before applying the change.
 *
 * @param config    - Current quiet hours configuration.
 * @param startTime - New start time in "HH:MM" format.
 * @param endTime   - New end time in "HH:MM" format.
 * @returns A new configuration with updated times.
 * @throws {Error} If time format is invalid.
 */
export function updateQuietHoursTimes(
  config: QuietHoursConfig,
  startTime: string,
  endTime: string,
): QuietHoursConfig {
  // Validate formats by parsing them
  parseTimeToMinutes(startTime);
  parseTimeToMinutes(endTime);
  return { ...config, startTime, endTime };
}

/**
 * Update which days of the week quiet hours are active.
 *
 * @param config     - Current quiet hours configuration.
 * @param activeDays - Array of day-of-week numbers (0 = Sunday, 6 = Saturday).
 * @returns A new configuration with updated active days.
 */
export function updateActiveDays(
  config: QuietHoursConfig,
  activeDays: readonly number[],
): QuietHoursConfig {
  const validDays = activeDays.filter((d) => d >= 0 && d <= 6);
  return { ...config, activeDays: [...new Set(validDays)].sort() };
}
