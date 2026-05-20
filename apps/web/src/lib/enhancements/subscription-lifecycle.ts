/**
 * Subscription lifecycle management with pause, cancel, and archive states.
 * Closes #1604.
 * @module enhancements/subscription-lifecycle
 */

import type {
  SubscriptionLifecycle,
  SubscriptionState,
  SubscriptionStateTransition,
} from './types';

/** Valid state transitions map */
const VALID_TRANSITIONS: Readonly<Record<SubscriptionState, readonly SubscriptionState[]>> = {
  active: ['paused', 'cancelled'],
  paused: ['active', 'cancelled'],
  cancelled: ['archived'],
  archived: [],
};

/**
 * Check whether a state transition is valid.
 * @param from - Current state
 * @param to - Desired next state
 * @returns `true` if the transition is permitted
 */
export function isValidTransition(from: SubscriptionState, to: SubscriptionState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Transition a subscription to a new state with history tracking.
 * @param sub - Current subscription
 * @param to - Target state
 * @param timestamp - ISO-8601 timestamp of the transition
 * @param reason - Optional human-readable reason
 * @returns Updated subscription or `null` if the transition is invalid
 */
export function transitionState(
  sub: SubscriptionLifecycle,
  to: SubscriptionState,
  timestamp: string,
  reason?: string,
): SubscriptionLifecycle | null {
  if (!isValidTransition(sub.state, to)) {
    return null;
  }

  const transition: SubscriptionStateTransition = {
    from: sub.state,
    to,
    timestamp,
    reason,
  };

  return {
    ...sub,
    state: to,
    history: [...sub.history, transition],
  };
}

/**
 * Pause a subscription with an optional resume date.
 * @param sub - The subscription to pause
 * @param timestamp - ISO-8601 timestamp of the pause
 * @param resumeDate - Optional ISO-8601 date to auto-resume
 * @param reason - Optional reason for pausing
 * @returns Updated subscription or `null` if transition invalid
 */
export function pauseSubscription(
  sub: SubscriptionLifecycle,
  timestamp: string,
  resumeDate?: string,
  reason?: string,
): SubscriptionLifecycle | null {
  const result = transitionState(sub, 'paused', timestamp, reason);
  if (!result) return null;
  return { ...result, resumeDate };
}

/**
 * Archive a cancelled subscription with a retention period.
 * @param sub - The subscription to archive
 * @param timestamp - ISO-8601 timestamp of the archive
 * @param retentionDays - Days to retain archived data (default 90)
 * @returns Updated subscription or `null` if transition invalid
 */
export function archiveSubscription(
  sub: SubscriptionLifecycle,
  timestamp: string,
  retentionDays: number = 90,
): SubscriptionLifecycle | null {
  const result = transitionState(sub, 'archived', timestamp, 'Archived');
  if (!result) return null;
  return { ...result, archivedDate: timestamp, retentionDays };
}

/**
 * Calculate monthly savings from paused and cancelled subscriptions.
 * Uses integer cents — no floating point.
 * @param subs - Array of subscriptions
 * @returns Total monthly savings in integer cents
 */
export function calculateMonthlySavings(subs: readonly SubscriptionLifecycle[]): number {
  return subs.reduce((total, sub) => {
    if (sub.state === 'paused' || sub.state === 'cancelled') {
      return total + sub.monthlyCostCents;
    }
    return total;
  }, 0);
}

/**
 * Get the lifecycle history for a subscription.
 * @param sub - The subscription
 * @returns Ordered list of state transitions
 */
export function getLifecycleHistory(
  sub: SubscriptionLifecycle,
): readonly SubscriptionStateTransition[] {
  return sub.history;
}

/**
 * Filter subscriptions by state.
 * @param subs - Array of subscriptions
 * @param state - State to filter by
 * @returns Subscriptions matching the given state
 */
export function filterByState(
  subs: readonly SubscriptionLifecycle[],
  state: SubscriptionState,
): readonly SubscriptionLifecycle[] {
  return subs.filter((s) => s.state === state);
}

/**
 * Check whether a paused subscription is ready to resume based on its resume date.
 * @param sub - The subscription
 * @param currentDate - ISO-8601 current date string
 * @returns `true` if the subscription should be resumed
 */
export function isReadyToResume(sub: SubscriptionLifecycle, currentDate: string): boolean {
  if (sub.state !== 'paused' || !sub.resumeDate) return false;
  return currentDate >= sub.resumeDate;
}

/**
 * Create a new subscription lifecycle in active state.
 * @param id - Unique identifier
 * @param name - Subscription name
 * @param monthlyCostCents - Monthly cost in integer cents
 * @returns A fresh active subscription
 */
export function createSubscription(
  id: string,
  name: string,
  monthlyCostCents: number,
): SubscriptionLifecycle {
  return {
    id,
    name,
    monthlyCostCents,
    state: 'active',
    history: [],
  };
}
