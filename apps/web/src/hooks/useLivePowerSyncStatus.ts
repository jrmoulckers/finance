// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook exposing the live `@powersync/web` runtime status.
 *
 * Thin `useSyncExternalStore` wrapper over the live-status store in
 * `../db/sync/powersync/live-status`. When the live PowerSync client is
 * disabled (the default build), the store simply stays at its disconnected
 * default, so consumers can call this unconditionally and branch on
 * `isPowerSyncEnabled()`.
 *
 * References: issues #3945 / #3935.
 */

import { useSyncExternalStore } from 'react';

import {
  getLivePowerSyncStatusSnapshot,
  subscribeLivePowerSyncStatus,
  type LivePowerSyncStatus,
} from '../db/sync/powersync/live-status';

/** Subscribe to the live PowerSync runtime status. */
export function useLivePowerSyncStatus(): LivePowerSyncStatus {
  return useSyncExternalStore(
    subscribeLivePowerSyncStatus,
    getLivePowerSyncStatusSnapshot,
    getLivePowerSyncStatusSnapshot,
  );
}
