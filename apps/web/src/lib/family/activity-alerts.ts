// SPDX-License-Identifier: BUSL-1.1

/**
 * Unusual activity alerts engine for dependent accounts.
 *
 * Pure functions for detecting anomalous spending (amount thresholds,
 * category anomalies, frequency spikes), generating alerts with severity
 * levels, and tracking acknowledgments.
 * All monetary values in integer cents.
 *
 * References: #1731
 */

import type { ActivityAlert, AlertThresholds, AlertSeverity } from './types';
import { bankersRound, safeDivide } from './utils';

// ---------------------------------------------------------------------------
// Types local to this module
// ---------------------------------------------------------------------------

/** A transaction record for alert analysis. */
export interface AlertTransaction {
  /** Amount in cents. */
  readonly amountCents: number;
  /** Category ID (null = uncategorized). */
  readonly categoryId: string | null;
  /** Category name for display. */
  readonly categoryName: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

/** Historical spending data for category anomaly detection. */
export interface CategoryHistory {
  /** Category ID. */
  readonly categoryId: string;
  /** Category name. */
  readonly categoryName: string;
  /** Average monthly spending in cents. */
  readonly averageMonthlySpendCents: number;
}

// ---------------------------------------------------------------------------
// Default thresholds
// ---------------------------------------------------------------------------

/**
 * Returns sensible default alert thresholds.
 *
 * @returns Default AlertThresholds
 */
export function getDefaultThresholds(): AlertThresholds {
  return {
    amountThresholdCents: 5000, // $50
    dailyTransactionLimit: 10,
    categoryAnomalyPercent: 50, // 50% above average
  };
}

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

/**
 * Checks whether a single transaction exceeds the amount threshold.
 *
 * @param transaction - The transaction to check
 * @param thresholds - Alert configuration thresholds
 * @returns An alert if threshold is exceeded, null otherwise
 */
export function checkAmountThreshold(
  transaction: AlertTransaction,
  thresholds: AlertThresholds,
  params: { readonly alertId: string; readonly accountId: string; readonly now: string },
): ActivityAlert | null {
  if (transaction.amountCents <= thresholds.amountThresholdCents) return null;

  const severity = classifyAmountSeverity(transaction.amountCents, thresholds.amountThresholdCents);

  return {
    id: params.alertId,
    accountId: params.accountId,
    type: 'amount-threshold',
    severity,
    message: `Transaction of ${formatCents(transaction.amountCents)} exceeds the ${formatCents(thresholds.amountThresholdCents)} threshold`,
    triggerAmountCents: transaction.amountCents,
    acknowledged: false,
    createdAt: params.now,
    acknowledgedAt: '',
  };
}

/**
 * Checks for a frequency spike — too many transactions in a single day.
 *
 * @param transactions - All transactions for the account
 * @param thresholds - Alert configuration thresholds
 * @param params - Alert metadata
 * @returns An alert if the daily limit is exceeded, null otherwise
 */
export function checkFrequencySpike(
  transactions: readonly AlertTransaction[],
  thresholds: AlertThresholds,
  params: {
    readonly alertId: string;
    readonly accountId: string;
    readonly date: string;
    readonly now: string;
  },
): ActivityAlert | null {
  const dayPrefix = params.date.slice(0, 10); // "YYYY-MM-DD"
  const todayCount = transactions.filter((t) => t.timestamp.slice(0, 10) === dayPrefix).length;

  if (todayCount <= thresholds.dailyTransactionLimit) return null;

  const severity: AlertSeverity =
    todayCount > thresholds.dailyTransactionLimit * 2 ? 'high' : 'medium';

  return {
    id: params.alertId,
    accountId: params.accountId,
    type: 'frequency-spike',
    severity,
    message: `${todayCount} transactions today exceeds the daily limit of ${thresholds.dailyTransactionLimit}`,
    triggerAmountCents: 0,
    acknowledged: false,
    createdAt: params.now,
    acknowledgedAt: '',
  };
}

/**
 * Checks for category spending anomalies compared to historical averages.
 *
 * @param currentMonthSpendCents - Total spending in the category for the current month
 * @param history - Historical spending data for the category
 * @param thresholds - Alert thresholds
 * @param params - Alert metadata
 * @returns An alert if category spending is anomalous, null otherwise
 */
export function checkCategoryAnomaly(
  currentMonthSpendCents: number,
  history: CategoryHistory,
  thresholds: AlertThresholds,
  params: { readonly alertId: string; readonly accountId: string; readonly now: string },
): ActivityAlert | null {
  if (history.averageMonthlySpendCents === 0) return null;

  const percentIncrease = bankersRound(
    safeDivide(
      (currentMonthSpendCents - history.averageMonthlySpendCents) * 100,
      history.averageMonthlySpendCents,
    ),
  );

  if (percentIncrease <= thresholds.categoryAnomalyPercent) return null;

  const severity: AlertSeverity =
    percentIncrease > thresholds.categoryAnomalyPercent * 2 ? 'high' : 'medium';

  return {
    id: params.alertId,
    accountId: params.accountId,
    type: 'category-anomaly',
    severity,
    message: `Spending in "${history.categoryName}" is ${percentIncrease}% above the monthly average of ${formatCents(history.averageMonthlySpendCents)}`,
    triggerAmountCents: currentMonthSpendCents,
    acknowledged: false,
    createdAt: params.now,
    acknowledgedAt: '',
  };
}

/**
 * Runs all alert checks for a new transaction and returns any generated alerts.
 *
 * @param transaction - The new transaction
 * @param allTransactions - All transactions for the account (including the new one)
 * @param categoryHistories - Historical spending data per category
 * @param currentMonthCategorySpend - Map of categoryId -> total cents this month
 * @param thresholds - Alert configuration
 * @param params - Alert metadata (including ID generator)
 * @returns Array of generated alerts (may be empty)
 */
export function evaluateTransaction(
  transaction: AlertTransaction,
  allTransactions: readonly AlertTransaction[],
  categoryHistories: readonly CategoryHistory[],
  currentMonthCategorySpend: ReadonlyMap<string, number>,
  thresholds: AlertThresholds,
  params: {
    readonly accountId: string;
    readonly now: string;
    readonly generateId: () => string;
  },
): readonly ActivityAlert[] {
  const alerts: ActivityAlert[] = [];

  // Amount threshold check
  const amountAlert = checkAmountThreshold(transaction, thresholds, {
    alertId: params.generateId(),
    accountId: params.accountId,
    now: params.now,
  });
  if (amountAlert) alerts.push(amountAlert);

  // Frequency spike check
  const freqAlert = checkFrequencySpike(allTransactions, thresholds, {
    alertId: params.generateId(),
    accountId: params.accountId,
    date: transaction.timestamp,
    now: params.now,
  });
  if (freqAlert) alerts.push(freqAlert);

  // Category anomaly check
  if (transaction.categoryId) {
    const history = categoryHistories.find((h) => h.categoryId === transaction.categoryId);
    if (history) {
      const monthSpend = currentMonthCategorySpend.get(transaction.categoryId) ?? 0;
      const catAlert = checkCategoryAnomaly(monthSpend, history, thresholds, {
        alertId: params.generateId(),
        accountId: params.accountId,
        now: params.now,
      });
      if (catAlert) alerts.push(catAlert);
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Alert management
// ---------------------------------------------------------------------------

/**
 * Acknowledges an alert (parent has seen it).
 *
 * @param alert - The alert to acknowledge
 * @param now - Current ISO-8601 timestamp
 * @returns Updated alert with acknowledged=true
 */
export function acknowledgeAlert(alert: ActivityAlert, now: string): ActivityAlert {
  return { ...alert, acknowledged: true, acknowledgedAt: now };
}

/**
 * Filters alerts by severity level or higher.
 *
 * @param alerts - All alerts
 * @param minSeverity - Minimum severity to include
 * @returns Filtered alerts
 */
export function filterBySeverity(
  alerts: readonly ActivityAlert[],
  minSeverity: AlertSeverity,
): readonly ActivityAlert[] {
  const levels: Record<AlertSeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
  };
  const minLevel = levels[minSeverity];
  return alerts.filter((a) => levels[a.severity] >= minLevel);
}

/**
 * Returns unacknowledged alerts.
 *
 * @param alerts - All alerts
 * @returns Unacknowledged alerts
 */
export function getUnacknowledgedAlerts(
  alerts: readonly ActivityAlert[],
): readonly ActivityAlert[] {
  return alerts.filter((a) => !a.acknowledged);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classifies the severity of an amount threshold breach.
 *
 * @param amountCents - Transaction amount in cents
 * @param thresholdCents - Threshold in cents
 * @returns Severity level
 */
function classifyAmountSeverity(amountCents: number, thresholdCents: number): AlertSeverity {
  const ratio = safeDivide(amountCents, thresholdCents);
  if (ratio >= 5) return 'critical';
  if (ratio >= 3) return 'high';
  if (ratio >= 1.5) return 'medium';
  return 'low';
}

/**
 * Formats cents as a dollar string for alert messages.
 *
 * @param cents - Amount in cents
 * @returns Formatted string (e.g. "$50.00")
 */
function formatCents(cents: number): string {
  const dollars = Math.floor(Math.abs(cents) / 100);
  const remainder = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${dollars}.${String(remainder).padStart(2, '0')}`;
}
