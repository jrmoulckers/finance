// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildWarrantyReminderNotifications,
  buildWarrantyReminders,
  getReturnWindowState,
  getUpcomingDeadlines,
  getWarrantyStatus,
} from './reminders';
import type { WarrantyEntry } from './types';

function createEntry(overrides: Partial<WarrantyEntry> = {}): WarrantyEntry {
  return {
    id: 'warranty-1',
    transactionId: 'transaction-1',
    merchantName: 'Amazon',
    itemName: 'Laptop',
    purchaseDate: '2025-05-01',
    amountCents: 129999,
    currencyCode: 'USD',
    warrantyExpiryDate: '2025-05-08',
    returnWindowEndDate: '2025-05-04',
    receiptPhotoUrl: null,
    notes: null,
    createdAt: '2025-05-01T00:00:00.000Z',
    updatedAt: '2025-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('warranty reminders', () => {
  it('marks entries expiring within 30 days as expiring soon', () => {
    expect(getWarrantyStatus(createEntry(), '2025-05-01')).toBe('expiring-soon');
  });

  it('marks entries with only past deadlines as expired', () => {
    expect(
      getWarrantyStatus(
        createEntry({ warrantyExpiryDate: '2025-04-10', returnWindowEndDate: '2025-04-05' }),
        '2025-05-01',
      ),
    ).toBe('expired');
  });

  it('returns urgency-sorted upcoming deadlines', () => {
    const deadlines = getUpcomingDeadlines(
      [
        createEntry(),
        createEntry({
          id: 'warranty-2',
          transactionId: 'transaction-2',
          itemName: 'Speaker',
          warrantyExpiryDate: '2025-05-03',
          returnWindowEndDate: null,
        }),
      ],
      '2025-05-01',
    );

    expect(deadlines[0]?.itemName).toBe('Speaker');
    expect(deadlines[0]?.daysRemaining).toBe(2);
  });

  it('builds reminder notifications for 7/3/1 day thresholds', () => {
    const reminders = buildWarrantyReminders([createEntry()], '2025-05-01');
    const notifications = buildWarrantyReminderNotifications(reminders);

    expect(reminders).toHaveLength(2);
    expect(reminders[0]?.thresholdDays).toBe(3);
    expect(notifications[0]?.entityType).toBe('transaction');
    expect(notifications[0]?.type).toBe('return_window_deadline');
  });

  it('skips reminders that already have deduplication keys', () => {
    const reminders = buildWarrantyReminders(
      [createEntry()],
      '2025-05-01',
      new Set(['warranty:transaction-1:return-window:3']),
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.type).toBe('warranty');
  });

  it('reports return-window eligibility state', () => {
    const eligible = getReturnWindowState(createEntry(), '2025-05-01');
    const closed = getReturnWindowState(createEntry(), '2025-05-06');

    expect(eligible.isEligible).toBe(true);
    expect(eligible.isClosingSoon).toBe(true);
    expect(closed.isClosed).toBe(true);
  });
});
