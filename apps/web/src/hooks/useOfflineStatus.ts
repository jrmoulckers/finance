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
import {
  describeNetworkState,
  shouldDeferHeavyNetworkWork,
  type NetworkEffectiveType,
} from '../lib/networkDegradation';

// ---------------------------------------------------------------------------
// External-store subscription for navigator.onLine and network failures
// ---------------------------------------------------------------------------

const networkFailureListeners = new Set<() => void>();
let networkFailureVersion = 0;
let hasReportedNetworkFailure = false;
let hasReportedSlowNetwork = false;
let lastNetworkFailureAt: number | null = null;
let lastSlowNetworkAt: number | null = null;

function emitNetworkFailureChange(): void {
  networkFailureVersion += 1;
  for (const listener of networkFailureListeners) {
    listener();
  }
}

export function reportOfflineNetworkFailure(): void {
  lastNetworkFailureAt = Date.now();
  if (hasReportedNetworkFailure) {
    emitNetworkFailureChange();
    return;
  }

  hasReportedNetworkFailure = true;
  emitNetworkFailureChange();
}

export function clearOfflineNetworkFailure(): void {
  if (!hasReportedNetworkFailure && lastNetworkFailureAt === null) {
    return;
  }

  hasReportedNetworkFailure = false;
  lastNetworkFailureAt = null;
  emitNetworkFailureChange();
}

export function reportSlowNetworkDegradation(): void {
  lastSlowNetworkAt = Date.now();
  if (hasReportedSlowNetwork) {
    emitNetworkFailureChange();
    return;
  }

  hasReportedSlowNetwork = true;
  emitNetworkFailureChange();
}

export function clearSlowNetworkDegradation(): void {
  if (!hasReportedSlowNetwork && lastSlowNetworkAt === null) {
    return;
  }

  hasReportedSlowNetwork = false;
  lastSlowNetworkAt = null;
  emitNetworkFailureChange();
}

function getNavigatorConnection():
  (EventTarget & { effectiveType?: NetworkEffectiveType; saveData?: boolean }) | null {
  const nav = navigator as Navigator & {
    connection?: EventTarget & { effectiveType?: NetworkEffectiveType; saveData?: boolean };
    mozConnection?: EventTarget & { effectiveType?: NetworkEffectiveType; saveData?: boolean };
    webkitConnection?: EventTarget & { effectiveType?: NetworkEffectiveType; saveData?: boolean };
  };

  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function subscribe(callback: () => void): () => void {
  const connection = getNavigatorConnection();
  const handleOnline = () => {
    if (hasReportedNetworkFailure) {
      clearOfflineNetworkFailure();
    } else {
      callback();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', callback);
  connection?.addEventListener('change', callback);
  networkFailureListeners.add(callback);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', callback);
    connection?.removeEventListener('change', callback);
    networkFailureListeners.delete(callback);
  };
}

function getSnapshot(): string {
  const connection = getNavigatorConnection();
  return `${navigator.onLine ? 'online' : 'offline'}:${connection?.effectiveType ?? 'unknown'}:${
    connection?.saveData === true ? 'save-data' : 'normal-data'
  }:${networkFailureVersion}`;
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
  /** `true` when a request timed out before the browser reported offline. */
  hasSlowNetwork: boolean;
  /** `true` when either slow network or offline fallback UX should be visible. */
  isDegraded: boolean;
  /** Current Network Information API effective type when available. */
  effectiveType?: NetworkEffectiveType;
  /** `true` when browser data saver is enabled. */
  saveData?: boolean;
  /** Defer receipts, charts, and speculative prefetch on constrained networks. */
  shouldDeferHeavyAssets: boolean;
  /** Human-readable degraded-state copy for banners. */
  degradedMessage: string;
  /** Last network-failure report timestamp. */
  lastNetworkFailureAt: number | null;
  /** Last slow-network report timestamp. */
  lastSlowNetworkAt: number | null;
  /** Mark the app as degraded because an optional remote request failed. */
  reportNetworkFailure: () => void;
  /** Clear a previously reported remote network failure. */
  clearNetworkFailure: () => void;
  /** Mark the app as slow before hard offline fallback. */
  reportSlowNetwork: () => void;
  /** Clear a previously reported slow-network state. */
  clearSlowNetwork: () => void;
}

export function useOfflineStatus(): OfflineStatus {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const browserOnline = navigator.onLine;
  const connection = getNavigatorConnection();
  const effectiveType = connection?.effectiveType;
  const saveData = connection?.saveData;
  const hasConstrainedConnection = shouldDeferHeavyNetworkWork(connection);
  const isOffline = !browserOnline || hasReportedNetworkFailure;
  const isDegraded = isOffline || hasReportedSlowNetwork || hasConstrainedConnection;

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

  const reportSlowNetwork = useCallback(() => {
    reportSlowNetworkDegradation();
  }, []);

  const clearSlowNetwork = useCallback(() => {
    clearSlowNetworkDegradation();
  }, []);

  const degradedState = describeNetworkState({
    isOffline,
    hasNetworkFailure: hasReportedNetworkFailure,
    hasSlowNetwork: hasReportedSlowNetwork,
    effectiveType,
    saveData,
    lastAttemptAt: lastNetworkFailureAt ?? lastSlowNetworkAt,
  });

  return {
    isOffline,
    isOnline: !isOffline,
    hasNetworkFailure: hasReportedNetworkFailure,
    hasSlowNetwork: hasReportedSlowNetwork || hasConstrainedConnection,
    isDegraded,
    effectiveType,
    saveData,
    shouldDeferHeavyAssets: hasConstrainedConnection,
    degradedMessage: degradedState.message,
    lastNetworkFailureAt,
    lastSlowNetworkAt,
    reportNetworkFailure,
    clearNetworkFailure,
    reportSlowNetwork,
    clearSlowNetwork,
  };
}
