// SPDX-License-Identifier: BUSL-1.1

/**
 * Alert evaluation engine for the notification system.
 *
 * Pure functions that evaluate budget thresholds, goal milestones,
 * balance alerts, and spending pace. These functions produce
 * {@link AppNotification} objects without side effects.
 *
 * All monetary calculations use integer cents to avoid floating-point errors.
 *
 * @module lib/notifications/alert-engine
 * References: #1646, #1648
 */

import type {
  AppNotification,
  BalanceAlertConfig,
  BudgetAlertConfig,
  BudgetThreshold,
  GoalAlertConfig,
  GoalMilestone,
  NotificationPreferences,
  SpendingPace,
  WeeklyPaceSummary,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique notification ID. */
function generateNotificationId(): string {
  return crypto.randomUUID();
}

/** Get the current ISO-8601 timestamp. */
function now(): string {
  return new Date().toISOString();
}

/**
 * Format cents as a display-friendly dollar string.
 * Uses Math.abs to handle negative values, and prepends sign.
 */
export function formatCentsForAlert(cents: number): string {
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remainder = absCents % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${dollars.toLocaleString()}.${String(remainder).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Budget threshold alerts (#1646)
// ---------------------------------------------------------------------------

/** Input data for evaluating a single budget. */
export interface BudgetEvalInput {
  readonly budgetId: string;
  readonly budgetName: string;
  readonly budgetAmountCents: number;
  readonly spentCents: number;
}

/**
 * Evaluate a budget against configured thresholds and return any triggered alerts.
 *
 * Uses neutral, non-shaming language per acceptance criteria.
 *
 * @param budget - Budget data to evaluate.
 * @param config - Alert configuration (thresholds to check).
 * @param alreadyFiredKeys - Set of deduplication keys that have already been shown.
 * @returns Array of notifications for newly crossed thresholds.
 */
export function evaluateBudgetThresholds(
  budget: BudgetEvalInput,
  config: BudgetAlertConfig,
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): AppNotification[] {
  if (!config.enabled || budget.budgetAmountCents <= 0) {
    return [];
  }

  const percentUsed = Math.round((budget.spentCents / budget.budgetAmountCents) * 100);
  const notifications: AppNotification[] = [];

  for (const threshold of config.thresholds) {
    if (percentUsed < threshold) {
      continue;
    }

    const deduplicationKey = `budget-${budget.budgetId}-${threshold}`;
    if (alreadyFiredKeys.has(deduplicationKey)) {
      continue;
    }

    const title = budgetThresholdTitle(threshold);
    const message = budgetThresholdMessage(
      budget.budgetName,
      threshold,
      percentUsed,
      budget.spentCents,
      budget.budgetAmountCents,
    );

    notifications.push({
      id: generateNotificationId(),
      type: 'budget_threshold',
      severity: budgetThresholdSeverity(threshold),
      title,
      message,
      createdAt: now(),
      status: 'unread',
      entityId: budget.budgetId,
      entityType: 'budget',
      actionLabel: 'View budget',
      deduplicationKey,
    });
  }

  return notifications;
}

/** Return non-shaming title text for a budget threshold alert. */
function budgetThresholdTitle(threshold: BudgetThreshold): string {
  switch (threshold) {
    case 50:
      return 'Budget halfway point';
    case 75:
      return 'Budget nearing limit';
    case 90:
      return 'Budget almost reached';
    case 100:
      return 'Budget limit reached';
  }
}

/** Return non-shaming message text for a budget threshold alert. */
function budgetThresholdMessage(
  budgetName: string,
  threshold: BudgetThreshold,
  percentUsed: number,
  spentCents: number,
  budgetAmountCents: number,
): string {
  const spent = formatCentsForAlert(spentCents);
  const total = formatCentsForAlert(budgetAmountCents);
  const remaining = formatCentsForAlert(budgetAmountCents - spentCents);

  switch (threshold) {
    case 50:
      return `${budgetName} has reached ${percentUsed}% (${spent} of ${total}). ${remaining} remaining.`;
    case 75:
      return `${budgetName} is at ${percentUsed}% (${spent} of ${total}). ${remaining} still available.`;
    case 90:
      return `${budgetName} is at ${percentUsed}% (${spent} of ${total}). Consider reviewing upcoming expenses.`;
    case 100:
      return `${budgetName} has reached its limit (${spent} of ${total}). You may want to review recent spending.`;
  }
}

/** Map budget threshold to severity level. */
function budgetThresholdSeverity(threshold: BudgetThreshold): AppNotification['severity'] {
  switch (threshold) {
    case 50:
      return 'info';
    case 75:
      return 'warning';
    case 90:
      return 'warning';
    case 100:
      return 'critical';
  }
}

// ---------------------------------------------------------------------------
// Goal milestone alerts (#1646)
// ---------------------------------------------------------------------------

/** Input data for evaluating a single goal. */
export interface GoalEvalInput {
  readonly goalId: string;
  readonly goalName: string;
  readonly targetAmountCents: number;
  readonly currentAmountCents: number;
}

/**
 * Evaluate a goal against configured milestones and return any triggered alerts.
 *
 * @param goal - Goal data to evaluate.
 * @param config - Milestone configuration.
 * @param alreadyFiredKeys - Set of deduplication keys already shown.
 * @returns Array of notifications for newly reached milestones.
 */
export function evaluateGoalMilestones(
  goal: GoalEvalInput,
  config: GoalAlertConfig,
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): AppNotification[] {
  if (!config.enabled || goal.targetAmountCents <= 0) {
    return [];
  }

  const percentComplete = Math.round((goal.currentAmountCents / goal.targetAmountCents) * 100);
  const notifications: AppNotification[] = [];

  for (const milestone of config.milestones) {
    if (percentComplete < milestone) {
      continue;
    }

    const deduplicationKey = `goal-${goal.goalId}-${milestone}`;
    if (alreadyFiredKeys.has(deduplicationKey)) {
      continue;
    }

    notifications.push({
      id: generateNotificationId(),
      type: 'goal_milestone',
      severity: milestone === 100 ? 'success' : 'info',
      title: goalMilestoneTitle(milestone),
      message: goalMilestoneMessage(goal.goalName, milestone, percentComplete, goal),
      createdAt: now(),
      status: 'unread',
      entityId: goal.goalId,
      entityType: 'goal',
      actionLabel: 'View goal',
      deduplicationKey,
    });
  }

  return notifications;
}

/** Return encouraging title text for a goal milestone alert. */
function goalMilestoneTitle(milestone: GoalMilestone): string {
  switch (milestone) {
    case 25:
      return 'Great start on your goal!';
    case 50:
      return 'Halfway to your goal!';
    case 75:
      return 'Almost there!';
    case 100:
      return 'Goal achieved! 🎉';
  }
}

/** Return encouraging message text for a goal milestone alert. */
function goalMilestoneMessage(
  goalName: string,
  milestone: GoalMilestone,
  percentComplete: number,
  goal: GoalEvalInput,
): string {
  const current = formatCentsForAlert(goal.currentAmountCents);
  const target = formatCentsForAlert(goal.targetAmountCents);

  switch (milestone) {
    case 25:
      return `${goalName} is ${percentComplete}% complete (${current} of ${target}). Keep it up!`;
    case 50:
      return `${goalName} is ${percentComplete}% complete (${current} of ${target}). You're making great progress!`;
    case 75:
      return `${goalName} is ${percentComplete}% complete (${current} of ${target}). The finish line is in sight!`;
    case 100:
      return `Congratulations! ${goalName} has been fully funded (${current} of ${target}).`;
  }
}

// ---------------------------------------------------------------------------
// Balance threshold alerts (#1646)
// ---------------------------------------------------------------------------

/** Input data for evaluating an account balance. */
export interface BalanceEvalInput {
  readonly accountId: string;
  readonly accountName: string;
  readonly balanceCents: number;
}

/**
 * Evaluate an account balance against its low-balance threshold.
 *
 * @param account - Account data to evaluate.
 * @param config - Balance alert configuration.
 * @param alreadyFiredKeys - Set of deduplication keys already shown.
 * @returns A notification if the balance is below threshold, or an empty array.
 */
export function evaluateBalanceThreshold(
  account: BalanceEvalInput,
  config: BalanceAlertConfig,
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): AppNotification[] {
  if (!config.enabled) {
    return [];
  }

  if (account.balanceCents >= config.thresholdCents) {
    return [];
  }

  const deduplicationKey = `balance-${account.accountId}-low`;
  if (alreadyFiredKeys.has(deduplicationKey)) {
    return [];
  }

  const balance = formatCentsForAlert(account.balanceCents);
  const threshold = formatCentsForAlert(config.thresholdCents);

  return [
    {
      id: generateNotificationId(),
      type: 'balance_low',
      severity: 'warning',
      title: 'Low balance notice',
      message: `${account.accountName} balance (${balance}) is below your ${threshold} threshold.`,
      createdAt: now(),
      status: 'unread',
      entityId: account.accountId,
      entityType: 'account',
      actionLabel: 'View account',
      deduplicationKey,
    },
  ];
}

// ---------------------------------------------------------------------------
// Spending pace (#1648)
// ---------------------------------------------------------------------------

/** Input for calculating spending pace. */
export interface SpendingPaceInput {
  readonly budgetId: string;
  readonly budgetName: string;
  readonly budgetAmountCents: number;
  readonly spentCents: number;
  /** ISO date string for the budget period start. */
  readonly periodStart: string;
  /** ISO date string for the budget period end. */
  readonly periodEnd: string;
  /** ISO date string for "today" (injectable for testing). */
  readonly today: string;
}

/**
 * Calculate spending pace metrics for a budget.
 *
 * @param input - Budget and period data.
 * @returns Spending pace analysis.
 */
export function calculateSpendingPace(input: SpendingPaceInput): SpendingPace {
  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);
  const today = new Date(input.today);

  const totalMs = end.getTime() - start.getTime();
  const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));

  const elapsedMs = today.getTime() - start.getTime();
  const elapsedDays = Math.max(1, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)));

  const remainingDays = Math.max(0, totalDays - elapsedDays);

  const expectedDailyPaceCents = Math.round(input.budgetAmountCents / totalDays);
  const actualDailyPaceCents = elapsedDays > 0 ? Math.round(input.spentCents / elapsedDays) : 0;

  const predictedTotalCents = actualDailyPaceCents * totalDays;
  const willOverspend = predictedTotalCents > input.budgetAmountCents;

  const remainingCents = input.budgetAmountCents - input.spentCents;

  let daysUntilExhausted: number | null = null;
  if (actualDailyPaceCents > 0 && remainingCents > 0) {
    daysUntilExhausted = Math.ceil(remainingCents / actualDailyPaceCents);
  } else if (remainingCents <= 0) {
    daysUntilExhausted = 0;
  }

  return {
    budgetId: input.budgetId,
    budgetName: input.budgetName,
    budgetAmountCents: input.budgetAmountCents,
    spentCents: input.spentCents,
    remainingCents,
    totalDays,
    elapsedDays,
    remainingDays,
    expectedDailyPaceCents,
    actualDailyPaceCents,
    isAheadOfPace: actualDailyPaceCents > expectedDailyPaceCents,
    predictedTotalCents,
    willOverspend,
    daysUntilExhausted,
    percentUsed:
      input.budgetAmountCents > 0
        ? Math.round((input.spentCents / input.budgetAmountCents) * 100)
        : 0,
    percentTimeElapsed: Math.round((elapsedDays / totalDays) * 100),
  };
}

