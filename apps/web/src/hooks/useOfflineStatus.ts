// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for detecting online / offline network status.
 *
 * Listens for the browser `online` and `offline` events and exposes a
 * boolean `isOffline` flag.  Components that consume this hook will
 * re-render automatically when connectivity changes.
 *
 * Also triggers a Background Sync registration via the service worker
 * whenever the device comes back online, so queued mutations can be
 * replayed.
 *
 * Usage:
 * ```tsx
 * const { isOffline } = useOfflineStatus();
 * ```
 *
 * References: issues #57, #58
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// External-store subscription for navigator.onLine
// ---------------------------------------------------------------------------

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** SSR-safe fallback ΓÇö assume online. */
function getServerSnapshot(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface OfflineStatus {
  /** `true` when the browser reports no network connectivity. */
  isOffline: boolean;
  /** `true` when the browser reports network connectivity. */
  isOnline: boolean;
}

export function useOfflineStatus(): OfflineStatus {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * When we transition back to online, tell the service worker to
   * kick off a Background Sync replay of queued mutations.
   */
  const requestSync = useCallback(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'REGISTER_SYNC' });
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      requestSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [requestSync]);

  return {
    isOffline: !online,
    isOnline: online,
  };
}
