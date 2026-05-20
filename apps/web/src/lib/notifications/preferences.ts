// SPDX-License-Identifier: BUSL-1.1

/**
 * Notification preference persistence via localStorage.
 *
 * Preferences are stored per-device (web-specific) in localStorage.
 * This module provides read/write helpers with validation and
 * migration support.
 *
 * @module lib/notifications/preferences
 * References: #1655
 */

import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './types';

const STORAGE_KEY = 'finance-notification-preferences';

/**
 * Load notification preferences from localStorage.
 *
 * Returns defaults if no preferences are stored or if parsing fails.
 */
export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }

    const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
    return mergeWithDefaults(parsed);
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Save notification preferences to localStorage.
 *
 * @param prefs - The preferences to persist.
 */
export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or unavailable — fail silently.
    // The app continues working with in-memory preferences.
  }
}

/**
 * Merge partial stored preferences with defaults to handle missing fields
 * after schema migrations.
 */
function mergeWithDefaults(partial: Partial<NotificationPreferences>): NotificationPreferences {
  return {
    enabled: partial.enabled ?? DEFAULT_NOTIFICATION_PREFERENCES.enabled,
    doNotDisturb: partial.doNotDisturb ?? DEFAULT_NOTIFICATION_PREFERENCES.doNotDisturb,
    quietHours: partial.quietHours ?? DEFAULT_NOTIFICATION_PREFERENCES.quietHours,
    channelPreferences:
      partial.channelPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES.channelPreferences,
    budgetAlerts: partial.budgetAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.budgetAlerts,
    goalAlerts: partial.goalAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.goalAlerts,
    balanceAlerts: partial.balanceAlerts ?? DEFAULT_NOTIFICATION_PREFERENCES.balanceAlerts,
    transactionConfirmations:
      partial.transactionConfirmations ?? DEFAULT_NOTIFICATION_PREFERENCES.transactionConfirmations,
    soundEnabled: partial.soundEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled,
    paceSensitivity: partial.paceSensitivity ?? DEFAULT_NOTIFICATION_PREFERENCES.paceSensitivity,
  };
}
