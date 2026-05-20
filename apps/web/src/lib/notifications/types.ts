// SPDX-License-Identifier: BUSL-1.1

/**
 * Core types for the notification and alert system.
 *
 * All notification types, alert configurations, channel preferences,
 * and spending pace data structures are defined here.
 *
 * Monetary values use integers (cents) to avoid floating-point errors.
 *
 * @module lib/notifications/types
 * References: #1646, #1648, #1655, #1659
 */

import type { SyncId } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Notification primitives
// ---------------------------------------------------------------------------

/** Unique identifier for a notification instance. */
export type NotificationId = string;

/** Severity levels for notifications — determines visual treatment. */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

/** The category of alert that triggered the notification. */
export type AlertType =
  | 'budget_threshold'
  | 'goal_milestone'
  | 'balance_low'
  | 'spending_pace'
  | 'predictive_overspend'
  | 'transaction_confirmation'
  | 'batch_confirmation';

/** Delivery channels for notifications. */
export type NotificationChannel = 'in_app' | 'browser_push' | 'email';

/** Possible states for a notification. */
export type NotificationStatus = 'unread' | 'read' | 'dismissed';

// ---------------------------------------------------------------------------
// Notification model
// ---------------------------------------------------------------------------

/** A single notification instance shown to the user. */
export interface AppNotification {
  /** Unique identifier. */
  readonly id: NotificationId;
  /** The alert type that generated this notification. */
  readonly type: AlertType;
  /** Severity determines visual treatment and screen-reader announcement. */
  readonly severity: NotificationSeverity;
  /** Short human-readable title (non-shaming language). */
  readonly title: string;
  /** Longer description with context. */
  readonly message: string;
  /** ISO-8601 timestamp when the notification was created. */
  readonly createdAt: string;
  /** Current status (read/unread/dismissed). */
  readonly status: NotificationStatus;
  /** Optional entity ID for quick navigation (budget, goal, account). */
  readonly entityId?: SyncId;
  /** Optional entity type for building navigation links. */
  readonly entityType?: 'budget' | 'goal' | 'account' | 'transaction';
  /** Optional action label for a quick-action button. */
  readonly actionLabel?: string;
  /** Rate-limiting key to prevent duplicate alerts. */
  readonly deduplicationKey?: string;
}

// ---------------------------------------------------------------------------
// Alert configuration (#1646)
// ---------------------------------------------------------------------------

/** Percentage thresholds at which budget alerts fire. */
export type BudgetThreshold = 50 | 75 | 90 | 100;

/** Percentage thresholds at which goal milestone alerts fire. */
export type GoalMilestone = 25 | 50 | 75 | 100;

/** Configuration for budget threshold alerts. */
export interface BudgetAlertConfig {
  /** The budget ID this config applies to, or null for global default. */
  readonly budgetId: SyncId | null;
  /** Which thresholds to alert on. */
  readonly thresholds: readonly BudgetThreshold[];
  /** Whether this alert is enabled. */
  readonly enabled: boolean;
}

/** Configuration for goal milestone alerts. */
export interface GoalAlertConfig {
  /** The goal ID this config applies to, or null for global default. */
  readonly goalId: SyncId | null;
  /** Which milestones to alert on. */
  readonly milestones: readonly GoalMilestone[];
  /** Whether this alert is enabled. */
  readonly enabled: boolean;
}

/** Configuration for account balance alerts. */
export interface BalanceAlertConfig {
  /** The account ID this config applies to. */
  readonly accountId: SyncId;
  /** Balance threshold in cents — alert when balance drops below. */
  readonly thresholdCents: number;
  /** Whether this alert is enabled. */
  readonly enabled: boolean;
}

// ---------------------------------------------------------------------------
// Spending pace (#1648)
// ---------------------------------------------------------------------------

/** Daily spending pace data for a budget. */
export interface SpendingPace {
  /** The budget ID. */
  readonly budgetId: SyncId;
  /** Budget name for display. */
  readonly budgetName: string;
  /** Total budget amount in cents. */
  readonly budgetAmountCents: number;
  /** Amount spent so far in cents. */
  readonly spentCents: number;
  /** Remaining budget in cents. */
  readonly remainingCents: number;
  /** Total days in the budget period. */
  readonly totalDays: number;
  /** Days elapsed so far. */
  readonly elapsedDays: number;
  /** Days remaining in the period. */
  readonly remainingDays: number;
  /** Expected daily pace (budget / totalDays) in cents. */
  readonly expectedDailyPaceCents: number;
  /** Actual daily pace (spent / elapsedDays) in cents. */
  readonly actualDailyPaceCents: number;
  /** Whether spending is ahead of pace. */
  readonly isAheadOfPace: boolean;
  /** Predicted total spend at current pace in cents. */
  readonly predictedTotalCents: number;
  /** Whether predicted total exceeds budget. */
  readonly willOverspend: boolean;
  /** Days until budget is exhausted at current pace (null if not overspending). */
  readonly daysUntilExhausted: number | null;
  /** Percentage of budget used (0-100+). */
  readonly percentUsed: number;
  /** Percentage of time elapsed (0-100). */
  readonly percentTimeElapsed: number;
}

