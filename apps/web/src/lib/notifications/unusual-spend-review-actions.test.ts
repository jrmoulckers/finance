// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { AppNotification } from './types';
import type { ScamSpendingAlert } from './scam-alerts';
import {
  applyUnusualSpendReviewOutcome,
  buildUnusualSpendOutcomeBadges,
  findReviewForNotification,
  getUnusualSpendReviewActions,
} from './unusual-spend-review-actions';

const alert: ScamSpendingAlert = {
  id: 'scam-large-t1',
  rule: 'unusually-large',
  title: 'Check this larger charge',
  message: 'Large charge',
  nextStep: 'Review it',
  severity: 'warning',
  transactionIds: ['t1'],
  merchantName: 'Shop',
  amountCents: 12000,
  createdAt: '2025-02-01T12:00:00Z',
};

const notification: AppNotification = {
  id: alert.id,
  type: 'scam_check',
  severity: 'warning',
  title: alert.title,
  message: alert.message,
  createdAt: alert.createdAt,
  status: 'unread',
  entityId: 't1',
  entityType: 'transaction',
};

describe('unusual spend review actions', () => {
  it('defines UI-safe review outcomes', () => {
    expect(getUnusualSpendReviewActions().map((action) => action.outcome)).toEqual([
      'recognized',
      'not_mine',
      'dismissed',
    ]);
  });

  it('records the chosen outcome and updates notification state', () => {
    const result = applyUnusualSpendReviewOutcome(
      alert,
      notification,
      'not_mine',
      '2025-02-01T13:00:00Z',
    );

    expect(result.review.outcome).toBe('not_mine');
    expect(result.notification.status).toBe('read');
    expect(result.notification.actionLabel).toBe('Review bank steps');
  });

  it('builds history badges and resolves them back to notifications', () => {
    const result = applyUnusualSpendReviewOutcome(alert, notification, 'recognized');
    const badges = buildUnusualSpendOutcomeBadges([result.review]);

    expect(badges).toEqual([{ outcome: 'recognized', label: 'I recognize this', count: 1 }]);
    expect(findReviewForNotification(notification, [result.review])?.outcome).toBe('recognized');
  });
});
