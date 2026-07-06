// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { computeLoggingStreak } from './logging-streak';
import { toLocalDate } from '../insights/helpers';

/** Local date key for `now` shifted by `offsetDays` (negative = past). */
function dayKey(now: Date, offsetDays: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return toLocalDate(d);
}

describe('computeLoggingStreak', () => {
  // Evening reference time to guard against UTC off-by-one handling.
  const now = new Date(2024, 5, 15, 20, 30, 0);

  it('returns zeros for no transactions', () => {
    expect(computeLoggingStreak([], now)).toEqual({
      current: 0,
      longest: 0,
      loggedToday: false,
    });
  });

  it('counts a run ending today as the current streak', () => {
    const dates = [dayKey(now, 0), dayKey(now, -1), dayKey(now, -2)];
    const result = computeLoggingStreak(dates, now);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.loggedToday).toBe(true);
  });

  it('treats yesterday as a one-day grace (streak still current, not logged today)', () => {
    const dates = [dayKey(now, -1), dayKey(now, -2)];
    const result = computeLoggingStreak(dates, now);
    expect(result.current).toBe(2);
    expect(result.loggedToday).toBe(false);
  });

  it('reports 0 current when the last activity is older than yesterday', () => {
    const dates = [dayKey(now, -3), dayKey(now, -4), dayKey(now, -5)];
    const result = computeLoggingStreak(dates, now);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
    expect(result.loggedToday).toBe(false);
  });

  it('does not surface a stale 10-day run as the current streak', () => {
    const dates = Array.from({ length: 10 }, (_v, i) => dayKey(now, -20 - i));
    const result = computeLoggingStreak(dates, now);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(10);
  });

  it('counts an evening-logged "today" regardless of time-of-day (no UTC drift)', () => {
    const lateNight = new Date(2024, 5, 15, 23, 45, 0);
    const dates = [toLocalDate(lateNight)];
    const result = computeLoggingStreak(dates, lateNight);
    expect(result.loggedToday).toBe(true);
    expect(result.current).toBe(1);
  });

  it('ignores gaps when measuring the longest historical streak', () => {
    const dates = [
      dayKey(now, 0),
      dayKey(now, -1),
      // gap
      dayKey(now, -5),
      dayKey(now, -6),
      dayKey(now, -7),
      dayKey(now, -8),
    ];
    const result = computeLoggingStreak(dates, now);
    expect(result.current).toBe(2);
    expect(result.longest).toBe(4);
  });
});
