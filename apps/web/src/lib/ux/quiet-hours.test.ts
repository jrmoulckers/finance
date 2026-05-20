// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { QueuedNotification, QuietHoursConfig } from './types';
import {
  DEFAULT_QUIET_HOURS,
  drainNotificationQueue,
  enqueueNotification,
  isInQuietHours,
  parseTimeToMinutes,
  setFocusMode,
  shouldSuppressNotification,
  updateActiveDays,
  updateQuietHoursTimes,
} from './quiet-hours';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDate(hours: number, minutes: number, day: number = 3): Date {
  // day: 0=Sun, 3=Wed
  const d = new Date(2025, 0, 5 + day, hours, minutes); // Jan 5 2025 is a Sunday
  return d;
}

const ENABLED_CONFIG: QuietHoursConfig = {
  enabled: true,
  startTime: '22:00',
  endTime: '07:00',
  activeDays: [0, 1, 2, 3, 4, 5, 6],
  focusModeActive: false,
};

const notification: QueuedNotification = {
  id: 'n1',
  title: 'Budget Alert',
  body: 'You are over budget',
  priority: 'normal',
  triggeredAt: '2025-01-15T23:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTimeToMinutes', () => {
  it('parses midnight', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
  });

  it('parses noon', () => {
    expect(parseTimeToMinutes('12:00')).toBe(720);
  });

  it('parses end of day', () => {
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('throws on invalid format', () => {
    expect(() => parseTimeToMinutes('abc')).toThrow();
  });

  it('throws on out-of-range hours', () => {
    expect(() => parseTimeToMinutes('25:00')).toThrow();
  });
});

describe('isInQuietHours', () => {
  it('returns false when disabled', () => {
    expect(isInQuietHours(DEFAULT_QUIET_HOURS, makeDate(23, 0))).toBe(false);
  });

  it('detects overnight quiet hours (before midnight)', () => {
    expect(isInQuietHours(ENABLED_CONFIG, makeDate(23, 0))).toBe(true);
  });

  it('detects overnight quiet hours (after midnight)', () => {
    expect(isInQuietHours(ENABLED_CONFIG, makeDate(3, 0))).toBe(true);
  });

  it('returns false outside quiet hours', () => {
    expect(isInQuietHours(ENABLED_CONFIG, makeDate(12, 0))).toBe(false);
  });

  it('returns false on inactive days', () => {
    const config = { ...ENABLED_CONFIG, activeDays: [1, 2, 3, 4, 5] }; // weekdays only
    // Sunday = day 0
    expect(isInQuietHours(config, makeDate(23, 0, 0))).toBe(false);
  });

  it('handles same-day spans', () => {
    const config = { ...ENABLED_CONFIG, startTime: '09:00', endTime: '17:00' };
    expect(isInQuietHours(config, makeDate(12, 0))).toBe(true);
    expect(isInQuietHours(config, makeDate(20, 0))).toBe(false);
  });
});

describe('shouldSuppressNotification', () => {
  it('suppresses during quiet hours', () => {
    expect(shouldSuppressNotification(ENABLED_CONFIG, makeDate(23, 0))).toBe(true);
  });

  it('does not suppress outside quiet hours', () => {
    expect(shouldSuppressNotification(ENABLED_CONFIG, makeDate(12, 0))).toBe(false);
  });

  it('never suppresses critical notifications', () => {
    expect(shouldSuppressNotification(ENABLED_CONFIG, makeDate(23, 0), 'critical')).toBe(false);
  });

  it('suppresses when focus mode is active', () => {
    const config = { ...DEFAULT_QUIET_HOURS, focusModeActive: true };
    expect(shouldSuppressNotification(config, makeDate(12, 0))).toBe(true);
  });
});

describe('enqueueNotification', () => {
  it('appends to existing queue', () => {
    const result = enqueueNotification([], notification);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1');
  });

  it('does not mutate original queue', () => {
    const original: QueuedNotification[] = [];
    enqueueNotification(original, notification);
    expect(original).toHaveLength(0);
  });
});

describe('drainNotificationQueue', () => {
  it('returns sorted notifications and empty queue', () => {
    const high: QueuedNotification = { ...notification, id: 'n2', priority: 'high' };
    const low: QueuedNotification = { ...notification, id: 'n3', priority: 'low' };
    const { toDeliver, remainingQueue } = drainNotificationQueue([low, notification, high]);

    expect(toDeliver).toHaveLength(3);
    expect(toDeliver[0].priority).toBe('high');
    expect(toDeliver[1].priority).toBe('normal');
    expect(toDeliver[2].priority).toBe('low');
    expect(remainingQueue).toEqual([]);
  });
});

describe('setFocusMode', () => {
  it('toggles focus mode on', () => {
    const result = setFocusMode(DEFAULT_QUIET_HOURS, true);
    expect(result.focusModeActive).toBe(true);
  });

  it('toggles focus mode off', () => {
    const config = { ...ENABLED_CONFIG, focusModeActive: true };
    const result = setFocusMode(config, false);
    expect(result.focusModeActive).toBe(false);
  });
});

describe('updateQuietHoursTimes', () => {
  it('updates times', () => {
    const result = updateQuietHoursTimes(ENABLED_CONFIG, '21:00', '06:00');
    expect(result.startTime).toBe('21:00');
    expect(result.endTime).toBe('06:00');
  });

  it('throws on invalid time', () => {
    expect(() => updateQuietHoursTimes(ENABLED_CONFIG, 'bad', '06:00')).toThrow();
  });
});

describe('updateActiveDays', () => {
  it('filters and deduplicates days', () => {
    const result = updateActiveDays(ENABLED_CONFIG, [1, 1, 3, 7, -1]);
    expect(result.activeDays).toEqual([1, 3]);
  });
});
