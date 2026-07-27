// SPDX-License-Identifier: BUSL-1.1

/**
 * Live PowerSync runtime status store.
 *
 * A tiny framework-agnostic external store that mirrors the real
 * `@powersync/web` runtime `SyncStatus` into a shape the UI can consume via
 * `useSyncExternalStore`. The connect path in `./database.ts` is the only
 * writer; components read through `../../hooks/useLivePowerSyncStatus`.
 *
 * This store is deliberately separate from the custom mutation-queue status
 * (`hooks/useSyncStatus.ts`): that subsystem has a large blast radius and its
 * semantics must not change. Keeping the real runtime status in its own store
 * means the visible sync bar can reflect live connection/sync state only when
 * the live client is actually enabled, with zero behaviour change otherwise.
 *
 * References: issues #3945 / #3935.
 */

/** Snapshot of the live PowerSync runtime status, in UI-friendly form. */
export interface LivePowerSyncStatus {
  /** Whether the client is connected to the PowerSync service. */
  readonly connected: boolean;
  /** Whether the client is establishing a connection. */
  readonly connecting: boolean;
  /** Whether data is currently being downloaded or uploaded. */
  readonly syncing: boolean;
  /** Whether at least one full sync has completed since initialization. */
  readonly hasSynced: boolean;
  /** Whether the last download or upload reported an error. */
  readonly hasError: boolean;
  /** ISO-8601 timestamp of the last completed sync, or `null`. */
  readonly lastSyncedAt: string | null;
}

/** The disconnected default snapshot, shared as a stable reference. */
const INITIAL_STATUS: LivePowerSyncStatus = Object.freeze({
  connected: false,
  connecting: false,
  syncing: false,
  hasSynced: false,
  hasError: false,
  lastSyncedAt: null,
});

let current: LivePowerSyncStatus = INITIAL_STATUS;

const listeners = new Set<() => void>();

/** Return the current live status snapshot (stable reference between changes). */
export function getLivePowerSyncStatusSnapshot(): LivePowerSyncStatus {
  return current;
}

/**
 * Subscribe to live status changes. Returns an unsubscribe function.
 * Compatible with `useSyncExternalStore`.
 */
export function subscribeLivePowerSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function isSameStatus(a: LivePowerSyncStatus, b: LivePowerSyncStatus): boolean {
  return (
    a.connected === b.connected &&
    a.connecting === b.connecting &&
    a.syncing === b.syncing &&
    a.hasSynced === b.hasSynced &&
    a.hasError === b.hasError &&
    a.lastSyncedAt === b.lastSyncedAt
  );
}

/**
 * Replace the live status. Only publishes a new snapshot (and notifies
 * subscribers) when a field actually changed, so `useSyncExternalStore`
 * consumers keep a stable reference and do not re-render needlessly.
 */
export function setLivePowerSyncStatus(next: LivePowerSyncStatus): void {
  if (isSameStatus(current, next)) {
    return;
  }
  current = Object.freeze({ ...next });
  notify();
}

/** Reset the live status back to the disconnected default and notify. */
export function resetLivePowerSyncStatus(): void {
  setLivePowerSyncStatus(INITIAL_STATUS);
}
