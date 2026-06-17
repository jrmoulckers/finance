// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';

import { isHapticsSupported, stopHaptics, triggerHaptic } from '../lib/haptics/engine';
import {
  DEFAULT_HAPTIC_PREFERENCES,
  HAPTIC_PREFERENCES_CHANGED_EVENT,
  HAPTIC_PREFERENCES_STORAGE_KEY,
  loadHapticPreferences,
  saveHapticPreferences,
} from '../lib/haptics/preferences';
import type { HapticEventType, HapticIntensity, HapticPreferences } from '../lib/haptics/types';

export interface UseHapticsResult {
  readonly isSupported: boolean;
  readonly preferences: HapticPreferences;
  readonly setIntensity: (intensity: HapticIntensity) => void;
  readonly trigger: (eventType: HapticEventType) => boolean;
  readonly stop: () => boolean;
}

export function useHaptics(): UseHapticsResult {
  const [preferences, setPreferences] = useState<HapticPreferences>(() => loadHapticPreferences());
  const supported = isHapticsSupported();

  useEffect(() => {
    setPreferences(loadHapticPreferences());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncPreferences = () => {
      setPreferences(loadHapticPreferences());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HAPTIC_PREFERENCES_STORAGE_KEY) {
        syncPreferences();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(HAPTIC_PREFERENCES_CHANGED_EVENT, syncPreferences as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        HAPTIC_PREFERENCES_CHANGED_EVENT,
        syncPreferences as EventListener,
      );
    };
  }, []);

  const setIntensity = useCallback((intensity: HapticIntensity) => {
    const nextPreferences: HapticPreferences = { intensity };
    saveHapticPreferences(nextPreferences);
    setPreferences(nextPreferences);

    if (intensity === 'off') {
      stopHaptics();
    }
  }, []);

  const trigger = useCallback(
    (eventType: HapticEventType) => {
      if (!supported || preferences.intensity === 'off') {
        return false;
      }

      return triggerHaptic(eventType, preferences.intensity);
    },
    [preferences.intensity, supported],
  );

  const stop = useCallback(() => stopHaptics(), []);

  return {
    isSupported: supported,
    preferences: preferences ?? DEFAULT_HAPTIC_PREFERENCES,
    setIntensity,
    trigger,
    stop,
  };
}
