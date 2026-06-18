// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { AppNotification } from './types';
import type { ScamSpendingAlert } from './scam-alerts';
import {
  buildUnusualSpendHistoryFilter,
  matchesUnusualSpendHistoryFilter,
  outcomeBadgeForNotification,
  routeUnusualSpendAlert,
  routeUnusualSpendNotification,
} from './unusual-spend-routing';
import type { UnusualSpendReviewRecord } from './unusual-spend';

function alert(overrides: Partial<ScamSpendingAlert>): ScamSpendingAlert {
  return {
    id: 'scam-alert',
    rule: 'unusually-large',
    title: 'Check charge',
    message: 'Message',
    nextStep: 'Next',
    severity: 'warning',
    transactionIds: ['t1'],
    createdAt: '2025-03-01T12:00:00Z',
    ...overrides,
  };
}

const notification: AppNotification = {
  id: 'scam-alert',
  type: 'scam_check',
  severity: 'warning',
  title: 'Check charge',
  message: 'Message',
  createdAt: '2025-03-01T12:00:00Z',
  status: 'read',
  entityId: 't1',
  entityType: 'transaction',
};

const review: UnusualSpendReviewRecord = {
  alertId: 'scam-alert',
  outcome: 'not_mine',
  transactionIds: ['t1'],
  rule: 'unusually-large',
  recordedAt: '2025-03-01T13:00:00Z',
};

describe('unusual spend routing', () => {
  it('routes single-transaction alerts to transaction detail', () => {
    expect(routeUnusualSpendAlert(alert({}))).toMatchObject({
      kind: 'transaction_detail',
      path: '/transactions/t1',
    });
    expect(routeUnusualSpendNotification(notification)).toMatchObject({
      kind: 'transaction_detail',
    });
  });

  it('routes duplicate and rapid alerts to filtered transaction sets', () => {
    const route = routeUnusualSpendAlert(
      alert({ rule: 'possible-duplicate', transactionIds: ['t1', 't2'] }),
    );

    expect(route.kind).toBe('transaction_filter');
    expect(route.path).toContain('transactionIds=t1%2Ct2');
  });

  it('filters history by scam-check outcome and preserves badges', () => {
    const filter = buildUnusualSpendHistoryFilter('not_mine');

    expect(matchesUnusualSpendHistoryFilter(notification, [review], filter)).toBe(true);
    expect(outcomeBadgeForNotification(notification, [review])).toBe('Not mine');
  });
});
