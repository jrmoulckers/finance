// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildSpendingDigestNotification } from './spending-digests';
import { buildSpendingDigestDetailView } from './spending-digest-detail';

const digest = buildSpendingDigestNotification({ cadence: 'weekly', periodStart: '2025-05-01', periodEnd: '2025-05-07' });

describe('spending digest detail view', () => {
  it('builds detail sections for every digest category and excludes dismissed critical alerts', () => {
    const view = buildSpendingDigestDetailView(digest, {
      cadence: 'weekly',
      periodStart: '2025-05-01',
      periodEnd: '2025-05-07',
      budgets: [{ budgetName: 'Food', spentCents: 11000, budgetAmountCents: 10000, percentUsed: 110, paceLabel: 'over' }],
      categoryChanges: [{ categoryName: 'Travel', currentCents: 5000, previousCents: 9000 }],
      upcomingBills: [{ billName: 'Rent', dueDate: '2025-05-10', amountCents: 120000 }],
      goals: [{ goalName: 'Vacation', percentComplete: 85, remainingCents: 30000 }],
      notifications: [
        {
          id: 'critical-1',
          type: 'balance_overdraft',
          severity: 'critical',
          title: 'Overdraft risk',
          message: 'Needs attention',
          createdAt: '2025-05-06T12:00:00Z',
          status: 'unread',
        },
        {
          id: 'critical-2',
          type: 'balance_overdraft',
          severity: 'critical',
          title: 'Dismissed risk',
          message: 'Hidden',
          createdAt: '2025-05-06T12:00:00Z',
          status: 'dismissed',
        },
      ],
    });

    expect(view.sections.map((section) => section.kind)).toEqual([
      'budget_pace',
      'category_delta',
      'upcoming_bill',
      'goal_progress',
      'critical_alert',
    ]);
    expect(view.sections.some((section) => section.title === 'Dismissed risk')).toBe(false);
  });

  it('creates a positive low-activity detail section', () => {
    const view = buildSpendingDigestDetailView(digest, {
      cadence: 'weekly',
      periodStart: '2025-05-01',
      periodEnd: '2025-05-07',
    });

    expect(view.sections).toEqual([
      expect.objectContaining({ kind: 'low_activity', severity: 'positive' }),
    ]);
  });
});
