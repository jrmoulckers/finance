// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';
import { buildSpendingDigestNotification, scheduleDigestDelivery } from './spending-digests';

describe('buildSpendingDigestNotification', () => {
  it('summarizes budgets, category changes, bills, goals, and critical alerts', () => {
    const digest = buildSpendingDigestNotification({
      cadence: 'weekly',
      periodStart: '2025-03-03',
      periodEnd: '2025-03-09',
      budgets: [
        {
          budgetName: 'Groceries',
          spentCents: 42000,
          budgetAmountCents: 50000,
          percentUsed: 84,
          paceLabel: 'over',
        },
      ],
      categoryChanges: [{ categoryName: 'Dining', currentCents: 9000, previousCents: 5000 }],
      upcomingBills: [{ billName: 'Internet', dueDate: '2025-03-11', amountCents: 7000 }],
      goals: [{ goalName: 'Emergency Fund', percentComplete: 55, remainingCents: 45000 }],
      notifications: [
        {
          id: 'alert-1',
          type: 'balance_overdraft',
          severity: 'critical',
          title: 'Overdraft risk',
          message: 'Needs attention',
          createdAt: '2025-03-07T10:00:00Z',
          status: 'unread',
        },
      ],
    });

    expect(digest.type).toBe('spending_digest');
    expect(digest.message).toContain('Groceries');
    expect(digest.message).toContain('Dining');
    expect(digest.message).toContain('Internet');
    expect(digest.message).toContain('Emergency Fund');
    expect(digest.message).toContain('1 critical alert');
    expect(digest.severity).toBe('warning');
  });

  it('creates a concise positive summary for low activity periods', () => {
    const digest = buildSpendingDigestNotification({
      cadence: 'monthly',
      periodStart: '2025-03-01',
      periodEnd: '2025-03-31',
    });

    expect(digest.message).toContain('Low-activity period');
    expect(digest.severity).toBe('info');
  });

  it('schedules delivery outside quiet hours', () => {
    const delivery = scheduleDigestDelivery(new Date('2025-03-01T23:00:00'), {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' },
    });

    expect(delivery.getHours()).toBe(7);
    expect(delivery.getMinutes()).toBe(0);
  });
});
