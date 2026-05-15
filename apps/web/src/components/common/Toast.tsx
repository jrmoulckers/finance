// SPDX-License-Identifier: BUSL-1.1

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './toast.css';

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
 * Renders a fixed toast container with `aria-live` announcements.
 * Toasts auto-dismiss after the configured duration (default 5 s).
 * Error toasts use `role="alert"` for immediate screen-reader announcement;
 * other types use `role="status"`.
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
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
      const toast: Toast = {
        id,
        type: options.type ?? 'info',
        message: options.message,
        duration,
      };

      setToasts((prev) => [...prev, toast]);

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
      <div className="toast-container" aria-label="Notifications">
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

/** Icon SVGs for each toast type. */
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
 * Uses `role="alert"` for errors (immediate announcement) and
 * `role="status"` for other types (polite announcement).
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const role = toast.type === 'error' ? 'alert' : 'status';

  return (
    <div className={`toast toast--${toast.type}`} role={role}>
      <span className="toast__icon">{TOAST_ICONS[toast.type]}</span>
      <p className="toast__message">{toast.message}</p>
      <button
        type="button"
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
};

export default ToastProvider;
