// SPDX-License-Identifier: BUSL-1.1

import type { HapticIntensity, HapticPreferences } from './types';

export const HAPTIC_PREFERENCES_STORAGE_KEY = 'finance-haptic-preferences';
export const HAPTIC_PREFERENCES_CHANGED_EVENT = 'finance:haptics-preferences-changed';

export const HAPTIC_INTENSITY_OPTIONS = [
  'off',
  'light',
  'medium',
  'strong',
] as const satisfies readonly HapticIntensity[];

export const DEFAULT_HAPTIC_PREFERENCES: HapticPreferences = {
  intensity: 'medium',
};

export function isHapticIntensity(value: unknown): value is HapticIntensity {
  return typeof value === 'string' && HAPTIC_INTENSITY_OPTIONS.includes(value as HapticIntensity);
}

export function normalizeHapticPreferences(
  value: Partial<HapticPreferences> | null | undefined,
): HapticPreferences {
  return {
    intensity: isHapticIntensity(value?.intensity)
      ? value.intensity
      : DEFAULT_HAPTIC_PREFERENCES.intensity,
  };
}

export function loadHapticPreferences(): HapticPreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_HAPTIC_PREFERENCES;
  }

  try {
    const stored = window.localStorage.getItem(HAPTIC_PREFERENCES_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_HAPTIC_PREFERENCES;
    }

    return normalizeHapticPreferences(JSON.parse(stored) as Partial<HapticPreferences>);
  } catch {
    return DEFAULT_HAPTIC_PREFERENCES;
  }
}

function broadcastHapticPreferences(preferences: HapticPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<HapticPreferences>(HAPTIC_PREFERENCES_CHANGED_EVENT, {
      detail: preferences,
    }),
  );
}

export function saveHapticPreferences(preferences: HapticPreferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeHapticPreferences(preferences);

  try {
    window.localStorage.setItem(HAPTIC_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be unavailable in constrained browsing contexts.
  }

  broadcastHapticPreferences(normalized);
}

export function updateHapticIntensity(intensity: HapticIntensity): HapticPreferences {
  const nextPreferences = normalizeHapticPreferences({ intensity });
  saveHapticPreferences(nextPreferences);
  return nextPreferences;
}
