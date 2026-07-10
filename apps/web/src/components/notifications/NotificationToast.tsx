// SPDX-License-Identifier: BUSL-1.1

/**
 * Toast notification component for transient alerts.
 *
 * Displays brief, auto-dismissing notifications at the bottom-right
 * of the screen. Supports multiple stacked toasts, severity-based
 * styling, and accessible announcements.
 *
 * @module components/notifications/NotificationToast
 * References: #1659
 */

import type { FC } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { AppNotification } from '../../lib/notifications';
import './notifications.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the NotificationToast component. */
export interface NotificationToastProps {
  /** The notification to display. */
  notification: AppNotification;
  /** Called when the toast should be dismissed. */
  onDismiss: (id: string) => void;
  /** Auto-dismiss duration in ms. Defaults to 5000. */
  autoDismissMs?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single toast notification.
 *
 * Auto-dismisses after the configured duration. Uses `role="status"`
 * for screen reader announcements of non-critical toasts, and
 * `role="alert"` for critical ones.
 */
export const NotificationToast: FC<NotificationToastProps> = ({
  notification,
  onDismiss,
  autoDismissMs = 5000,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef<number>(autoDismissMs);
  const startedAtRef = useRef<number>(0);

  const isCritical = notification.severity === 'critical';

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    // Critical alerts (fraud, overdraft) must be dismissed manually so they are
    // never lost to a timeout (WCAG 2.2.1 Timing Adjustable).
    if (isCritical) return;
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(notification.id);
    }, remainingRef.current);
  }, [clearTimer, isCritical, notification.id, onDismiss]);

  // Pause the countdown, preserving the time remaining so hover/focus can be
  // released without losing already-elapsed time.
  const pauseTimer = useCallback(() => {
    if (isCritical || timerRef.current === null) return;
    clearTimer();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
  }, [clearTimer, isCritical]);

  useEffect(() => {
    remainingRef.current = autoDismissMs;
    startTimer();
    return clearTimer;
  }, [autoDismissMs, clearTimer, startTimer]);

  const handleDismiss = useCallback(() => {
    clearTimer();
    onDismiss(notification.id);
  }, [clearTimer, notification.id, onDismiss]);

  const role = isCritical ? 'alert' : 'status';

  return (
    <div
      className={`notification-toast notification-toast--${notification.severity}`}
      role={role}
      aria-live={isCritical ? 'assertive' : 'polite'}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocus={pauseTimer}
      onBlur={startTimer}
    >
      <div className="notification-toast__content">
        <p className="notification-toast__title">{notification.title}</p>
        <p className="notification-toast__message">{notification.message}</p>
      </div>
      <button
        className="notification-toast__close"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        type="button"
      >
        ✕
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Toast container
// ---------------------------------------------------------------------------

/** Props for the toast container. */
export interface NotificationToastContainerProps {
  /** Toasts currently visible. */
  toasts: readonly AppNotification[];
  /** Called when a toast is dismissed. */
  onDismiss: (id: string) => void;
}

/**
 * Container component that stacks multiple toast notifications.
 *
 * Renders at the bottom-right of the viewport (fixed position).
 * On mobile, spans the full width minus padding.
 */
export const NotificationToastContainer: FC<NotificationToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div className="notification-toast-container" aria-label="Notifications">
      {toasts.map((toast) => (
        <NotificationToast key={toast.id} notification={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
