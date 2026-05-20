// SPDX-License-Identifier: BUSL-1.1

/**
 * Public exports for the notification system library.
 *
 * @module lib/notifications
 * References: #1646, #1648, #1655, #1659
 */

export type {
  AlertType,
  AppNotification,
  AlertChannelPreference,
  BalanceAlertConfig,
  BatchConfirmationSummary,
  BudgetAlertConfig,
  BudgetThreshold,
  GoalAlertConfig,
  GoalMilestone,
  NotificationChannel,
  NotificationId,
  NotificationPreferences,
  NotificationSeverity,
  NotificationStatus,
  QuietHoursConfig,
  SpendingPace,
  TransactionConfirmation,
  WeeklyPaceSummary,
} from './types';

export {
  DEFAULT_BUDGET_THRESHOLDS,
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_GOAL_MILESTONES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_QUIET_HOURS,
} from './types';

export {
  calculateSpendingPace,
  evaluateBalanceThreshold,
  evaluateBudgetThresholds,
  evaluateGoalMilestones,
  evaluateSpendingPaceAlert,
  buildWeeklyPaceSummaries,
  formatCentsForAlert,
  isInQuietHours,
  rateLimitNotifications,
} from './alert-engine';

export type {
  BalanceEvalInput,
  BudgetEvalInput,
  GoalEvalInput,
  SpendingPaceInput,
} from './alert-engine';

export { loadNotificationPreferences, saveNotificationPreferences } from './preferences';
