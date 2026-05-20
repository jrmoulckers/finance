// SPDX-License-Identifier: BUSL-1.1

/**
 * Notification history/log viewer component.
 *
 * Displays a full-page list of all notifications with filtering
 * by type and status. Provides a persistent activity history
 * per acceptance criteria (#1659).
 *
 * @module components/notifications/NotificationHistory
 * References: #1655, #1659
 */

import type { FC } from 'react';
import { useMemo, useState } from 'react';
import type { AlertType, AppNotification, NotificationStatus } from '../../lib/notifications';
import './notifications.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the NotificationHistory component. */
export interface NotificationHistoryProps {
  /** All notifications, newest first. */
  notifications: readonly AppNotification[];
  /** Callback when a notification is marked as read. */
  onMarkAsRead: (id: string) => void;
  /** Callback when a notification is dismissed. */
  onDismiss: (id: string) => void;
  /** Callback to clear all dismissed notifications. */
  onClearDismissed: () => void;
  /** Callback when a notification action is clicked. */
  onAction?: (notification: AppNotification) => void;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | NotificationStatus;
type TypeFilter = 'all' | AlertType;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'dismissed', label: 'Dismissed' },
];

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'budget_threshold', label: 'Budget' },
  { value: 'goal_milestone', label: 'Goals' },
  { value: 'balance_low', label: 'Balance' },
  { value: 'spending_pace', label: 'Pace' },
  { value: 'predictive_overspend', label: 'Predictions' },
  { value: 'transaction_confirmation', label: 'Transactions' },
  { value: 'batch_confirmation', label: 'Batches' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date for display in the history log. */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full notification history viewer.
 *
 * Accessible with ARIA labels on filter buttons, list role on
 * the notification list, and keyboard-navigable items.
 */
export const NotificationHistory: FC<NotificationHistoryProps> = ({
  notifications,
  onMarkAsRead,
  onDismiss,
  onClearDismissed,
  onAction,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      return true;
    });
  }, [notifications, statusFilter, typeFilter]);

  const dismissedCount = notifications.filter((n) => n.status === 'dismissed').length;

  return (
    <section className="notification-history" aria-label="Notification history">
      <div className="notification-history__header">
        <h2 className="notification-history__title">Notification History</h2>
        {dismissedCount > 0 && (
          <button
            className="notification-panel__action-btn"
            onClick={onClearDismissed}
            type="button"
          >
            Clear dismissed ({dismissedCount})
          </button>
        )}
      </div>

      {/* Status filter */}
      <div className="notification-history__filter" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={`notification-history__filter-btn ${
              statusFilter === value ? 'notification-history__filter-btn--active' : ''
            }`}
            onClick={() => setStatusFilter(value)}
            aria-pressed={statusFilter === value}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div className="notification-history__filter" role="group" aria-label="Filter by type">
        {TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={`notification-history__filter-btn ${
              typeFilter === value ? 'notification-history__filter-btn--active' : ''
            }`}
            onClick={() => setTypeFilter(value)}
            aria-pressed={typeFilter === value}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="notification-panel__empty">
          <p>No notifications match your filters</p>
        </div>
      ) : (
        <ul
          className="notification-history__list"
          role="list"
          aria-label="Notification history entries"
        >
          {filtered.map((notification) => (
            <li
              key={notification.id}
              role="listitem"
              className={`notification-item ${
                notification.status === 'unread' ? 'notification-item--unread' : ''
              }`}
              tabIndex={0}
              aria-label={`${notification.title}: ${notification.message}`}
              onClick={() => {
                if (notification.status === 'unread') {
                  onMarkAsRead(notification.id);
                }
                if (onAction) {
                  onAction(notification);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (notification.status === 'unread') {
                    onMarkAsRead(notification.id);
                  }
                  if (onAction) {
                    onAction(notification);
                  }
                }
              }}
            >
              <span
                className={`notification-item__indicator notification-item__indicator--${
                  notification.status === 'read' ? 'read' : notification.severity
                }`}
                aria-hidden="true"
              />
              <div className="notification-item__content">
                <p className="notification-item__title">{notification.title}</p>
                <p className="notification-item__message">{notification.message}</p>
                <span className="notification-item__time">
                  {formatTimestamp(notification.createdAt)}
                </span>
              </div>
              <div className="notification-item__action">
                {notification.actionLabel && (
                  <button
                    className="notification-item__action-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAction) {
                        onAction(notification);
                      }
                    }}
                    type="button"
                  >
                    {notification.actionLabel}
                  </button>
                )}
                {notification.status !== 'dismissed' && (
                  <button
                    className="notification-item__dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(notification.id);
                    }}
                    aria-label={`Dismiss: ${notification.title}`}
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
