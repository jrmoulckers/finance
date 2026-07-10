// SPDX-License-Identifier: BUSL-1.1

/**
 * Snooze helpers for the notification center.
 *
 * A snoozed notification is hidden from the bell popover and the active views
 * until its {@link AppNotification.snoozedUntil} time passes, at which point it
 * is automatically restored to `unread`. These helpers are pure so the timing
 * logic can be unit-tested without React or timers.
 *
 * @module lib/notifications/snooze
 * References: #3792
 */

import type { AppNotification } from './types';

/** A selectable snooze duration offered in the UI. */
export interface SnoozeOption {
  /** Stable identifier used as a React key and in tests. */
  readonly id: 'one-hour' | 'three-hours' | 'tomorrow' | 'next-week';
  /** Short human-readable label (e.g. "1 hour"). */
  readonly label: string;
}

/** Snooze durations offered to the user, in display order. */
export const SNOOZE_OPTIONS: readonly SnoozeOption[] = [
  { id: 'one-hour', label: '1 hour' },
  { id: 'three-hours', label: '3 hours' },
  { id: 'tomorrow', label: 'Tomorrow morning' },
  { id: 'next-week', label: 'Next week' },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Compute the wake-up timestamp for a snooze option relative to `from`.
 *
 * "Tomorrow morning" resolves to 08:00 local time on the next day; "Next week"
 * resolves to 08:00 local time seven days ahead. Fixed durations add the exact
 * offset so short snoozes remain predictable.
 *
 * @param optionId - The chosen {@link SnoozeOption} id.
 * @param from - Reference time (defaults to now); injectable for testing.
 * @returns ISO-8601 timestamp at which the notification should wake.
 */
export function snoozeUntil(optionId: SnoozeOption['id'], from: Date = new Date()): string {
  switch (optionId) {
    case 'one-hour':
      return new Date(from.getTime() + HOUR_MS).toISOString();
    case 'three-hours':
      return new Date(from.getTime() + 3 * HOUR_MS).toISOString();
    case 'tomorrow': {
      const next = new Date(from.getTime() + DAY_MS);
      next.setHours(8, 0, 0, 0);
      return next.toISOString();
    }
    case 'next-week': {
      const next = new Date(from.getTime() + 7 * DAY_MS);
      next.setHours(8, 0, 0, 0);
      return next.toISOString();
    }
    default: {
      // Exhaustiveness guard — unreachable for valid SnoozeOption ids.
      const exhaustive: never = optionId;
      return exhaustive;
    }
  }
}

/**
 * Whether a snoozed notification's wake time has passed.
 *
 * Non-snoozed notifications and snoozes without a wake time are never due.
 *
 * @param notification - The notification to test.
 * @param now - Reference time in ms (defaults to `Date.now()`).
 */
export function isSnoozeExpired(notification: AppNotification, now: number = Date.now()): boolean {
  if (notification.status !== 'snoozed' || !notification.snoozedUntil) {
    return false;
  }
  const wake = new Date(notification.snoozedUntil).getTime();
  return Number.isFinite(wake) && wake <= now;
}

/**
 * Restore any snoozed notifications whose wake time has passed back to `unread`.
 *
 * Returns the same array reference when nothing changed so callers can bail out
 * of state updates cheaply.
 *
 * @param notifications - Current notifications.
 * @param now - Reference time in ms (defaults to `Date.now()`).
 */
export function wakeExpiredSnoozes(
  notifications: readonly AppNotification[],
  now: number = Date.now(),
): readonly AppNotification[] {
  let changed = false;
  const next = notifications.map((n) => {
    if (isSnoozeExpired(n, now)) {
      changed = true;
      const { snoozedUntil: _snoozedUntil, ...rest } = n;
      return { ...rest, status: 'unread' as const };
    }
    return n;
  });
  return changed ? next : notifications;
}

/**
 * Format a snoozed notification's wake time as a short, human-readable label
 * (e.g. "Snoozed until Mon 8:00 AM").
 *
 * @param isoTimestamp - The `snoozedUntil` value.
 */
export function formatSnoozeUntil(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return 'Snoozed';
  const label = date.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Snoozed until ${label}`;
}
