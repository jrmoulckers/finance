// SPDX-License-Identifier: BUSL-1.1

/**
 * Reactive alert-injection effects for the shared notification store.
 *
 * This component owns the heavier, feature-specific derivations (scam checks
 * and warranty reminders) that feed the notification store. It is deliberately
 * kept out of `src/contexts/` so that the `scam-alerts` and `warranty` libraries
 * it pulls in are not hoisted into the shared `vendor-app` infrastructure chunk
 * (which is budget-constrained — see #3478/#2983). Rendering it inside a
 * {@link NotificationsProvider} keeps this logic in the authenticated app graph,
 * exactly where it lived before the store was extracted.
 *
 * It renders nothing; it only runs effects.
 *
 * @module components/notifications/NotificationInjectors
 * References: #3539
 */

import { useEffect, useMemo, type FC } from 'react';

import { useNotificationCenter } from '../../contexts/NotificationsContext';
import { useTransactions } from '../../hooks';
import { detectScamAlerts, scamAlertsToNotifications } from '../../lib/notifications';
import {
  buildWarrantyReminderNotifications,
  buildWarrantyReminders,
  useWarrantyEntries,
} from '../../lib/warranty';

/**
 * Feeds the shared notification store with reactively-derived alerts (scam
 * checks and warranty reminders). Must be rendered inside a
 * {@link NotificationsProvider}. Renders nothing.
 */
export const NotificationInjectors: FC = () => {
  const { notifications, loading, addNotifications } = useNotificationCenter();

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

  return null;
};
