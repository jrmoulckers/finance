// SPDX-License-Identifier: BUSL-1.1

/**
 * Full-page notifications view.
 *
 * The header bell opens a compact quick-view popover; this page is the
 * dedicated destination its "See all notifications" link routes to. It reuses
 * the shared notification store (via {@link useNotificationCenter}) and the
 * filterable {@link NotificationHistory} list so large notification volumes
 * can be browsed, filtered, marked read, and dismissed comfortably.
 *
 * @module pages/NotificationsPage
 * References: #3539
 */

import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';

import { NotificationHistory } from '../components/notifications';
import { useNotificationCenter } from '../contexts/NotificationsContext';
import type { AppNotification } from '../lib/notifications';
import './NotificationsPage.css';

/** Dedicated notifications screen for browsing the full notification history. */
export const NotificationsPage: FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss, clearDismissed } =
    useNotificationCenter();

  const handleAction = (notification: AppNotification): void => {
    if (notification.entityType === 'transaction' && notification.entityId) {
      navigate(`/transactions/${notification.entityId}`);
    }
  };

  return (
    <main className="notifications-page" aria-labelledby="notifications-page-title">
      <header className="notifications-page__header">
        <div>
          <p className="notifications-page__eyebrow">Alerts &amp; reminders</p>
          <h1 id="notifications-page-title" className="notifications-page__title">
            Notifications
          </h1>
          <p className="notifications-page__intro">
            {unreadCount > 0
              ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}.`
              : 'You are all caught up.'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="notifications-page__mark-all" onClick={markAllAsRead}>
            Mark all read
          </button>
        )}
      </header>

      <NotificationHistory
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onDismiss={dismiss}
        onClearDismissed={clearDismissed}
        onAction={handleAction}
      />
    </main>
  );
};

export default NotificationsPage;
