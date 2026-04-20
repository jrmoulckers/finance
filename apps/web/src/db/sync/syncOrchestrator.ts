// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync orchestrator — coordinates push and pull sync operations.
 *
 * Provides a single entry point for a full sync cycle:
 *   1. Health check (is the server reachable?)
 *   2. Push (replay local mutations to the server)
 *   3. Pull (download server-side changes)
 *
 * The orchestrator ensures:
 *   - Only one sync cycle runs at a time (mutex).
 *   - Auth errors halt the cycle immediately.
 *   - Results are aggregated and broadcast to the UI.
 *
 * Usage:
 * ```ts
 * const result = await performFullSync();
 * if (result.authError) {
 *   // Redirect to login
 * }
 * ```
 *
 * References: issue #535
 */

import { replayMutations, type ReplayResult } from './replayMutations';
import { pullChanges, type PullResult } from './pullChanges';
import { checkSyncHealth, type HealthCheckResult } from './healthCheck';
import type { SwToClientMessage } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated result from a full sync cycle. */
export interface FullSyncResult {
  /** Health check result (null if skipped). */
  readonly health: HealthCheckResult | null;
  /** Push result (null if skipped due to health/auth). */
  readonly push: ReplayResult | null;
  /** Pull result (null if skipped due to health/auth). */
  readonly pull: PullResult | null;
  /** Whether the sync was skipped entirely. */
  readonly skipped: boolean;
  /** Whether any phase encountered an auth error. */
  readonly authError: boolean;
  /** Total duration of the sync cycle in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Mutex
// ---------------------------------------------------------------------------

let _syncInProgress = false;

/** Check if a sync is currently in progress. */
export function isSyncInProgress(): boolean {
  return _syncInProgress;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Perform a full push+pull sync cycle.
 *
 * @param options.skipHealthCheck  Skip the health check (default: false).
 * @param options.skipPull         Skip the pull phase (default: false).
 * @param options.applyPullChanges Callback to apply pulled changes to SQLite.
 * @param options.broadcast        Callback to broadcast messages to UI.
 */
export async function performFullSync(options?: {
  skipHealthCheck?: boolean;
  skipPull?: boolean;
  applyPullChanges?: (changes: import('./pullChanges').PullChange[]) => Promise<void>;
  broadcast?: (message: SwToClientMessage) => void;
}): Promise<FullSyncResult> {
  // Prevent concurrent sync cycles.
  if (_syncInProgress) {
    return {
      health: null,
      push: null,
      pull: null,
      skipped: true,
      authError: false,
      durationMs: 0,
    };
  }

  _syncInProgress = true;
  const startTime = performance.now();

  try {
    // Phase 1: Health check
    let health: HealthCheckResult | null = null;
    if (!options?.skipHealthCheck) {
      health = await checkSyncHealth();
      if (!health.reachable) {
        return {
          health,
          push: null,
          pull: null,
          skipped: true,
          authError: false,
          durationMs: Math.round(performance.now() - startTime),
        };
      }
    }

    // Phase 2: Push (replay local mutations)
    const pushResult = await replayMutations(options?.broadcast);

    if (pushResult.authError) {
      return {
        health,
        push: pushResult,
        pull: null,
        skipped: false,
        authError: true,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    // Phase 3: Pull (download server changes)
    let pullResult: PullResult | null = null;
    if (!options?.skipPull) {
      pullResult = await pullChanges(options?.applyPullChanges);

      if (pullResult.authError) {
        return {
          health,
          push: pushResult,
          pull: pullResult,
          skipped: false,
          authError: true,
          durationMs: Math.round(performance.now() - startTime),
        };
      }
    }

    return {
      health,
      push: pushResult,
      pull: pullResult,
      skipped: false,
      authError: false,
      durationMs: Math.round(performance.now() - startTime),
    };
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Reset the orchestrator state.
 *
 * @internal Exposed for testing — not part of the public API.
 */
export function resetSyncOrchestrator(): void {
  _syncInProgress = false;
}
