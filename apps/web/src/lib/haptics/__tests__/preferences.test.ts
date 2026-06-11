// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_HAPTIC_PREFERENCES,
  HAPTIC_PREFERENCES_CHANGED_EVENT,
  HAPTIC_PREFERENCES_STORAGE_KEY,
  loadHapticPreferences,
  normalizeHapticPreferences,
  saveHapticPreferences,
  updateHapticIntensity,
} from '../preferences';

describe('haptic preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('loads defaults when nothing is stored', () => {
    expect(loadHapticPreferences()).toEqual(DEFAULT_HAPTIC_PREFERENCES);
  });

  it('normalizes invalid stored values back to defaults', () => {
    localStorage.setItem(HAPTIC_PREFERENCES_STORAGE_KEY, JSON.stringify({ intensity: 'max' }));

    expect(loadHapticPreferences()).toEqual(DEFAULT_HAPTIC_PREFERENCES);
    expect(normalizeHapticPreferences({ intensity: 'light' })).toEqual({ intensity: 'light' });
  });

  it('persists preferences and broadcasts a change event', () => {
    const handler = vi.fn();
    window.addEventListener(HAPTIC_PREFERENCES_CHANGED_EVENT, handler);

    saveHapticPreferences({ intensity: 'strong' });

    expect(JSON.parse(localStorage.getItem(HAPTIC_PREFERENCES_STORAGE_KEY) ?? 'null')).toEqual({
      intensity: 'strong',
    });
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener(HAPTIC_PREFERENCES_CHANGED_EVENT, handler);
  });

  it('updates just the intensity helper', () => {
    expect(updateHapticIntensity('off')).toEqual({ intensity: 'off' });
    expect(loadHapticPreferences()).toEqual({ intensity: 'off' });
  });
});
