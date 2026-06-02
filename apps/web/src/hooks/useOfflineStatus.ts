// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for detecting online / offline network status.
 *
 * Listens for the browser `online` and `offline` events and exposes a
 * boolean `isOffline` flag. Components that consume this hook will
 * re-render automatically when connectivity changes.
 *
 * Remote loaders can also report a network failure so pages that still have
 * local SQLite-WASM data can render that data and show an offline banner.
 *
 * Also triggers a Background Sync registration via the service worker
 * whenever the device comes back online, so queued mutations can be
 * replayed.
 *
 * Usage:
 * ```tsx
 * const { isOffline, reportNetworkFailure } = useOfflineStatus();
 * ```
 *
 * References: issues #57, #58, #1928
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// External-store subscription for navigator.onLine and network failures
// ---------------------------------------------------------------------------

const networkFailureListeners = new Set<() => void>();
let networkFailureVersion = 0;
let hasReportedNetworkFailure = false;

function emitNetworkFailureChange(): void {
  networkFailureVersion += 1;
  for (const listener of networkFailureListeners) {
    listener();
  }
}

export function reportOfflineNetworkFailure(): void {
  if (hasReportedNetworkFailure) {
    return;
  }

  hasReportedNetworkFailure = true;
  emitNetworkFailureChange();
}

export function clearOfflineNetworkFailure(): void {
  if (!hasReportedNetworkFailure) {
    return;
  }

  hasReportedNetworkFailure = false;
  emitNetworkFailureChange();
}

function subscribe(callback: () => void): () => void {
  const handleOnline = () => {
    if (hasReportedNetworkFailure) {
      clearOfflineNetworkFailure();
    } else {
      callback();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', callback);
  networkFailureListeners.add(callback);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', callback);
    networkFailureListeners.delete(callback);
  };
}

function getSnapshot(): string {
  return `${navigator.onLine ? 'online' : 'offline'}:${networkFailureVersion}`;
}

/** SSR-safe fallback — assume online. */
function getServerSnapshot(): string {
  return 'online:0';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface OfflineStatus {
  /** `true` when the browser or a remote loader reports no network connectivity. */
  isOffline: boolean;
  /** `true` when the browser reports network connectivity and no loader has degraded. */
  isOnline: boolean;
  /** `true` when a remote loader has degraded after a network failure. */
  hasNetworkFailure: boolean;
  /** Mark the app as degraded because an optional remote request failed. */
  reportNetworkFailure: () => void;
  /** Clear a previously reported remote network failure. */
  clearNetworkFailure: () => void;
}

export function useOfflineStatus(): OfflineStatus {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const browserOnline = navigator.onLine;
  const isOffline = !browserOnline || hasReportedNetworkFailure;

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

  const reportNetworkFailure = useCallback(() => {
    reportOfflineNetworkFailure();
  }, []);

  const clearNetworkFailure = useCallback(() => {
    clearOfflineNetworkFailure();
  }, []);

  return {
    isOffline,
    isOnline: !isOffline,
    hasNetworkFailure: hasReportedNetworkFailure,
    reportNetworkFailure,
    clearNetworkFailure,
  };
}
