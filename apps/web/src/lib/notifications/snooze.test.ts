// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the snooze helpers.
 *
 * @module lib/notifications/snooze.test
 * References: #3792
 */

import { describe, expect, it } from 'vitest';
import type { AppNotification } from './types';
import {
  SNOOZE_OPTIONS,
  formatSnoozeUntil,
  isSnoozeExpired,
  snoozeUntil,
  wakeExpiredSnoozes,
} from './snooze';

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'bill_due',
    severity: 'info',
    title: 'Rent due',
    message: 'Rent is due in 3 days.',
    createdAt: '2025-01-01T00:00:00.000Z',
    status: 'unread',
    ...overrides,
  };
}

describe('snoozeUntil', () => {
  const from = new Date('2025-01-01T12:00:00.000Z');

  it('adds one hour for the one-hour option', () => {
    expect(snoozeUntil('one-hour', from)).toBe('2025-01-01T13:00:00.000Z');
  });

  it('adds three hours for the three-hours option', () => {
    expect(snoozeUntil('three-hours', from)).toBe('2025-01-01T15:00:00.000Z');
  });

  it('resolves tomorrow to 08:00 local the next day', () => {
    const result = new Date(snoozeUntil('tomorrow', from));
    expect(result.getHours()).toBe(8);
    expect(result.getDate()).toBe(2);
  });

  it('resolves next week to 08:00 local seven days ahead', () => {
    const result = new Date(snoozeUntil('next-week', from));
    expect(result.getHours()).toBe(8);
    // 1 Jan + 7 days = 8 Jan.
    expect(result.getDate()).toBe(8);
  });

  it('offers exactly the four documented options', () => {
    expect(SNOOZE_OPTIONS.map((o) => o.id)).toEqual([
      'one-hour',
      'three-hours',
      'tomorrow',
      'next-week',
    ]);
  });
});

describe('isSnoozeExpired', () => {
  it('is false for non-snoozed notifications', () => {
    expect(isSnoozeExpired(makeNotification({ status: 'unread' }), Date.now())).toBe(false);
  });

  it('is false while the wake time is still in the future', () => {
    const n = makeNotification({ status: 'snoozed', snoozedUntil: '2025-01-01T13:00:00.000Z' });
    expect(isSnoozeExpired(n, new Date('2025-01-01T12:30:00.000Z').getTime())).toBe(false);
  });

  it('is true once the wake time has passed', () => {
    const n = makeNotification({ status: 'snoozed', snoozedUntil: '2025-01-01T13:00:00.000Z' });
    expect(isSnoozeExpired(n, new Date('2025-01-01T13:00:01.000Z').getTime())).toBe(true);
  });
});

describe('wakeExpiredSnoozes', () => {
  const now = new Date('2025-01-01T13:30:00.000Z').getTime();

  it('restores expired snoozes to unread and clears the wake time', () => {
    const input = [
      makeNotification({ id: 'a', status: 'snoozed', snoozedUntil: '2025-01-01T13:00:00.000Z' }),
    ];
    const [woken] = wakeExpiredSnoozes(input, now);
    expect(woken.status).toBe('unread');
    expect(woken.snoozedUntil).toBeUndefined();
  });

  it('leaves future snoozes untouched and returns the same reference', () => {
    const input = [
      makeNotification({ id: 'b', status: 'snoozed', snoozedUntil: '2025-01-02T08:00:00.000Z' }),
    ];
    expect(wakeExpiredSnoozes(input, now)).toBe(input);
  });
});

describe('formatSnoozeUntil', () => {
  it('produces a "Snoozed until …" label', () => {
    expect(formatSnoozeUntil('2025-01-02T08:00:00.000Z')).toMatch(/^Snoozed until /);
  });

  it('degrades gracefully for an invalid timestamp', () => {
    expect(formatSnoozeUntil('not-a-date')).toBe('Snoozed');
  });
});
