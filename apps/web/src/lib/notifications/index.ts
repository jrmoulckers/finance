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
  AccountTransactionThreshold,
  AlertChannelPreference,
  BalanceAlertConfig,
  BatchConfirmationSummary,
  BillReminderConfig,
  BillReminderLeadDays,
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
  shouldDeliverNotification,
} from './alert-engine';

export {
  buildLargeTransactionNotification,
  calculateSavingsStreak,
  evaluateBalanceWarnings,
  evaluateBillDueReminders,
  evaluateGoalNudges,
  evaluateGoalStreakCelebrations,
  evaluateLargeTransactionConfirmations,
} from './beta-alerts';

export type {
  BalanceWarningInput,
  BalanceWarningOptions,
  BillReminderEvalInput,
  BillReminderEvalOptions,
  GoalContributionRecord,
  GoalMomentumInput,
  GoalMomentumOptions,
  LargeTransactionConfirmationConfig,
  LargeTransactionConfirmationInput,
} from './beta-alerts';

export { detectScamAlerts, scamAlertsToNotifications } from './scam-alerts';
export type { ScamAlertDetectionOptions, ScamAlertRule, ScamSpendingAlert } from './scam-alerts';

export {
  buildUnusualSpendNotifications,
  recordUnusualSpendReview,
  summarizeUnusualSpendReviews,
} from './unusual-spend';
export type { UnusualSpendAlertOptions, UnusualSpendReviewOutcome, UnusualSpendReviewRecord } from './unusual-spend';

export { buildSpendingDigestNotification, scheduleDigestDelivery } from './spending-digests';
export type {
  DigestBudgetSummary,
  DigestCategoryChange,
  DigestGoalProgress,
  DigestUpcomingBill,
  SpendingDigestCadence,
  SpendingDigestInput,
} from './spending-digests';

export {
  detectSubscriptionPriceChanges,
  subscriptionPriceChangesToNotifications,
} from './subscription-price-changes';
export type {
  SubscriptionCadence,
  SubscriptionCharge,
  SubscriptionPriceChangeAlert,
  SubscriptionPriceChangeConfig,
} from './subscription-price-changes';

export {
  canBypassQuietHours,
  getDeliveryDecisions,
  normalizeNotificationPreferences,
  setAlertChannels,
  validateQuietHours,
} from './delivery-controls';
export type { DeliveryDecision, QuietHoursValidationResult } from './delivery-controls';

export type {
  BalanceEvalInput,
  BudgetEvalInput,
  GoalEvalInput,
  SpendingPaceInput,
} from './alert-engine';

export { loadNotificationPreferences, saveNotificationPreferences } from './preferences';
