// SPDX-License-Identifier: BUSL-1.1

import type { AppNotification } from './types';
import type { ScamSpendingAlert, ScamAlertRule } from './scam-alerts';
import type { UnusualSpendReviewOutcome, UnusualSpendReviewRecord } from './unusual-spend';

export type UnusualSpendRouteTarget =
  | { readonly kind: 'transaction_detail'; readonly path: string; readonly transactionId: string }
  | {
      readonly kind: 'transaction_filter';
      readonly path: string;
      readonly transactionIds: readonly string[];
      readonly rule: ScamAlertRule;
    }
  | {
      readonly kind: 'notification_history';
      readonly path: string;
      readonly outcome?: UnusualSpendReviewOutcome;
    };

export interface UnusualSpendHistoryFilter {
  readonly type: 'scam_check';
  readonly outcome?: UnusualSpendReviewOutcome;
}

export function routeUnusualSpendAlert(alert: ScamSpendingAlert): UnusualSpendRouteTarget {
  if (
    alert.transactionIds.length === 1 &&
    alert.rule !== 'possible-duplicate' &&
    alert.rule !== 'rapid-succession'
  ) {
    const transactionId = alert.transactionIds[0] ?? '';
    return { kind: 'transaction_detail', path: `/transactions/${transactionId}`, transactionId };
  }

  const params = new URLSearchParams({
    alertType: 'scam_check',
    rule: alert.rule,
    transactionIds: alert.transactionIds.join(','),
  });
  return {
    kind: 'transaction_filter',
    path: `/transactions?${params.toString()}`,
    transactionIds: alert.transactionIds,
    rule: alert.rule,
  };
}

export function routeUnusualSpendNotification(
  notification: AppNotification,
): UnusualSpendRouteTarget | null {
  if (notification.type !== 'scam_check') return null;
  if (notification.entityType === 'transaction' && notification.entityId) {
    return {
      kind: 'transaction_detail',
      path: `/transactions/${notification.entityId}`,
      transactionId: notification.entityId,
    };
  }
  return { kind: 'notification_history', path: '/notifications?type=scam_check' };
}

export function buildUnusualSpendHistoryFilter(
  outcome?: UnusualSpendReviewOutcome,
): UnusualSpendHistoryFilter {
  return { type: 'scam_check', outcome };
}

export function matchesUnusualSpendHistoryFilter(
  notification: AppNotification,
  reviews: readonly UnusualSpendReviewRecord[],
  filter: UnusualSpendHistoryFilter,
): boolean {
  if (notification.type !== filter.type) return false;
  if (filter.outcome === undefined) return true;
  return reviews.some(
    (review) => review.outcome === filter.outcome && review.alertId === notification.id,
  );
}

export function outcomeBadgeForNotification(
  notification: AppNotification,
  reviews: readonly UnusualSpendReviewRecord[],
): string | null {
  const review = reviews.find((candidate) => candidate.alertId === notification.id);
  if (review === undefined) return null;
  if (review.outcome === 'recognized') return 'Recognized';
  if (review.outcome === 'not_mine') return 'Not mine';
  return 'Dismissed';
}