/** Weekly pace summary for display. */
export interface WeeklyPaceSummary {
  /** Start of the week (ISO date). */
  readonly weekStart: string;
  /** Amount spent during this week in cents. */
  readonly weeklySpentCents: number;
  /** Expected weekly spend at planned pace in cents. */
  readonly expectedWeeklyCents: number;
  /** Whether this week was over or under pace. */
  readonly overPace: boolean;
}

// ---------------------------------------------------------------------------
// Transaction confirmation (#1659)
// ---------------------------------------------------------------------------

/** A transaction confirmation notification payload. */
export interface TransactionConfirmation {
  /** The transaction ID. */
  readonly transactionId: SyncId;
  /** Amount in cents. */
  readonly amountCents: number;
  /** Payee or merchant name. */
  readonly payee: string;
  /** Account name. */
  readonly accountName: string;
  /** Transaction type. */
  readonly type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

/** Summary of a batch of confirmed transactions. */
export interface BatchConfirmationSummary {
  /** Number of transactions in the batch. */
  readonly count: number;
  /** Total amount in cents. */
  readonly totalCents: number;
  /** The account name(s) involved. */
  readonly accountNames: readonly string[];
  /** ISO-8601 timestamp of the batch. */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Channel preferences (#1655)
// ---------------------------------------------------------------------------

/** Per-alert-type channel configuration. */
export interface AlertChannelPreference {
  /** The alert type this preference applies to. */
  readonly alertType: AlertType;
  /** Which channels are enabled for this alert type. */
  readonly channels: readonly NotificationChannel[];
}

/** Quiet hours configuration. */
export interface QuietHoursConfig {
  /** Whether quiet hours are enabled. */
  readonly enabled: boolean;
  /** Start time in 24h format (e.g. "22:00"). */
  readonly startTime: string;
  /** End time in 24h format (e.g. "07:00"). */
  readonly endTime: string;
}

/** Full notification preferences. */
export interface NotificationPreferences {
  /** Global enable/disable for all notifications. */
  readonly enabled: boolean;
  /** Do-not-disturb mode (overrides everything). */
  readonly doNotDisturb: boolean;
  /** Quiet hours (suppress non-critical notifications). */
  readonly quietHours: QuietHoursConfig;
  /** Per-alert-type channel preferences. */
  readonly channelPreferences: readonly AlertChannelPreference[];
  /** Budget alert configurations. */
  readonly budgetAlerts: readonly BudgetAlertConfig[];
  /** Goal alert configurations. */
  readonly goalAlerts: readonly GoalAlertConfig[];
  /** Balance alert configurations. */
  readonly balanceAlerts: readonly BalanceAlertConfig[];
  /** Whether to show transaction confirmation notifications. */
  readonly transactionConfirmations: boolean;
  /** Whether sound/haptic feedback is enabled for confirmations. */
  readonly soundEnabled: boolean;
  /** Spending pace alert sensitivity: 'low' | 'medium' | 'high'. */
  readonly paceSensitivity: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

/** Default quiet hours (10 PM to 7 AM). */
export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '07:00',
};

/** Default channel preferences (in-app only, conservative defaults). */
export const DEFAULT_CHANNEL_PREFERENCES: readonly AlertChannelPreference[] = [
  { alertType: 'budget_threshold', channels: ['in_app'] },
  { alertType: 'goal_milestone', channels: ['in_app'] },
  { alertType: 'balance_low', channels: ['in_app'] },
  { alertType: 'spending_pace', channels: ['in_app'] },
  { alertType: 'predictive_overspend', channels: ['in_app'] },
  { alertType: 'transaction_confirmation', channels: ['in_app'] },
  { alertType: 'batch_confirmation', channels: ['in_app'] },
];

/** Default global budget thresholds. */
export const DEFAULT_BUDGET_THRESHOLDS: readonly BudgetThreshold[] = [75, 90, 100];

/** Default goal milestones. */
export const DEFAULT_GOAL_MILESTONES: readonly GoalMilestone[] = [25, 50, 75, 100];

/** Default notification preferences. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  doNotDisturb: false,
  quietHours: DEFAULT_QUIET_HOURS,
  channelPreferences: DEFAULT_CHANNEL_PREFERENCES,
  budgetAlerts: [{ budgetId: null, thresholds: DEFAULT_BUDGET_THRESHOLDS, enabled: true }],
  goalAlerts: [{ goalId: null, milestones: DEFAULT_GOAL_MILESTONES, enabled: true }],
  balanceAlerts: [],
  transactionConfirmations: true,
  soundEnabled: false,
  paceSensitivity: 'medium',
};