/**
 * Generate a predictive overspend alert if the current pace will exceed budget.
 *
 * Uses non-alarmist language per acceptance criteria.
 *
 * @param pace - Calculated spending pace.
 * @param sensitivity - Alert sensitivity level.
 * @param alreadyFiredKeys - Set of deduplication keys already shown.
 * @returns A notification if overspend is predicted, or an empty array.
 */
export function evaluateSpendingPaceAlert(
  pace: SpendingPace,
  sensitivity: 'low' | 'medium' | 'high',
  alreadyFiredKeys: ReadonlySet<string> = new Set(),
): AppNotification[] {
  if (!pace.willOverspend) {
    return [];
  }

  // Apply sensitivity filter:
  // high = alert when spending exceeds pace by 10%+
  // medium = alert when spending exceeds pace by 20%+
  // low = alert when spending exceeds pace by 40%+
  const thresholdMultiplier = sensitivity === 'high' ? 1.1 : sensitivity === 'medium' ? 1.2 : 1.4;

  if (pace.actualDailyPaceCents < pace.expectedDailyPaceCents * thresholdMultiplier) {
    return [];
  }

  const deduplicationKey = `pace-${pace.budgetId}-overspend`;
  if (alreadyFiredKeys.has(deduplicationKey)) {
    return [];
  }

  const overageAmount = pace.predictedTotalCents - pace.budgetAmountCents;
  const overage = formatCentsForAlert(overageAmount);
  const remaining = formatCentsForAlert(pace.remainingCents);

  let daysMsg = '';
  if (pace.daysUntilExhausted !== null && pace.daysUntilExhausted > 0) {
    daysMsg = ` At this rate, the budget may be used up in ${pace.daysUntilExhausted} day${pace.daysUntilExhausted === 1 ? '' : 's'}.`;
  }

  return [
    {
      id: generateNotificationId(),
      type: 'predictive_overspend',
      severity: 'warning',
      title: 'Spending pace update',
      message: `${pace.budgetName} is on track to exceed its limit by ${overage}. ${remaining} remaining.${daysMsg}`,
      createdAt: now(),
      status: 'unread',
      entityId: pace.budgetId,
      entityType: 'budget',
      actionLabel: 'Review spending',
      deduplicationKey,
    },
  ];
}

