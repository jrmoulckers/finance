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
export type {
  UnusualSpendAlertOptions,
  UnusualSpendReviewOutcome,
  UnusualSpendReviewRecord,
} from './unusual-spend';

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

export {
  buildImportProfileReminderNotifications,
  canCommitReimportPlan,
  planManualReimport,
} from './import-rerun-reminders';
export type {
  ImportReminderOptions,
  ManualReimportIntent,
  ManualReimportRequest,
} from './import-rerun-reminders';

export {
  applyUnusualSpendReviewOutcome,
  buildUnusualSpendOutcomeBadges,
  findReviewForNotification,
  getUnusualSpendReviewActions,
} from './unusual-spend-review-actions';
export type {
  UnusualSpendOutcomeBadge,
  UnusualSpendReviewAction,
  UnusualSpendReviewResult,
} from './unusual-spend-review-actions';

export {
  buildUnusualSpendHistoryFilter,
  matchesUnusualSpendHistoryFilter,
  outcomeBadgeForNotification,
  routeUnusualSpendAlert,
  routeUnusualSpendNotification,
} from './unusual-spend-routing';
export type { UnusualSpendHistoryFilter, UnusualSpendRouteTarget } from './unusual-spend-routing';

export {
  createSpendingDigestHistoryEntry,
  enabledDigestCadences,
  normalizeSpendingDigestPreferences,
  planSpendingDigestSchedules,
} from './spending-digest-preferences';
export type {
  DigestScheduleDecision,
  SpendingDigestHistoryEntry,
  SpendingDigestPreferenceCadence,
  SpendingDigestPreferences,
} from './spending-digest-preferences';

export { buildSpendingDigestDetailView } from './spending-digest-detail';
export type {
  SpendingDigestDetailSection,
  SpendingDigestDetailSectionKind,
  SpendingDigestDetailView,
} from './spending-digest-detail';

export {
  buildSubscriptionPriceChangeCommands,
  buildSubscriptionPriceChangeDispatchPlans,
  routeSubscriptionPriceChange,
  subscriptionToPriceChangeCharge,
  subscriptionsToPriceChangeCharges,
} from './subscription-price-change-integration';
export type {
  SubscriptionPriceChangeAction,
  SubscriptionPriceChangeCommand,
  SubscriptionPriceChangeDispatchPlan,
} from './subscription-price-change-integration';

export {
  DEFAULT_SUBSCRIPTION_PRICE_CHANGE_PREFERENCES,
  normalizeSubscriptionPriceChangePreferences,
  recordSubscriptionPriceChangeAlert,
  shouldRealertSubscriptionPriceChange,
  toSubscriptionPriceChangeConfig,
  validateSubscriptionPriceChangePreferences,
} from './subscription-price-change-preferences';
export type {
  SubscriptionPriceChangeAlertHistory,
  SubscriptionPriceChangePreferenceValidation,
  SubscriptionPriceChangePreferences,
} from './subscription-price-change-preferences';

export { chooseNotificationTime } from './smart-timing-policy';
export type {
  AlertPriority,
  NotificationTimingDecision,
  NotificationTimingInput,
  QuietHours,
} from './smart-timing-policy';

export {
  buildNotificationPreferenceViewModel,
  toggleNotificationPreferenceChannel,
} from './preference-controls';
export type {
  NotificationChannelAvailability,
  NotificationPreferenceControl,
  NotificationPreferenceViewModel,
} from './preference-controls';

export {
  dispatchableChannels,
  planNotificationDelivery,
  suppressedChannels,
} from './notification-delivery-plan';
export type {
  NotificationChannelDispatch,
  NotificationDeliveryPlan,
} from './notification-delivery-plan';

export { loadNotificationPreferences, saveNotificationPreferences } from './preferences';

export {
  SNOOZE_OPTIONS,
  formatSnoozeUntil,
  isSnoozeExpired,
  snoozeUntil,
  wakeExpiredSnoozes,
} from './snooze';
export type { SnoozeOption } from './snooze';
