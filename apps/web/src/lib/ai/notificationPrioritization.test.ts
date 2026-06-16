// SPDX-License-Identifier: BUSL-1.1

import { prioritizeAndBundleNotifications, scoreNotification, serializeNotificationBundles, type SmartNotification } from './notificationPrioritization';

const notifications: readonly SmartNotification[] = [
  { id: 'critical', type: 'balance_overdraft', severity: 'critical', title: 'Overdraft risk', message: 'Projected below zero', createdAt: '2026-03-15T08:00:00.000Z', status: 'unread', entityType: 'account', entityId: 'checking', financialImpactCents: 50_000, dueDate: '2026-03-15' },
  { id: 'budget1', type: 'budget_threshold', severity: 'warning', title: 'Dining pace', message: 'Dining is ahead', createdAt: '2026-03-15T09:00:00.000Z', status: 'unread', entityType: 'budget', entityId: 'dining', financialImpactCents: 12_000 },
  { id: 'budget2', type: 'budget_threshold', severity: 'info', title: 'Dining check-in', message: 'Review dining', createdAt: '2026-03-15T10:00:00.000Z', status: 'unread', entityType: 'budget', entityId: 'dining', financialImpactCents: 2_000 },
  { id: 'dismissed', type: 'goal_nudge', severity: 'info', title: 'Goal nudge', message: 'Save more', createdAt: '2026-03-15T11:00:00.000Z', status: 'unread', entityType: 'goal', entityId: 'vacation' },
];

describe('smart notification prioritization', () => {
  it('scores by severity, impact, due proximity, entity type, and dismissal history', () => {
    const score = scoreNotification(notifications[0], { now: '2026-03-15T12:00:00.000Z' });
    expect(score.pinned).toBe(true);
    expect(score.score).toBeGreaterThan(110);
    const dismissed = scoreNotification(notifications[3], { now: '2026-03-15T12:00:00.000Z', history: { dismissedEntityIds: ['vacation'] } });
    expect(dismissed.score).toBeLessThan(10);
    expect(dismissed.reasons).toContain('related entity dismissed before');
  });

  it('keeps critical alerts unbundled and bundles related low or medium items', () => {
    const bundles = prioritizeAndBundleNotifications(notifications, { now: '2026-03-15T12:00:00.000Z' });
    expect(bundles[0]).toMatchObject({ kind: 'single', pinned: true, title: 'Overdraft risk' });
    const budgetBundle = bundles.find((bundle) => bundle.kind === 'bundle');
    expect(budgetBundle?.count).toBe(2);
    expect(budgetBundle?.children.map((child) => child.notification.id)).toEqual(['budget1', 'budget2']);
  });

  it('persists bundle history as child notification ids', () => {
    const bundles = prioritizeAndBundleNotifications(notifications.slice(1, 3), { now: '2026-03-15T12:00:00.000Z' });
    expect(serializeNotificationBundles(bundles)).toContain('budget1');
  });
});
