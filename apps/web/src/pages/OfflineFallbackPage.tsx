// SPDX-License-Identifier: BUSL-1.1

/**
 * Offline fallback page component.
 *
 * Displayed when the app cannot load a requested page while offline.
 * Shows current sync queue status and provides a retry mechanism.
 *
 * Accessibility:
 *   - Semantic landmark structure (main, heading hierarchy)
 *   - Status announcements via aria-live
 *   - Keyboard-accessible retry button
 *   - Respects reduced motion preference
 *
 * References: issue #915
 */

import React, { useCallback, useEffect, useState } from 'react';

import '../styles/offline-fallback.css';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface OfflineFallbackPageProps {
  /** Optional: number of pending mutations to display. */
  pendingCount?: number;
}

export const OfflineFallbackPage: React.FC<OfflineFallbackPageProps> = ({ pendingCount = 0 }) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    // Reload with a small delay to show the loading state
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }, []);

  return (
    <main className="offline-fallback" aria-label="Offline">
      <div className="offline-fallback__content">
        <div className="offline-fallback__icon" aria-hidden="true">
          <svg
            viewBox="0 0 120 120"
            width="120"
            height="120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="60"
              cy="60"
              r="50"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="8 4"
            />
            <path
              d="M60 35v30M60 75v5"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1 className="offline-fallback__title">You&apos;re Offline</h1>

        <p className="offline-fallback__description">
          This page isn&apos;t available offline yet. Your data is safe — any changes you&apos;ve
          made are saved locally and will sync when you reconnect.
        </p>

        {pendingCount > 0 && (
          <div className="offline-fallback__status" role="status" aria-live="polite">
            <span className="offline-fallback__badge">{pendingCount}</span>
            <span>pending change{pendingCount !== 1 ? 's' : ''} saved locally</span>
          </div>
        )}

        <div className="offline-fallback__actions">
          <button
            type="button"
            className="offline-fallback__retry"
            onClick={handleRetry}
            disabled={isRetrying}
            aria-label={isRetrying ? 'Retrying connection' : 'Retry loading page'}
          >
            {isRetrying ? 'Retrying…' : 'Try Again'}
          </button>

          {isOnline && (
            <p className="offline-fallback__online-notice" role="status" aria-live="assertive">
              Connection restored! Click &quot;Try Again&quot; to reload.
            </p>
          )}
        </div>
      </div>
    </main>
  );
};

export default OfflineFallbackPage;
