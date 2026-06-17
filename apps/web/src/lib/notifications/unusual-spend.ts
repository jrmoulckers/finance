// SPDX-License-Identifier: BUSL-1.1

/**
 * Productized unusual-spend alert helpers.
 *
 * This module intentionally builds on scam-alerts.ts detection instead of
 * duplicating anomaly rules. It adds review outcomes and sensitivity filters
 * that the UI can persist and feed back into future evaluations.
 */

import type { Transaction } from '../../kmp/bridge';
import { detectScamAlerts, scamAlertsToNotifications, type ScamAlertDetectionOptions, type ScamAlertRule, type ScamSpendingAlert } from './scam-alerts';
import type { AppNotification, NotificationSeverity } from './types';

export type UnusualSpendReviewOutcome = 'recognized' | 'not_mine' | 'dismissed';

export interface UnusualSpendReviewRecord {
  readonly alertId: string;
  readonly outcome: UnusualSpendReviewOutcome;
  readonly transactionIds: readonly string[];
  readonly rule: ScamAlertRule;
  readonly recordedAt: string;
  readonly merchantName?: string;
}

export interface UnusualSpendAlertOptions {
  readonly enabled?: boolean;
  readonly detection?: ScamAlertDetectionOptions;
  readonly reviews?: readonly UnusualSpendReviewRecord[];
  readonly alreadyFiredKeys?: ReadonlySet<string>;
  readonly minimumSeverity?: NotificationSeverity;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  info: 0,
  success: 1,
  warning: 2,
  critical: 3,
};

function merchantKey(merchantName: string | undefined): string | null {
  if (merchantName === undefined) return null;
  const key = merchantName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return key.length === 0 ? null : key;
}

function sameTransactionSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function isSuppressedByReview(
  alert: ScamSpendingAlert,
  reviews: readonly UnusualSpendReviewRecord[],
): boolean {
  const alertMerchant = merchantKey(alert.merchantName);

  return reviews.some((review) => {
    if (review.alertId === alert.id || sameTransactionSet(review.transactionIds, alert.transactionIds)) {
      return true;
    }

    if (review.outcome !== 'recognized') {
      return false;
    }

    const reviewMerchant = merchantKey(review.merchantName);
    return (
      reviewMerchant !== null &&
      reviewMerchant === alertMerchant &&
      (alert.rule === 'new-merchant' || alert.rule === 'round-large-unfamiliar')
    );
  });
}

function meetsMinimumSeverity(alert: ScamSpendingAlert, minimumSeverity?: NotificationSeverity): boolean {
  if (minimumSeverity === undefined) return true;
  return SEVERITY_RANK[alert.severity] >= SEVERITY_RANK[minimumSeverity];
}

function withReviewActions(notification: AppNotification): AppNotification {
  return {
    ...notification,
    actionLabel: notification.actionLabel ?? 'Review alert',
    message: `${notification.message} You can mark it recognized, not mine, or dismiss it to tune future alerts.`,
  };
}

export function buildUnusualSpendNotifications(
  transactions: readonly Transaction[],
  options: UnusualSpendAlertOptions = {},
): AppNotification[] {
  if (options.enabled === false) return [];

  const reviews = options.reviews ?? [];
  const alerts = detectScamAlerts(transactions, options.detection).filter((alert) => {
    if (options.alreadyFiredKeys?.has(alert.id) === true) return false;
    if (!meetsMinimumSeverity(alert, options.minimumSeverity)) return false;
    return !isSuppressedByReview(alert, reviews);
  });

  return scamAlertsToNotifications(alerts).map(withReviewActions);
}

export function recordUnusualSpendReview(
  alert: ScamSpendingAlert,
  outcome: UnusualSpendReviewOutcome,
  recordedAt: string = new Date().toISOString(),
): UnusualSpendReviewRecord {
  return {
    alertId: alert.id,
    outcome,
    transactionIds: alert.transactionIds,
    rule: alert.rule,
    recordedAt,
    merchantName: alert.merchantName,
  };
}

export function summarizeUnusualSpendReviews(
  reviews: readonly UnusualSpendReviewRecord[],
): Record<UnusualSpendReviewOutcome, number> {
  return reviews.reduce<Record<UnusualSpendReviewOutcome, number>>(
    (summary, review) => ({ ...summary, [review.outcome]: summary[review.outcome] + 1 }),
    { recognized: 0, not_mine: 0, dismissed: 0 },
  );
}
