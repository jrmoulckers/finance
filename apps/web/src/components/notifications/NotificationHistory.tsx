// SPDX-License-Identifier: BUSL-1.1

/**
 * Notification history/log viewer component.
 *
 * Displays a full-page list of all notifications with filtering by type and
 * status, date grouping (Today / Yesterday / Earlier this week / Older), a
 * live-announced result count, and per-notification snooze. Provides a
 * persistent activity history per acceptance criteria (#1659) and the
 * reminders UX critique (#3792).
 *
 * @module components/notifications/NotificationHistory
 * References: #1655, #1659, #3792
 */

import type { FC } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { AlertType, AppNotification, NotificationStatus } from '../../lib/notifications';
import { SNOOZE_OPTIONS, formatSnoozeUntil, snoozeUntil } from '../../lib/notifications';
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
  /** Callback to snooze a notification until the given ISO-8601 timestamp. */
  onSnooze?: (id: string, until: string) => void;
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
  { value: 'snoozed', label: 'Snoozed' },
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
// Date grouping
// ---------------------------------------------------------------------------

/** A named bucket of notifications sharing a recency band. */
interface DateGroup {
  readonly key: 'today' | 'yesterday' | 'this-week' | 'older';
  readonly label: string;
  readonly items: AppNotification[];
}

/** Number of whole calendar days between two dates (a - b), ignoring time. */
function calendarDaysBetween(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startA - startB) / 86_400_000);
}

/** Assign a notification to a recency bucket relative to `now`. */
function bucketFor(isoTimestamp: string, now: Date): DateGroup['key'] {
  const created = new Date(isoTimestamp);
  if (Number.isNaN(created.getTime())) return 'older';
  const diff = calendarDaysBetween(now, created);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'this-week';
  return 'older';
}

const GROUP_LABELS: Record<DateGroup['key'], string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'Earlier this week',
  older: 'Older',
};

