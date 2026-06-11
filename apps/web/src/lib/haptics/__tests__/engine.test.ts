// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  isHapticsSupported,
  playHapticPattern,
  resolveHapticPattern,
  stopHaptics,
  triggerHaptic,
} from '../engine';

describe('haptics engine', () => {
  it('scales active vibration segments by intensity', () => {
    expect(resolveHapticPattern('budget_warning', 'off')).toEqual([]);
    expect(resolveHapticPattern('budget_warning', 'light')).toEqual([70, 50, 70]);
    expect(resolveHapticPattern('budget_warning', 'medium')).toEqual([100, 50, 100]);
    expect(resolveHapticPattern('budget_warning', 'strong')).toEqual([135, 50, 135]);
  });

  it('detects Vibration API support', () => {
    expect(isHapticsSupported({ vibrate: vi.fn() })).toBe(true);
    expect(isHapticsSupported({} as Navigator)).toBe(false);
  });

  it('plays and stops patterns through navigator.vibrate', () => {
    const vibrate = vi.fn().mockReturnValue(true);

    expect(playHapticPattern([10, 20, 10], { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([10, 20, 10]);

    expect(triggerHaptic('budget_critical', 'medium', { vibrate })).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([150, 50, 150, 50, 150]);

    expect(stopHaptics({ vibrate })).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });

  it('returns false when patterns cannot be played', () => {
    expect(playHapticPattern([], { vibrate: vi.fn() })).toBe(false);
    expect(triggerHaptic('goal_reached', 'off', { vibrate: vi.fn() })).toBe(false);
    expect(stopHaptics(null)).toBe(false);
  });
});
