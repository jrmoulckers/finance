// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for monitoring sync status and triggering manual sync.
 *
 * Exposes:
 * - `isOnline` / `isOffline` -- current network state.
 * - `pendingMutations` -- number of mutations waiting to be pushed.
 * - `lastSyncTime` -- ISO-8601 timestamp of the last successful sync.
 * - `isSyncing` -- whether a sync operation is currently in progress.
 * - `syncNow` -- manually trigger an immediate sync replay.
 *
 * The hook listens for messages from the service worker to keep
 * `pendingMutations`, `lastSyncTime`, and `isSyncing` up to date.
 *
 * When Background Sync is not available (e.g. Firefox), the hook
 * automatically replays mutations when the `online` event fires.
 *
 * Usage:
 * ```tsx
 * const { isOnline, pendingMutations, lastSyncTime, isSyncing, syncNow } = useSyncStatus();
 * ```
 *
 * References: issue #416
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { replayMutations, type ReplayResult } from '../db/sync/replayMutations';
import {
  LAST_SYNC_TIME_KEY,
  PERIODIC_SYNC_INTERVAL_MS,
  type SwToClientMessage,
} from '../db/sync/types';
import { getPendingMutationCount } from '../db/sync/enqueueMutation';

// ---------------------------------------------------------------------------
// navigator.onLine external store (same pattern as useOfflineStatus)
// ---------------------------------------------------------------------------

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerOnlineSnapshot(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface UseSyncStatusResult {
  /** `true` when the browser reports network connectivity. */
  isOnline: boolean;
  /** `true` when the browser reports no network connectivity. */
  isOffline: boolean;
  /** Number of mutations waiting to be pushed to the server. */
  pendingMutations: number;
  /** ISO-8601 timestamp of the last successful sync, or `null`. */
  lastSyncTime: string | null;
  /** Whether a sync operation is currently in progress. */
  isSyncing: boolean;
  /** Manually trigger an immediate sync replay. */
  syncNow: () => void;
  /** Whether the last sync failed due to an authentication error. */
  authError: boolean;
  /** Number of conflicts detected that need UI resolution. */
  conflictCount: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSyncStatus(): UseSyncStatusResult {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );

  const [pendingMutations, setPendingMutations] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_SYNC_TIME_KEY);
    } catch {
      return null;
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  // Track whether a periodic fallback timer is needed.
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Refresh pending count from IndexedDB
  // -------------------------------------------------------------------------

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingMutationCount();
      setPendingMutations(count);
    } catch {
      // IndexedDB may be unavailable (e.g. private browsing in some browsers).
    }
  }, []);

  // -------------------------------------------------------------------------
  // Listen for messages from the service worker
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as SwToClientMessage | undefined;
      if (!data?.type) return;

      switch (data.type) {
        case 'SYNC_STARTED':
          setIsSyncing(true);
          break;

        case 'SYNC_COMPLETED':
          setIsSyncing(false);
          setAuthError(false);
          setLastSyncTime(new Date().toISOString());
          if (typeof data.conflictCount === 'number') {
            setConflictCount(data.conflictCount);
          }
          void refreshPendingCount();
          break;

        case 'SYNC_FAILED':
          setIsSyncing(false);
          if (data.authError) {
            setAuthError(true);
          }
          void refreshPendingCount();
          break;

        case 'PENDING_COUNT':
          setPendingMutations(data.count);
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  }, [refreshPendingCount]);

  // -------------------------------------------------------------------------
  // Poll the pending count on mount and whenever online status changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    void refreshPendingCount();
  }, [isOnline, refreshPendingCount]);

  // -------------------------------------------------------------------------
  // Main-thread fallback: replay when coming back online
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handleOnline = () => {
      // First, try to let the service worker handle it via Background Sync.
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'REGISTER_SYNC' });
      }

      // Also replay from the main thread as a fallback -- the queue is
      // idempotent so double-processing is safe (the server should
      // de-duplicate by mutation ID).
      void performMainThreadSync();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // -------------------------------------------------------------------------
  // Periodic fallback when Background Sync is unavailable
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Check whether Background Sync is supported.
    const hasBackgroundSync = 'serviceWorker' in navigator && 'SyncManager' in self;

    if (!hasBackgroundSync && isOnline) {
      // Poll periodically to flush queued mutations.
      periodicTimerRef.current = setInterval(() => {
        void performMainThreadSync();
      }, PERIODIC_SYNC_INTERVAL_MS);
    }

    return () => {
      if (periodicTimerRef.current !== null) {
        clearInterval(periodicTimerRef.current);
        periodicTimerRef.current = null;
      }
    };
  }, [isOnline]);

  // -------------------------------------------------------------------------
  // Main-thread sync (fallback)
  // -------------------------------------------------------------------------

  const performMainThreadSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result: ReplayResult = await replayMutations();

      // Surface auth errors so the UI can prompt re-authentication.
      setAuthError(result.authError);
      setConflictCount(result.conflictCount);

      // Only update the last-sync timestamp when the sync was not an
      // auth failure (the user needs to re-login, not retry blindly).
      if (!result.authError) {
        try {
          const now = new Date().toISOString();
          localStorage.setItem(LAST_SYNC_TIME_KEY, now);
          setLastSyncTime(now);
        } catch {
          // localStorage may be unavailable.
        }
      }
    } catch {
      // Sync failed -- will retry later.
    } finally {
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  // -------------------------------------------------------------------------
  // Manual sync trigger
  // -------------------------------------------------------------------------

  const syncNow = useCallback(() => {
    if (isSyncing) return;

    // Prefer the service-worker path.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' });
      setIsSyncing(true);
      return;
    }

    // Fallback to main-thread replay.
    void performMainThreadSync();
  }, [isSyncing, performMainThreadSync]);

  return {
    isOnline,
    isOffline: !isOnline,
    pendingMutations,
    lastSyncTime,
    isSyncing,
    syncNow,
    authError,
    conflictCount,
  };
}
