// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared notification store context.
 *
 * The notification quick-view popover (in the header/sidebar) and the full
 * `/notifications` page must operate on the same notification state so that
 * marking read, dismissing, or clearing in one place is reflected everywhere
 * (including the unread badge). `useNotifications` keeps its state in a
 * component-local `useState`, so calling it in two places would create two
 * diverging stores. This provider owns a single `useNotifications` instance
 * and shares it via context, and also runs the reactive alert-injection
 * effects (scam checks, warranty reminders) that feed the store.
 *
 * @module contexts/NotificationsContext
 * References: #3539
 */

import { createContext, useContext, useEffect, useMemo, type FC, type ReactNode } from 'react';

import { useNotifications, type UseNotificationsResult } from '../hooks/useNotifications';
import { useTransactions } from '../hooks';
import { detectScamAlerts, scamAlertsToNotifications } from '../lib/notifications';
import {
  buildWarrantyReminderNotifications,
  buildWarrantyReminders,
  useWarrantyEntries,
} from '../lib/warranty';

const NotificationsContext = createContext<UseNotificationsResult | null>(null);

/** Props for {@link NotificationsProvider}. */
export interface NotificationsProviderProps {
  readonly children: ReactNode;
}

/**
 * Provides a single shared notification store to the component tree and keeps
 * it fed with reactively-derived alerts (scam checks and warranty reminders).
 */
export const NotificationsProvider: FC<NotificationsProviderProps> = ({ children }) => {
  const store = useNotifications();
  const { notifications, loading, addNotifications } = store;

  const warrantyEntries = useWarrantyEntries();
  const scamTransactionFilters = useMemo(() => ({ type: 'EXPENSE' as const }), []);
  const { transactions: scamTransactions } = useTransactions(scamTransactionFilters);
  const scamNotifications = useMemo(
    () => scamAlertsToNotifications(detectScamAlerts(scamTransactions)),
    [scamTransactions],
  );

  // Inject warranty reminder notifications as warranty data changes.
  useEffect(() => {
    if (loading) {
      return;
    }

    const existingDeduplicationKeys = new Set(
      notifications
        .map((notification) => notification.deduplicationKey)
        .filter((key): key is string => typeof key === 'string' && key.length > 0),
    );
    const reminderNotifications = buildWarrantyReminderNotifications(
      buildWarrantyReminders(warrantyEntries, undefined, existingDeduplicationKeys),
    );

    if (reminderNotifications.length > 0) {
      addNotifications(reminderNotifications);
    }
  }, [addNotifications, loading, notifications, warrantyEntries]);

  // Inject newly-detected scam-check notifications.
  useEffect(() => {
    if (loading) {
      return;
    }

    const knownNotificationKeys = new Set(
      notifications.map((notification) => notification.deduplicationKey ?? notification.id),
    );
    const newScamNotifications = scamNotifications.filter(
      (notification) =>
        !knownNotificationKeys.has(notification.deduplicationKey ?? notification.id),
    );
    addNotifications(newScamNotifications);
  }, [addNotifications, loading, notifications, scamNotifications]);

  return <NotificationsContext.Provider value={store}>{children}</NotificationsContext.Provider>;
};

/**
 * Access the shared notification store.
 *
 * @throws if used outside a {@link NotificationsProvider}.
 */
export function useNotificationCenter(): UseNotificationsResult {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationCenter must be used within a <NotificationsProvider>.');
  }
  return ctx;
}
