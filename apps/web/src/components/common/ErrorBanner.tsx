// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { announce } from '../../accessibility/aria';
import {
  getErrorBannerDismissLabel,
  getErrorBannerRetryLabel,
  getErrorBannerRetryingLabel,
} from '../../lib/i18n/forms-catalog';

import './ErrorBanner.css';

/** Props for the {@link ErrorBanner} component. */
export interface ErrorBannerProps {
  /** Human-readable error message to display. */
  message: string;
  /**
   * Optional callback for retrying the failed operation. May return a promise;
   * while it is pending the retry control shows a busy state and is disabled to
   * prevent duplicate submissions.
   */
  onRetry?: () => void | Promise<unknown>;
  /** Optional callback for dismissing the banner. */
  onDismiss?: () => void;
  /** Additional CSS class names to apply to the root element. */
  className?: string;
}

/**
 * Accessible error banner that announces errors via `role="alert"`.
 *
 * The Retry control exposes a busy/pending state: while `onRetry` is in flight
 * the button is disabled, sets `aria-busy="true"`, swaps its label to a
 * progress indicator ("Retrying…"), and the change is announced politely to
 * screen readers. This prevents double-submits during slow retries
 * (WCAG SC 4.1.3 Status Messages).
 *
 * Uses semantic design tokens so colours adapt automatically to light,
 * dark, OLED-dark, and high-contrast modes.
 */
export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  onRetry,
  onDismiss,
  className = '',
}) => {
  const [retrying, setRetrying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const retryLabel = getErrorBannerRetryLabel();
  const retryingLabel = getErrorBannerRetryingLabel();

  const handleRetry = useCallback(async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    announce(retryingLabel, 'polite');
    try {
      await onRetry();
    } catch {
      // Retry failures are surfaced by the caller (e.g. a fresh error banner);
      // the control simply returns to its idle state so the user can try again.
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [onRetry, retrying, retryingLabel]);

  return (
    <div className={`error-banner ${className}`.trim()} role="alert">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="error-banner__icon"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="error-banner__message">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="error-banner__retry"
          onClick={handleRetry}
          disabled={retrying}
          aria-busy={retrying}
        >
          {retrying ? retryingLabel : retryLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="error-banner__dismiss"
          onClick={onDismiss}
          aria-label={getErrorBannerDismissLabel()}
        >
          &times;
        </button>
      )}
    </div>
  );
};

export default ErrorBanner;
