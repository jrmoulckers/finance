// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the in-app notification center.
 *
 * Manages the notification list, unread count, read/dismiss actions,
 * and evaluation triggers. Alert evaluation runs reactively when
 * budget, goal, or account data changes.
 *
 * Components access notifications exclusively through this hook.
 *
 * Usage:
 * ```tsx
 * const { notifications, unreadCount, markAsRead, dismiss } = useNotifications();
 * ```
 *
 * @module hooks/useNotifications
 * References: #1646, #1648, #1655, #1659
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppNotification, NotificationId, NotificationStatus } from '../lib/notifications';
import { rateLimitNotifications, shouldDeliverNotification } from '../lib/notifications';
import { loadNotificationPreferences } from '../lib/notifications/preferences';
import { wakeExpiredSnoozes } from '../lib/notifications/snooze';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance-notifications';
const MAX_STORED_NOTIFICATIONS = 200;
/** How often to re-check for snoozed notifications whose wake time has passed. */
const SNOOZE_WAKE_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useNotifications}. */
export interface UseNotificationsResult {
  /** All notifications, newest first. */
  notifications: readonly AppNotification[];
  /** Number of unread notifications. */
  unreadCount: number;
  /** Whether the notification center is loading. */
  loading: boolean;
  /** Mark a notification as read. */
  markAsRead: (id: NotificationId) => void;
  /** Mark all notifications as read. */
  markAllAsRead: () => void;
  /** Dismiss (hide) a notification. */
  dismiss: (id: NotificationId) => void;
  /**
   * Snooze a notification until the given ISO-8601 timestamp. The notification
   * is hidden from active views until then, when it is restored to `unread`.
   */
  snooze: (id: NotificationId, until: string) => void;
  /** Clear all dismissed notifications from history. */
  clearDismissed: () => void;
  /** Add a new notification (used by alert evaluators and transaction confirmations). */
  addNotification: (notification: AppNotification) => void;
  /** Add multiple notifications at once (used by batch evaluation). */
  addNotifications: (notifications: readonly AppNotification[]) => void;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Load notifications from localStorage. */
function loadNotifications(): AppNotification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as AppNotification[];
  } catch {
    return [];
  }
}

/** Save notifications to localStorage, capped at MAX_STORED_NOTIFICATIONS. */
function saveNotifications(notifications: readonly AppNotification[]): void {
  try {
    const trimmed = notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full — fail silently.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manage the notification center's state, persistence, and actions.
 *
 * Notifications are persisted in localStorage so they survive page reloads.
 * Rate limiting and quiet hours are applied when adding new notifications.
 */
export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const firedTimestampsRef = useRef<Map<string, number>>(new Map());

  // Load persisted notifications on mount, waking any snoozes that have already
  // elapsed while the app was closed.
  useEffect(() => {
    const stored = loadNotifications();
    setNotifications([...wakeExpiredSnoozes(stored)]);
    setLoading(false);
  }, []);

  // Periodically restore snoozed notifications whose wake time has passed.
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) => {
        const woken = wakeExpiredSnoozes(prev);
        return woken === prev ? prev : [...woken];
      });
    }, SNOOZE_WAKE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Persist whenever notifications change (skip initial load)
  const isInitialRef = useRef(true);
  useEffect(() => {
    if (isInitialRef.current) {
      isInitialRef.current = false;
      return;
    }
    saveNotifications(notifications);
  }, [notifications]);

  const addNotification = useCallback((notification: AppNotification) => {
    const prefs = loadNotificationPreferences();

    // Apply global enablement, channel preferences, DND, and quiet hours.
    if (!shouldDeliverNotification(notification, prefs, 'in_app')) {
      return;
    }

    // Rate limit
    const { filtered, updatedTimestamps } = rateLimitNotifications(
      [notification],
      firedTimestampsRef.current,
    );
    firedTimestampsRef.current = updatedTimestamps;

    if (filtered.length === 0) {
      return;
    }

    setNotifications((prev) => [filtered[0], ...prev]);
  }, []);

  const addNotifications = useCallback((newNotifications: readonly AppNotification[]) => {
    if (newNotifications.length === 0) return;

    const prefs = loadNotificationPreferences();

    // Apply global enablement, channel preferences, DND, and quiet hours.
    const allowed = newNotifications.filter((notification) =>
      shouldDeliverNotification(notification, prefs, 'in_app'),
    );

    if (allowed.length === 0) return;

    // Rate limit
    const { filtered, updatedTimestamps } = rateLimitNotifications(
      allowed,
      firedTimestampsRef.current,
    );
    firedTimestampsRef.current = updatedTimestamps;

    if (filtered.length === 0) return;

    setNotifications((prev) => [...filtered, ...prev]);
  }, []);

  const updateStatus = useCallback((id: NotificationId, status: NotificationStatus) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
  }, []);

  const markAsRead = useCallback((id: NotificationId) => updateStatus(id, 'read'), [updateStatus]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.status === 'unread' ? { ...n, status: 'read' } : n)),
    );
  }, []);

  const dismiss = useCallback(
    (id: NotificationId) => {
      updateStatus(id, 'dismissed');
    },
    [updateStatus],
  );

  const snooze = useCallback((id: NotificationId, until: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'snoozed', snoozedUntil: until } : n)),
    );
  }, []);

  const clearDismissed = useCallback(() => {
    setNotifications((prev) => prev.filter((n) => n.status !== 'dismissed'));
  }, []);

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    dismiss,
    snooze,
    clearDismissed,
    addNotification,
    addNotifications,
  };
}