/**
 * Build weekly pace summaries from daily spending data.
 *
 * @param dailySpending - Array of [isoDate, amountCents] pairs, sorted by date.
 * @param expectedWeeklyCents - Expected weekly spend at planned pace.
 * @returns Weekly pace summaries.
 */
export function buildWeeklyPaceSummaries(
  dailySpending: ReadonlyArray<readonly [string, number]>,
  expectedWeeklyCents: number,
): WeeklyPaceSummary[] {
  if (dailySpending.length === 0) {
    return [];
  }

  const weekMap = new Map<string, number>();

  for (const [dateStr, amount] of dailySpending) {
    const date = new Date(dateStr);
    // Find the Monday of this date's week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    const weekKey = monday.toISOString().slice(0, 10);

    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + amount);
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weeklySpentCents]) => ({
      weekStart,
      weeklySpentCents,
      expectedWeeklyCents,
      overPace: weeklySpentCents > expectedWeeklyCents,
    }));
}

// ---------------------------------------------------------------------------
// Quiet hours check (#1655)
// ---------------------------------------------------------------------------

/**
 * Check whether the current time falls within quiet hours.
 *
 * @param prefs - Notification preferences containing quiet hours config.
 * @param nowDate - Current date/time (injectable for testing).
 * @returns `true` if notifications should be suppressed.
 */