/** Group notifications (already newest-first) into recency buckets. */
function groupByDate(notifications: readonly AppNotification[], now: Date): DateGroup[] {
  const groups: DateGroup[] = (['today', 'yesterday', 'this-week', 'older'] as const).map(
    (key) => ({ key, label: GROUP_LABELS[key], items: [] as AppNotification[] }),
  );
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const n of notifications) {
    byKey.get(bucketFor(n.createdAt, now))?.items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a compact date/time for display in the history log. */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format the full, unambiguous date/time used as a tooltip and screen-reader hint. */
function formatFullTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const SEVERITY_LABELS: Record<AppNotification['severity'], string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  critical: 'Critical',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full notification history viewer.
 *
 * Accessible with ARIA labels on filter buttons, a `role="list"` structure,
 * a live-announced result count, and a real `<button>` for each item's primary
 * action so keyboard and screen-reader users get native semantics.
 */
export const NotificationHistory: FC<NotificationHistoryProps> = ({
  notifications,
  onMarkAsRead,
  onDismiss,
  onClearDismissed,
  onAction,
  onSnooze,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null);
  const itemButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: notifications.length,
      unread: 0,
      read: 0,
      snoozed: 0,
      dismissed: 0,
    };
    for (const n of notifications) {
      counts[n.status] += 1;
    }
    return counts;
  }, [notifications]);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      return true;
    });
  }, [notifications, statusFilter, typeFilter]);

  const groups = useMemo(() => groupByDate(filtered, new Date()), [filtered]);

  const dismissedCount = statusCounts.dismissed;
  const hasActiveFilter = statusFilter !== 'all' || typeFilter !== 'all';

  const focusItem = useCallback((id: string) => {
    requestAnimationFrame(() => {
      itemButtonRefs.current.get(id)?.focus();
    });
  }, []);

  const handleActivate = useCallback(
    (notification: AppNotification) => {
      if (notification.status === 'unread') {
        onMarkAsRead(notification.id);
      }
      onAction?.(notification);
    },
    [onMarkAsRead, onAction],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      onDismiss(id);
      setOpenSnoozeId((current) => (current === id ? null : current));
      // Keep the user's place: focus stays on the item's primary button, which
      // remains in the list (dismissed entries are still shown under "All").
      focusItem(id);
    },
    [onDismiss, focusItem],
  );

  const handleSnooze = useCallback(
    (id: string, optionId: (typeof SNOOZE_OPTIONS)[number]['id']) => {
      onSnooze?.(id, snoozeUntil(optionId));
      setOpenSnoozeId(null);
      focusItem(id);
    },
    [onSnooze, focusItem],
  );

  const resultSummary = `${filtered.length} ${
    filtered.length === 1 ? 'notification' : 'notifications'
  }${hasActiveFilter ? ' match your filters' : ''}`;

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
        {STATUS_FILTERS.map(({ value, label }) => {
          const count = statusCounts[value];
          return (
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
              <span className="notification-history__filter-count" aria-hidden="true">
                {count}
              </span>
              <span className="sr-only">{`, ${count} ${
                count === 1 ? 'notification' : 'notifications'
              }`}</span>
            </button>
          );
        })}
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

      {/* Live-announced result count (WCAG 4.1.3) */}
      <p className="notification-history__result-count" role="status" aria-live="polite">
        {resultSummary}
      </p>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="notification-panel__empty">
          <p>
            {hasActiveFilter
              ? 'No notifications match your filters.'
              : 'No notifications yet — alerts and reminders will appear here.'}
          </p>
          {hasActiveFilter && (
            <button
              className="notification-panel__action-btn"
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="notification-history__group" aria-label={group.label}>
            <h3 className="notification-history__group-title">{group.label}</h3>
            <ul className="notification-history__list" role="list">
              {group.items.map((notification) => {
                const isSnoozed = notification.status === 'snoozed';
                const canSnooze = onSnooze && !isSnoozed && notification.status !== 'dismissed';
                const severityLabel = SEVERITY_LABELS[notification.severity];
                return (
                  <li
                    key={notification.id}
                    className={`notification-item ${
                      notification.status === 'unread' ? 'notification-item--unread' : ''
                    }`}
                  >
                    <button
                      ref={(el) => {
                        if (el) itemButtonRefs.current.set(notification.id, el);
                        else itemButtonRefs.current.delete(notification.id);
                      }}
                      type="button"
                      className="notification-item__main"
                      onClick={() => handleActivate(notification)}
                      aria-label={`${severityLabel}: ${notification.title}. ${notification.message}`}
                    >
                      <span
                        className={`notification-item__indicator notification-item__indicator--${
                          notification.status === 'read' ? 'read' : notification.severity
                        }`}
                        aria-hidden="true"
                      />
                      <span className="notification-item__content">
                        <span className="notification-item__title">{notification.title}</span>
                        <span className="notification-item__message">{notification.message}</span>
                        {notification.actionHint ? (
                          <span className="notification-item__hint">{notification.actionHint}</span>
                        ) : null}
                        {isSnoozed && notification.snoozedUntil ? (
                          <span className="notification-item__snooze-label">
                            {formatSnoozeUntil(notification.snoozedUntil)}
                          </span>
                        ) : null}
                        <time
                          className="notification-item__time"
                          dateTime={notification.createdAt}
                          title={formatFullTimestamp(notification.createdAt)}
                        >
                          {formatTimestamp(notification.createdAt)}
                        </time>
                      </span>
                    </button>
                    <div className="notification-item__action">
                      {notification.actionLabel && (
                        <button
                          className="notification-item__action-link"
                          onClick={() => onAction?.(notification)}
                          type="button"
                        >
                          {notification.actionLabel}
                        </button>
                      )}
                      {canSnooze && (
                        <div className="notification-item__snooze">
                          <button
                            className="notification-item__snooze-toggle"
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={openSnoozeId === notification.id}
                            onClick={() =>
                              setOpenSnoozeId((current) =>
                                current === notification.id ? null : notification.id,
                              )
                            }
                          >
                            Snooze
                          </button>
                          {openSnoozeId === notification.id && (
                            <ul
                              className="notification-item__snooze-menu"
                              role="menu"
                              aria-label={`Snooze: ${notification.title}`}
                            >
                              {SNOOZE_OPTIONS.map((option) => (
                                <li key={option.id} role="none">
                                  <button
                                    role="menuitem"
                                    type="button"
                                    className="notification-item__snooze-option"
                                    onClick={() => handleSnooze(notification.id, option.id)}
                                  >
                                    {option.label}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {notification.status !== 'dismissed' && (
                        <button
                          className="notification-item__dismiss"
                          onClick={() => handleDismiss(notification.id)}
                          aria-label={`Dismiss: ${notification.title}`}
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  );
};
