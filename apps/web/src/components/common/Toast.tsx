// SPDX-License-Identifier: BUSL-1.1

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './toast.css';
import { announce, ensureLiveRegions } from '../../accessibility/aria';
import { prefersReducedMotion } from '../../lib/accessibility-preferences';
import {
  getToastAriaLabel,
  getToastDismissLabel,
  getToastTypeLabel,
} from '../../lib/i18n/forms-catalog';

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */

/** Toast severity levels. */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** An inline action button rendered inside a toast (e.g. Undo / Retry / View). */
export interface ToastAction {
  /** Visible, accessible label for the action button. */
  label: string;
  /** Invoked when the action button is activated. The toast is then dismissed. */
  onClick: () => void;
}

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
  /** Optional inline action button. */
  action?: ToastAction;
}

/** Options when creating a toast via `useToast`. */
export interface ToastOptions {
  /** Severity type. @default 'info' */
  type?: ToastType;
  /** Message to display. */
  message: string;
  /** Auto-dismiss duration in ms. @default 5000 */
  duration?: number;
  /** Optional inline action button (e.g. Undo / Retry / View). */
  action?: ToastAction;
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
 * showToast({ type: 'info', message: 'Transaction deleted', action: { label: 'Undo', onClick: undo } });
 * ```
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

/**
 * Access toast actions on surfaces where notifications are a soft enhancement.
 *
 * Returns `null` outside a {@link ToastProvider}; callers should use
 * {@link useToast} when a provider is required.
 */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}

/* --------------------------------------------------------------------------
 * Provider
 * -------------------------------------------------------------------------- */

export interface ToastProviderProps {
  children: React.ReactNode;
  /**
   * Maximum number of simultaneously visible toasts. Older toasts are retired
   * (and their timers cleared) once this cap is exceeded. @default 3
   */
  maxToasts?: number;
  /**
   * Coalesce identical `type`+`message` toasts fired within a short window into
   * a single notification, preventing error storms from stacking. @default true
   */
  dedupe?: boolean;
}

/** Default cap on simultaneously visible toasts. */
const DEFAULT_MAX_TOASTS = 3;

/** Window (ms) during which identical toasts are coalesced. */
const DEDUPE_WINDOW_MS = 3000;

/** Exit-animation duration (ms). Keep in sync with `toast.css` `toastExit`. */
const EXIT_ANIMATION_MS = 200;

/** Counter for generating unique toast IDs. */
let toastIdCounter = 0;

/**
 * Provides a toast notification system to the component tree.
 *
 * Renders a fixed toast container plus a persistent, visually-hidden live
 * region (via the canonical `announce()` helper) so screen readers reliably
 * announce new toasts (WCAG SC 4.1.3). Error toasts announce assertively;
 * all other types announce politely. The visible toast list is bounded
 * (`maxToasts`) and de-duplicates identical messages to stay usable under
 * error storms.
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  maxToasts = DEFAULT_MAX_TOASTS,
  dedupe = true,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dedupeRef = useRef<Map<string, number>>(new Map());

  // Ensure the canonical announcer regions exist (empty) before any toast is
  // shown, so assistive tech announces text written into them.
  useEffect(() => {
    ensureLiveRegions();
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (options: ToastOptions) => {
      const type = options.type ?? 'info';
      const { message } = options;
      const duration = options.duration ?? 5000;

      if (dedupe) {
        const key = `${type}\u0000${message}`;
        const now = Date.now();
        // Prune stale keys so the map does not grow unbounded.
        for (const [existingKey, ts] of dedupeRef.current) {
          if (now - ts >= DEDUPE_WINDOW_MS) dedupeRef.current.delete(existingKey);
        }
        const last = dedupeRef.current.get(key);
        dedupeRef.current.set(key, now);
        if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
          return; // identical toast still within the window — coalesce.
        }
      }

      const id = `toast-${++toastIdCounter}`;
      const toast: Toast = { id, type, message, duration, action: options.action };

      setToasts((prev) => {
        const next = [...prev, toast];
        // Bound the queue: retire the oldest toasts beyond the cap. Retired
        // toasts unmount, so their per-item timers are cleared automatically.
        return next.length > maxToasts ? next.slice(next.length - maxToasts) : next;
      });

      // Route the announcement through the single canonical announcer.
      announce(getToastAriaLabel(type, message), type === 'error' ? 'assertive' : 'polite');
    },
    [dedupe, maxToasts],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
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
 * The visible toast node is intentionally NOT a live region: putting a
 * `role="status"`/`role="alert"` plus an `aria-label` on a pre-filled node can
 * suppress or duplicate the announcement (WCAG SC 4.1.2). Announcements are
 * instead routed through the canonical live region by `ToastProvider`. This
 * item handles auto-dismiss timing (paused on hover/focus per WCAG SC 2.2.1),
 * a reduced-motion-safe exit animation, and an optional inline action button.
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const typeLabel = getToastTypeLabel(toast.type);
  const rootRef = useRef<HTMLDivElement>(null);
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);
  const finalizedRef = useRef(false);

  /** Remove the toast from provider state (the actual unmount). */
  const finalizeDismiss = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  /** Begin dismissal: relocate focus, then play the exit animation (if any). */
  const requestDismiss = useCallback(() => {
    if (exiting || finalizedRef.current) return;

    const el = rootRef.current;
    const container = el?.parentElement ?? null;
    // When the dismissed toast holds focus, relocate focus to an adjacent
    // toast (or the toast region) so keyboard users are not dropped onto
    // <body> after the element is removed.
    if (el?.contains(document.activeElement) && container) {
      const toastEls = Array.from(container.querySelectorAll<HTMLElement>('.toast'));
      const index = toastEls.indexOf(el);
      const sibling = toastEls[index + 1] ?? toastEls[index - 1] ?? null;
      const nextTarget = sibling?.querySelector<HTMLElement>('.toast__dismiss') ?? container;
      requestAnimationFrame(() => nextTarget.focus());
    }

    if (prefersReducedMotion()) {
      finalizeDismiss();
      return;
    }
    setExiting(true);
  }, [exiting, finalizeDismiss]);

  // Auto-dismiss timer. Pauses on hover/focus and resumes with the remaining
  // time so users are never timed out mid-read. `duration <= 0` stays manual.
  useEffect(() => {
    if (toast.duration <= 0 || exiting || paused) return;
    const start = Date.now();
    const timer = setTimeout(requestDismiss, remainingRef.current);
    return () => {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [toast.duration, exiting, paused, requestDismiss]);

  // Once the exit animation is playing, finalize removal after its duration.
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(finalizeDismiss, EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [exiting, finalizeDismiss]);

  const handleAction = useCallback(() => {
    toast.action?.onClick();
    requestDismiss();
  }, [toast.action, requestDismiss]);

  const handleFocus = useCallback(() => setPaused(true), []);
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    // Only resume when focus leaves the toast entirely (not to a child control).
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setPaused(false);
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className={`toast toast--${toast.type}${exiting ? ' toast--exiting' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span className="toast__icon">{TOAST_ICONS[toast.type]}</span>
      <span className="toast__type-label">{typeLabel}</span>
      <p className="toast__message">{toast.message}</p>
      {toast.action && (
        <button type="button" className="toast__action" onClick={handleAction}>
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast__dismiss"
        onClick={requestDismiss}
        aria-label={getToastDismissLabel()}
      >
        &times;
      </button>
    </div>
  );
};

export default ToastProvider;