export function isInQuietHours(
  prefs: NotificationPreferences,
  nowDate: Date = new Date(),
): boolean {
  if (prefs.doNotDisturb) {
    return true;
  }

  if (!prefs.quietHours.enabled) {
    return false;
  }

  const [startH, startM] = prefs.quietHours.startTime.split(':').map(Number);
  const [endH, endM] = prefs.quietHours.endTime.split(':').map(Number);

  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight quiet hours (e.g. 22:00 - 07:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Minimum interval (ms) between duplicate alerts with the same dedup key. */
const RATE_LIMIT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Filter notifications to remove recently-fired duplicates.
 *
 * @param notifications - Candidate notifications.
 * @param firedTimestamps - Map of dedup key to last-fired timestamp (ms).
 * @param nowMs - Current timestamp in ms (injectable for testing).
 * @returns Filtered notifications and updated timestamp map.
 */
export function rateLimitNotifications(
  notifications: readonly AppNotification[],
  firedTimestamps: ReadonlyMap<string, number>,
  nowMs: number = Date.now(),
): {
  filtered: AppNotification[];
  updatedTimestamps: Map<string, number>;
} {
  const updatedTimestamps = new Map(firedTimestamps);
  const filtered: AppNotification[] = [];

  for (const notification of notifications) {
    const key = notification.deduplicationKey;
    if (!key) {
      filtered.push(notification);
      continue;
    }

    const lastFired = updatedTimestamps.get(key);
    if (lastFired && nowMs - lastFired < RATE_LIMIT_INTERVAL_MS) {
      continue;
    }

    filtered.push(notification);
    updatedTimestamps.set(key, nowMs);
  }

  return { filtered, updatedTimestamps };
}
