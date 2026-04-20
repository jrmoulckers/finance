// SPDX-License-Identifier: BUSL-1.1

/**
 * Connection health check for the sync system.
 *
 * Provides a lightweight mechanism to verify that the sync endpoint is
 * reachable and responding before attempting expensive push/pull operations.
 *
 * The health check:
 *   1. Sends a HEAD request to the sync endpoint.
 *   2. Returns connectivity status, latency, and server time.
 *   3. Caches the result to avoid redundant checks.
 *
 * This is NOT a substitute for navigator.onLine — it validates actual
 * server reachability, not just network adapter state.
 *
 * References: issue #535
 */

import { getSyncConfig } from './replayMutations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a connection health check. */
export interface HealthCheckResult {
  /** Whether the sync endpoint is reachable. */
  readonly reachable: boolean;
  /** Round-trip latency in milliseconds, or `null` if unreachable. */
  readonly latencyMs: number | null;
  /** Server-reported time (from Date header), or `null`. */
  readonly serverTime: string | null;
  /** HTTP status code, or `null` if the request failed. */
  readonly status: number | null;
  /** Timestamp of this check (ms since epoch). */
  readonly checkedAt: number;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Minimum interval between health checks (ms). */
const HEALTH_CHECK_COOLDOWN_MS = 10_000;

let _lastResult: HealthCheckResult | null = null;

/**
 * Get the last cached health check result, or `null` if none exists
 * or the cache has expired.
 */
export function getCachedHealthCheck(): HealthCheckResult | null {
  if (!_lastResult) return null;
  if (Date.now() - _lastResult.checkedAt > HEALTH_CHECK_COOLDOWN_MS) return null;
  return _lastResult;
}

/** Clear the health check cache. */
export function clearHealthCheckCache(): void {
  _lastResult = null;
}

// ---------------------------------------------------------------------------
// Health check implementation
// ---------------------------------------------------------------------------

/**
 * Check whether the sync endpoint is reachable.
 *
 * Returns a cached result if a recent check exists (within cooldown).
 * Otherwise performs a HEAD request to the health endpoint.
 *
 * @param force  Skip the cache and always perform a fresh check.
 */
export async function checkSyncHealth(force = false): Promise<HealthCheckResult> {
  // Return cached result if still fresh.
  if (!force) {
    const cached = getCachedHealthCheck();
    if (cached) return cached;
  }

  // Quick bail-out if the browser reports offline.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineResult: HealthCheckResult = {
      reachable: false,
      latencyMs: null,
      serverTime: null,
      status: null,
      checkedAt: Date.now(),
    };
    _lastResult = offlineResult;
    return offlineResult;
  }

  const config = getSyncConfig();
  const healthUrl = `${config.baseUrl}${config.pushEndpoint.replace('/push', '/health')}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout for health check

  const startTime = performance.now();

  try {
    const response = await fetch(healthUrl, {
      method: 'HEAD',
      signal: controller.signal,
      credentials: 'include',
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);

    const result: HealthCheckResult = {
      reachable: response.ok,
      latencyMs,
      serverTime: response.headers.get('Date'),
      status: response.status,
      checkedAt: Date.now(),
    };

    _lastResult = result;
    return result;
  } catch {
    clearTimeout(timeoutId);

    const result: HealthCheckResult = {
      reachable: false,
      latencyMs: null,
      serverTime: null,
      status: null,
      checkedAt: Date.now(),
    };

    _lastResult = result;
    return result;
  }
}
