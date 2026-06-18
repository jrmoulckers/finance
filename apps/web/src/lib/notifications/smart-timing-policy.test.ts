// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { chooseNotificationTime } from './smart-timing-policy';

describe('smart notification timing policy', () => {
  it('defers normal alerts until quiet hours end', () => {
    expect(
      chooseNotificationTime({
        now: '2026-04-10T03:30:00.000Z',
        priority: 'normal',
        quietHours: { startHour: 22, endHour: 7 },
        preferredHours: [9],
        fallbackDelayMinutes: 30,
      }),
    ).toEqual({ scheduledAt: '2026-04-10T07:00:00.000Z', reason: 'after-quiet-hours' });
  });

  it('lets critical alerts bypass quiet hours and falls back for high priority', () => {
    expect(
      chooseNotificationTime({
        now: '2026-04-10T23:00:00.000Z',
        priority: 'critical',
        quietHours: { startHour: 22, endHour: 7 },
        preferredHours: [],
        fallbackDelayMinutes: 30,
      }).reason,
    ).toBe('send-now');
    expect(
      chooseNotificationTime({
        now: '2026-04-10T12:00:00.000Z',
        priority: 'high',
        quietHours: { startHour: 22, endHour: 7 },
        preferredHours: [18],
        fallbackDelayMinutes: 15,
      }),
    ).toEqual({ scheduledAt: '2026-04-10T12:15:00.000Z', reason: 'fallback-delay' });
  });
});
