// SPDX-License-Identifier: BUSL-1.1

/**
 * Notification center component — bell icon with dropdown panel.
 *
 * Renders a bell button in the app header that shows unread count
 * and opens a dropdown with notification list. Supports keyboard
 * navigation, ARIA live regions, and screen reader announcements.
 *
 * @module components/notifications/NotificationCenter
 * References: #1646, #1655
 */

import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppNotification } from '../../lib/notifications';
import './notifications.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the NotificationCenter component. */
export interface NotificationCenterProps {
  /** All notifications, newest first. */
  notifications: readonly AppNotification[];
  /** Number of unread notifications. */
  unreadCount: number;
  /** Callback when a notification is marked as read. */
  onMarkAsRead: (id: string) => void;
  /** Callback to mark all notifications as read. */
  onMarkAllAsRead: () => void;
  /** Callback when a notification is dismissed. */
  onDismiss: (id: string) => void;
  /** Callback when a notification action is clicked (e.g. "View budget"). */
  onAction?: (notification: AppNotification) => void;
  /** Callback to open the full notifications page (e.g. navigate to `/notifications`). */
  onViewAll?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a relative time string from an ISO timestamp. */
function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(isoTimestamp).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Notification bell with dropdown panel.
 *
 * Accessible via keyboard (Enter/Space to toggle, Escape to close).
 * The panel uses `role="region"` with `aria-label` for screen readers,
 * and the badge announces unread count via `aria-label` on the button.
 */
export const NotificationCenter: FC<NotificationCenterProps> = ({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onAction,
  onViewAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const openPanel = useCallback(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : buttonRef.current;
    setIsOpen(true);
  }, []);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (!isOpen) return;

    const frame = requestAnimationFrame(() => {
      const focusTarget = firstItemRef.current ?? headingRef.current ?? panelRef.current;
      focusTarget?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closePanel, isOpen]);

  const togglePanel = useCallback(() => {
    if (isOpen) {
      closePanel();
      return;
    }

    openPanel();
  }, [closePanel, isOpen, openPanel]);

  const handleItemClick = useCallback(
    (notification: AppNotification) => {
      if (notification.status === 'unread') {
        onMarkAsRead(notification.id);
      }
      if (onAction) {
        onAction(notification);
      }
    },
    [onMarkAsRead, onAction],
  );

  const handleViewAll = useCallback(() => {
    closePanel();
    onViewAll?.();
  }, [closePanel, onViewAll]);

  const visibleNotifications = notifications.filter((n) => n.status !== 'dismissed');

  const bellLabel = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className="icon-button notification-bell"
        onClick={togglePanel}
        aria-label={bellLabel}
        aria-expanded={isOpen}
        aria-haspopup="true"
        type="button"
      >
        {/* Bell SVG icon */}
        <svg
          className="notification-bell__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="notification-bell__badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className="notification-panel"
          role="region"
          aria-label="Notifications"
          aria-live="polite"
          tabIndex={-1}
        >
          <div className="notification-panel__header">
            <h2 ref={headingRef} className="notification-panel__title" tabIndex={-1}>
              Notifications
            </h2>
            <div className="notification-panel__actions">
              {unreadCount > 0 && (
                <button
                  className="notification-panel__action-btn"
                  onClick={onMarkAllAsRead}
                  type="button"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {visibleNotifications.length === 0 ? (
            <div className="notification-panel__empty">
              <span className="notification-panel__empty-icon" aria-hidden="true">
                🔔
              </span>
              <p>No notifications yet</p>
            </div>
          ) : (
            <ul className="notification-panel__list" role="list" aria-label="Notification list">
              {visibleNotifications.map((notification, index) => (
                <li
                  key={notification.id}
                  role="listitem"
                  className={`notification-item ${
                    notification.status === 'unread' ? 'notification-item--unread' : ''
                  }`}
                >
                  <button
                    ref={index === 0 ? firstItemRef : undefined}
                    type="button"
                    className="notification-item__main"
                    onClick={() => handleItemClick(notification)}
                    aria-label={`${notification.title}: ${notification.message}`}
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
                      <span className="notification-item__time">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                  <div className="notification-item__action">
                    <button
                      className="notification-item__dismiss"
                      onClick={() => onDismiss(notification.id)}
                      aria-label={`Dismiss notification: ${notification.title}`}
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {onViewAll ? (
            <div className="notification-panel__footer">
              <button
                type="button"
                className="notification-panel__view-all"
                onClick={handleViewAll}
              >
                See all notifications
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Live region for screen reader announcements of new notifications */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : ''}
      </div>
    </div>
  );
};
