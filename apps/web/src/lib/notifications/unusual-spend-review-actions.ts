// SPDX-License-Identifier: BUSL-1.1

import type { AppNotification, NotificationStatus } from './types';
import type { ScamSpendingAlert } from './scam-alerts';
import {
  recordUnusualSpendReview,
  type UnusualSpendReviewOutcome,
  type UnusualSpendReviewRecord,
} from './unusual-spend';

export interface UnusualSpendReviewAction {
  readonly outcome: UnusualSpendReviewOutcome;
  readonly label: string;
  readonly nextStatus: NotificationStatus;
  readonly confirmationMessage: string;
}

export interface UnusualSpendReviewResult {
  readonly review: UnusualSpendReviewRecord;
  readonly notification: AppNotification;
}

export interface UnusualSpendOutcomeBadge {
  readonly outcome: UnusualSpendReviewOutcome;
  readonly label: string;
  readonly count: number;
}

const ACTIONS: readonly UnusualSpendReviewAction[] = [
  {
    outcome: 'recognized',
    label: 'I recognize this',
    nextStatus: 'read',
    confirmationMessage: 'Marked recognized. Similar merchant alerts can be suppressed next time.',
  },
  {
    outcome: 'not_mine',
    label: 'Not mine',
    nextStatus: 'read',
    confirmationMessage: 'Marked not mine. Keep the alert visible until you finish bank follow-up.',
  },
  {
    outcome: 'dismissed',
    label: 'Dismiss',
    nextStatus: 'dismissed',
    confirmationMessage: 'Dismissed this unusual-spend alert.',
  },
];

export function getUnusualSpendReviewActions(): readonly UnusualSpendReviewAction[] {
  return ACTIONS;
}

export function applyUnusualSpendReviewOutcome(
  alert: ScamSpendingAlert,
  notification: AppNotification,
  outcome: UnusualSpendReviewOutcome,
  recordedAt: string = new Date().toISOString(),
): UnusualSpendReviewResult {
  const action = ACTIONS.find((candidate) => candidate.outcome === outcome) ?? ACTIONS[2];
  return {
    review: recordUnusualSpendReview(alert, outcome, recordedAt),
    notification: {
      ...notification,
      status: action.nextStatus,
      message: `${notification.message} ${action.confirmationMessage}`,
      actionLabel: outcome === 'not_mine' ? 'Review bank steps' : notification.actionLabel,
    },
  };
}

export function buildUnusualSpendOutcomeBadges(
  reviews: readonly UnusualSpendReviewRecord[],
): readonly UnusualSpendOutcomeBadge[] {
  return ACTIONS.map((action) => ({
    outcome: action.outcome,
    label: action.label,
    count: reviews.filter((review) => review.outcome === action.outcome).length,
  })).filter((badge) => badge.count > 0);
}

export function findReviewForNotification(
  notification: AppNotification,
  reviews: readonly UnusualSpendReviewRecord[],
): UnusualSpendReviewRecord | null {
  return reviews.find((review) => review.alertId === notification.id || review.transactionIds.includes(notification.entityId ?? '')) ?? null;
}
