// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing notification preferences.
 *
 * Reads/writes notification preferences from localStorage, providing
 * a reactive interface for the preferences UI. Changes are persisted
 * immediately on update.
 *
 * Usage:
 * ```tsx
 * const { preferences, updatePreferences, resetToDefaults } = useNotificationPreferences();
 * ```
 *
 * @module hooks/useNotificationPreferences
 * References: #1655
 */

import { useCallback, useEffect, useState } from 'react';
import type { NotificationPreferences } from '../lib/notifications';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../lib/notifications';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '../lib/notifications/preferences';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useNotificationPreferences}. */
export interface UseNotificationPreferencesResult {
  /** Current notification preferences. */
  preferences: NotificationPreferences;
  /** Whether preferences are loading from storage. */
  loading: boolean;
  /** Update one or more preference fields. */
  updatePreferences: (updates: Partial<NotificationPreferences>) => void;
  /** Reset all preferences to defaults. */
  resetToDefaults: () => void;
  /** Toggle do-not-disturb mode. */
  toggleDoNotDisturb: () => void;
  /** Toggle global notification enable/disable. */
  toggleEnabled: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Load and manage notification preferences with localStorage persistence.
 */
export function useNotificationPreferences(): UseNotificationPreferencesResult {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);

  // Load from storage on mount
  useEffect(() => {
    const stored = loadNotificationPreferences();
    setPreferences(stored);
    setLoading(false);
  }, []);

  const updatePreferences = useCallback((updates: Partial<NotificationPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...updates };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
  }, []);

  const toggleDoNotDisturb = useCallback(() => {
    setPreferences((prev) => {
      const next = { ...prev, doNotDisturb: !prev.doNotDisturb };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const toggleEnabled = useCallback(() => {
    setPreferences((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  return {
    preferences,
    loading,
    updatePreferences,
    resetToDefaults,
    toggleDoNotDisturb,
    toggleEnabled,
  };
}
