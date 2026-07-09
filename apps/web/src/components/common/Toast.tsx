// SPDX-License-Identifier: BUSL-1.1

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './toast.css';
import {
  getToastAriaLabel,
  getToastDismissLabel,
  getToastTypeLabel,
} from '../../lib/i18n/forms-catalog';
import { VisuallyHidden } from './VisuallyHidden';

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

/** Toast severity levels. */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** A single toast notification. */
export interface Toast {
  /** Unique identifier. */
  id: string;
  /** Severity / visual type. */
  type: ToastType;
  /** Short message displayed to the user. */
  message: string;
  /** Auto-dismiss duration in ms. Pass `0` to require manual close. */
  duration: number;
}

/** Options when creating a toast via `useToast`. */
export interface ToastOptions {
  /** Severity type. @default 'info' */
  type?: ToastType;
  /** Message to display. */
  message: string;
  /** Auto-dismiss duration in ms. @default 5000 */
  duration?: number;
}

/** Value provided by `ToastContext`. */
export interface ToastContextValue {
  /** Show a new toast notification. */
  showToast: (options: ToastOptions) => void;
  /** Dismiss a toast by id. */
  dismissToast: (id: string) => void;
}

/* --------------------------------------------------------------------------
 * Context
 * -------------------------------------------------------------------------- */

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access the toast notification system.
 *
 * Must be used inside a `<ToastProvider>`.
 *
 * @example
 * ```tsx
 * const { showToast } = useToast();
 * showToast({ type: 'success', message: 'Account created!' });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

/* --------------------------------------------------------------------------
 * Provider
 * -------------------------------------------------------------------------- */

export interface ToastProviderProps {
  children: React.ReactNode;
}

/** Counter for generating unique toast IDs. */
let toastIdCounter = 0;

/**
 * Provides a toast notification system to the component tree.
 *
 * Renders a fixed toast container plus two persistent, visually-hidden live
 * regions (one polite, one assertive). Announcements are written into those
 * pre-existing regions so screen readers reliably narrate them — a live region
 * must exist in the DOM *before* its text changes (WCAG 4.1.3 Status Messages).
 * The visible toasts themselves are not live regions, so the message is
 * announced exactly once, from its localized announcement text.
 * Toasts auto-dismiss after the configured duration (default 5 s).
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [politeAnnouncement, setPoliteAnnouncement] = useState('');
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState('');
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Clean up all auto-dismiss timers on unmount. */
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = `toast-${++toastIdCounter}`;
      const duration = options.duration ?? 5000;
      const type = options.type ?? 'info';
      const toast: Toast = {
        id,
        type,
        message: options.message,
        duration,
      };

      setToasts((prev) => [...prev, toast]);

      // Route the announcement through the appropriate persistent live region.
      // Errors are assertive (interrupt); everything else is polite.
      const announcement = getToastAriaLabel(type, options.message);
      if (type === 'error') {
        setAssertiveAnnouncement(announcement);
      } else {
        setPoliteAnnouncement(announcement);
      }

      if (duration > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Persistent live regions — mounted empty so later text changes are
          announced by assistive technology (WCAG 4.1.3). */}
      <VisuallyHidden as="div" role="status" aria-live="polite" aria-atomic="true">
        {politeAnnouncement}
      </VisuallyHidden>
      <VisuallyHidden as="div" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveAnnouncement}
      </VisuallyHidden>
      <div className="toast-container" aria-label="Notifications" role="region" tabIndex={-1}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/* --------------------------------------------------------------------------
 * Toast Item
 * -------------------------------------------------------------------------- */

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 12l3 3 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  error: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <line
        x1="12"
        y1="8"
        x2="12"
        y2="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2L2 22h20L12 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <line
        x1="12"
        y1="10"
        x2="12"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
    </svg>
  ),
};

/**
 * Individual toast notification element.
 *
 * This element is presentational only — announcements are handled by the
 * dedicated live regions in {@link ToastProvider}, so the toast itself carries
 * neither a live-region role nor an `aria-label` (which would suppress or
 * duplicate the announced message). The visible type label keeps the severity
 * readable for everyone.
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const typeLabel = getToastTypeLabel(toast.type);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    const el = rootRef.current;
    const container = el?.parentElement ?? null;
    // When the dismissed toast holds focus, relocate focus to an adjacent
    // toast (or the toast region) so keyboard users are not dropped onto
    // <body> after the element is removed.
    let nextTarget: HTMLElement | null = null;
    if (el?.contains(document.activeElement) && container) {
      const toastEls = Array.from(container.querySelectorAll<HTMLElement>('.toast'));
      const index = toastEls.indexOf(el);
      const sibling = toastEls[index + 1] ?? toastEls[index - 1] ?? null;
      nextTarget = sibling?.querySelector<HTMLElement>('.toast__dismiss') ?? container;
    }

    onDismiss(toast.id);

    if (nextTarget) {
      const target = nextTarget;
      requestAnimationFrame(() => target.focus());
    }
  }, [onDismiss, toast.id]);

  return (
    <div ref={rootRef} className={`toast toast--${toast.type}`}>
      <span className="toast__icon">{TOAST_ICONS[toast.type]}</span>
      <span className="toast__type-label">{typeLabel}</span>
      <p className="toast__message">{toast.message}</p>
      <button
        type="button"
        className="toast__dismiss"
        onClick={handleDismiss}
        aria-label={getToastDismissLabel()}
      >
        &times;
      </button>
    </div>
  );
};

export default ToastProvider;
