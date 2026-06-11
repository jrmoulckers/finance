// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HAPTIC_PREFERENCES_CHANGED_EVENT,
  HAPTIC_PREFERENCES_STORAGE_KEY,
} from '../lib/haptics/preferences';
import { useHaptics } from './useHaptics';

describe('useHaptics', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vibrate.mockReset();
    vibrate.mockReturnValue(true);
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
  });

  it('loads saved preferences on mount', () => {
    localStorage.setItem(HAPTIC_PREFERENCES_STORAGE_KEY, JSON.stringify({ intensity: 'strong' }));

    const { result } = renderHook(() => useHaptics());

    expect(result.current.isSupported).toBe(true);
    expect(result.current.preferences.intensity).toBe('strong');
  });

  it('persists intensity updates locally', () => {
    const { result } = renderHook(() => useHaptics());

    act(() => {
      result.current.setIntensity('light');
    });

    expect(result.current.preferences.intensity).toBe('light');
    expect(JSON.parse(localStorage.getItem(HAPTIC_PREFERENCES_STORAGE_KEY) ?? 'null')).toEqual({
      intensity: 'light',
    });
  });

  it('triggers the matching vibration pattern', () => {
    localStorage.setItem(HAPTIC_PREFERENCES_STORAGE_KEY, JSON.stringify({ intensity: 'strong' }));
    const { result } = renderHook(() => useHaptics());

    act(() => {
      result.current.trigger('budget_warning');
    });

    expect(vibrate).toHaveBeenCalledWith([135, 50, 135]);
  });

  it('syncs when another part of the app updates preferences', () => {
    const { result } = renderHook(() => useHaptics());

    act(() => {
      localStorage.setItem(HAPTIC_PREFERENCES_STORAGE_KEY, JSON.stringify({ intensity: 'off' }));
      window.dispatchEvent(new Event(HAPTIC_PREFERENCES_CHANGED_EVENT));
    });

    expect(result.current.preferences.intensity).toBe('off');
  });
});
