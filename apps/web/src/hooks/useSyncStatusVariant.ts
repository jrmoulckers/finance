// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for the app's displayed sync status.
 *
 * Both the global {@link SyncStatusBar} and the Settings → Sync & Devices
 * status row consume this hook, so the two surfaces can never present
 * contradictory states (for example one reading "Offline. Changes saved
 * locally" while the other reads "All synced").
 *
 * The variant is derived from:
 *   - the local mutation queue and `navigator.onLine` (via `useSyncStatus`),
 *   - unresolved sync conflicts (via `getUnresolvedConflicts`),
 *   - and, when the live `@powersync/web` client is enabled, its real runtime
 *     connection state (via `useLivePowerSyncStatus`), which then overrides the
 *     local-queue view.
 *
 * References: issues #416, #627, #3960
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSyncStatus } from './useSyncStatus';
import { useLivePowerSyncStatus } from './useLivePowerSyncStatus';
import { getUnresolvedConflicts } from '../db/sync/sync-conflict';
import { isPowerSyncEnabled } from '../db/sync/powersync/database';
import type { LivePowerSyncStatus } from '../db/sync/powersync/live-status';

export type SyncStatusVariant = 'synced' | 'pending' | 'syncing' | 'error' | 'offline' | 'conflict';

export interface SyncStatusView {
  /** The single derived status variant shared by every sync surface. */
  variant: SyncStatusVariant;
  /** Number of mutations waiting to be pushed to the server. */
  pendingMutations: number;
  /** Number of unresolved conflicts that need attention. */
  conflictCount: number;
  /** ISO-8601 timestamp of the last successful sync for the active source. */
  lastSyncTime: string | null;
  /** `true` when the derived variant represents a disconnected state. */
  isOffline: boolean;
  /** Manually trigger an immediate sync replay. */
  syncNow: () => void;
  /** Clear a failed-sync flag and retry syncing. */
  retry: () => void;
}

/**
 * Derive the variant from the live `@powersync/web` runtime status.
 *
 * Used only when the live PowerSync client is enabled; the real connection
 * state — not the local mutation queue — then drives the status.
 */
export function deriveLiveVariant(
  live: LivePowerSyncStatus,
  isOffline: boolean,
): SyncStatusVariant {
  if (isOffline) return 'offline';
  if (live.connecting || live.syncing) return 'syncing';
  if (live.connected) return 'synced';
  if (live.hasError) return 'error';
  return 'offline';
}

/**
 * Map a status variant to its human-readable label. Shared by every sync
 * surface so the wording stays identical everywhere.
 */
export function describeSyncVariant(
  variant: SyncStatusVariant,
  pendingMutations: number,
  conflictCount: number,
): string {
  switch (variant) {
    case 'synced':
      return 'All synced';
    case 'pending':
      return `${pendingMutations} pending change${pendingMutations !== 1 ? 's' : ''}`;
    case 'syncing':
      return 'Syncing\u2026';
    case 'error':
      return 'Sync failed';
    case 'offline':
      return 'Offline. Changes saved locally';
    case 'conflict':
      return `${conflictCount} conflict${conflictCount !== 1 ? 's' : ''} need attention`;
  }
}

/**
 * `true` when a variant represents a state where the app is not connected and
 * successfully synced — used to drive offline indicators (dots, banners).
 */
export function isDisconnectedVariant(variant: SyncStatusVariant): boolean {
  return variant === 'offline' || variant === 'error' || variant === 'conflict';
}

/**
 * Compute the single, shared sync status view.
 */
export function useSyncStatusVariant(): SyncStatusView {
  const { isOnline, isOffline, pendingMutations, lastSyncTime, isSyncing, syncNow } =
    useSyncStatus();
  const live = useLivePowerSyncStatus();
  const powerSyncActive = isPowerSyncEnabled();

  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncFailed, setLastSyncFailed] = useState(false);

  // Track the previous syncing state to detect sync failures.
  const prevSyncingRef = useRef(false);

  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing && pendingMutations > 0 && isOnline) {
      // Sync just finished but mutations remain → sync failed.
      setLastSyncFailed(true);
    } else if (isSyncing) {
      setLastSyncFailed(false);
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, pendingMutations, isOnline]);

  // Poll unresolved conflicts whenever sync state changes.
  useEffect(() => {
    let cancelled = false;

    async function checkConflicts(): Promise<void> {
      try {
        const conflicts = await getUnresolvedConflicts();
        if (!cancelled) {
          setConflictCount(conflicts.length);
        }
      } catch {
        // IndexedDB may not be available in some contexts.
      }
    }

    void checkConflicts();
    return () => {
      cancelled = true;
    };
  }, [isSyncing, pendingMutations]);

  // Determine the base variant from the local mutation queue.
  let variant: SyncStatusVariant;
  if (isOffline) {
    variant = 'offline';
  } else if (isSyncing) {
    variant = 'syncing';
  } else if (conflictCount > 0) {
    variant = 'conflict';
  } else if (lastSyncFailed) {
    variant = 'error';
  } else if (pendingMutations > 0) {
    variant = 'pending';
  } else {
    variant = 'synced';
  }

  // When the live PowerSync client is active, its real runtime status is the
  // source of truth: the local mutation queue does not track the live
  // connection. Flag off → variant is unchanged and behaviour is identical.
  if (powerSyncActive) {
    variant = deriveLiveVariant(live, isOffline);
  }

  const retry = useCallback(() => {
    setLastSyncFailed(false);
    syncNow();
  }, [syncNow]);

  const activeLastSyncTime = powerSyncActive ? live.lastSyncedAt : lastSyncTime;

  return {
    variant,
    pendingMutations,
    conflictCount,
    lastSyncTime: activeLastSyncTime,
    isOffline: isDisconnectedVariant(variant),
    syncNow,
    retry,
  };
}
