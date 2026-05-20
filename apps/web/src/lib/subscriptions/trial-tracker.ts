// SPDX-License-Identifier: BUSL-1.1

/**
 * Free-trial expiry tracking engine.
 *
 * Tracks free trial start/end dates, calculates days remaining,
 * flags auto-renewal risk, and computes reminder scheduling.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1601, #1619
 */

import type { Subscription, TrialTrackingResult } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Milliseconds per day. */
const MS_PER_DAY = 86_400_000;

/** Default number of days before trial end to send a reminder. */
const REMINDER_DAYS_BEFORE = 3;

/** Day thresholds for urgency levels. */
const URGENCY_HIGH_DAYS = 3;
const URGENCY_MEDIUM_DAYS = 7;
const URGENCY_LOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of full days between two ISO date strings.
 *
 * Positive when `end` is after `start`, negative when before.
 *
 * @param start - Start date (ISO string).
 * @param end - End date (ISO string).
 * @returns Number of days between the two dates.
 */
export function daysBetween(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Math.floor((endMs - startMs) / MS_PER_DAY);
}

/**
 * Adds a number of days to an ISO date string and returns a new ISO date.
 *
 * @param dateStr - Base date (ISO string).
 * @param days - Number of days to add (can be negative).
 * @returns New ISO date string.
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Urgency classification
// ---------------------------------------------------------------------------

/**
 * Determines the urgency level based on days remaining.
 *
 * @param daysRemaining - Number of days until trial expiry.
 * @returns Urgency level string.
 */
export function classifyUrgency(
  daysRemaining: number,
): 'none' | 'low' | 'medium' | 'high' | 'expired' {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= URGENCY_HIGH_DAYS) return 'high';
  if (daysRemaining <= URGENCY_MEDIUM_DAYS) return 'medium';
  if (daysRemaining <= URGENCY_LOW_DAYS) return 'low';
  return 'none';
}

// ---------------------------------------------------------------------------
// Trial tracking
// ---------------------------------------------------------------------------

/**
 * Tracks the status of a subscription's free trial.
 *
 * Returns null if the subscription has no trial information.
 *
 * @param subscription - The subscription to track.
 * @param today - Current date as ISO string (for testability).
 * @returns Trial tracking result, or null if no trial exists.
 */
export function trackTrial(subscription: Subscription, today: string): TrialTrackingResult | null {
  const trial = subscription.trial;
  if (!trial) return null;

  const totalDays = daysBetween(trial.startDate, trial.endDate);
  const daysRemaining = Math.max(0, daysBetween(today, trial.endDate));
  const isExpired = daysBetween(today, trial.endDate) <= 0;

  const reminderDate = addDays(trial.endDate, -REMINDER_DAYS_BEFORE);

  return {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    startDate: trial.startDate,
    endDate: trial.endDate,
    totalDays,
    daysRemaining,
    isExpired,
    autoRenewRisk: trial.autoRenews && !isExpired,
    postTrialPriceCents: trial.postTrialPriceCents,
    reminderDate,
    urgency: classifyUrgency(isExpired ? 0 : daysRemaining),
  };
}

/**
 * Tracks all active and expiring trials from a list of subscriptions.
 *
 * Filters to subscriptions that have trial information.
 * Results are sorted by days remaining (most urgent first).
 *
 * @param subscriptions - Subscriptions to scan.
 * @param today - Current date as ISO string.
 * @returns Array of trial tracking results, sorted by urgency.
 */
export function trackAllTrials(
  subscriptions: readonly Subscription[],
  today: string,
): readonly TrialTrackingResult[] {
  const results: TrialTrackingResult[] = [];

  for (const sub of subscriptions) {
    const result = trackTrial(sub, today);
    if (result) results.push(result);
  }

  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Filters trial tracking results to only those that need a reminder.
 *
 * A trial needs a reminder when:
 * - It has not expired yet
 * - Today is on or after the reminder date
 * - Auto-renewal is enabled (risk of unexpected charge)
 *
 * @param trials - Trial tracking results to filter.
 * @param today - Current date as ISO string.
 * @returns Trials that should trigger a reminder.
 */
export function getTrialsNeedingReminder(
  trials: readonly TrialTrackingResult[],
  today: string,
): readonly TrialTrackingResult[] {
  return trials.filter((trial) => {
    if (trial.isExpired) return false;
    if (!trial.autoRenewRisk) return false;
    return today >= trial.reminderDate;
  });
}

/**
 * Calculates the total potential cost if all trials auto-renew.
 *
 * Sums the post-trial monthly cost for all active trials with auto-renewal.
 *
 * @param trials - Trial tracking results.
 * @returns Total monthly cost in cents if all auto-renewing trials convert.
 */
export function calculateAutoRenewalRisk(trials: readonly TrialTrackingResult[]): number {
  return trials.filter((t) => t.autoRenewRisk).reduce((sum, t) => sum + t.postTrialPriceCents, 0);
}
