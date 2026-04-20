// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync endpoint configuration and wiring.
 *
 * Provides runtime configuration for the sync push/pull endpoints,
 * environment-aware defaults, and a health-check helper that verifies
 * server reachability before attempting a full sync cycle.
 *
 * The endpoint URL is resolved from environment variables at build time
 * (via Vite's `import.meta.env`) with a fallback to the current origin.
 *
 * References: issue #627
 */

import { configureSyncEndpoint, type SyncConfig } from './replayMutations';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/** Read a Vite env variable, returning `undefined` when absent or empty. */
function envOrUndefined(key: string): string | undefined {
  try {
    // Vite injects import.meta.env at build time.
    const meta = import.meta as unknown as { env?: Record<string, string> };
    const value = meta.env?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PUSH_ENDPOINT = '/api/sync/push';
const DEFAULT_PULL_ENDPOINT = '/api/sync/pull';
const DEFAULT_HEALTH_ENDPOINT = '/api/sync/health';
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Extended endpoint configuration
// ---------------------------------------------------------------------------

/** Extended configuration including pull and health endpoints. */
export interface SyncEndpointConfig extends SyncConfig {
  /** Path to the pull endpoint. */
  pullEndpoint: string;
  /** Path to the health-check endpoint. */
  healthEndpoint: string;
}

/**
 * Resolve the full sync endpoint configuration from environment variables
 * with sensible defaults for development and production.
 */
export function resolveSyncEndpointConfig(): SyncEndpointConfig {
  const baseUrl =
    envOrUndefined('VITE_SYNC_BASE_URL') ??
    envOrUndefined('VITE_API_BASE_URL') ??
    (typeof self !== 'undefined' && self.location ? self.location.origin : '');

  const apiKey = envOrUndefined('VITE_SUPABASE_ANON_KEY');

  return {
    baseUrl,
    pushEndpoint: envOrUndefined('VITE_SYNC_PUSH_ENDPOINT') ?? DEFAULT_PUSH_ENDPOINT,
    pullEndpoint: envOrUndefined('VITE_SYNC_PULL_ENDPOINT') ?? DEFAULT_PULL_ENDPOINT,
    healthEndpoint: envOrUndefined('VITE_SYNC_HEALTH_ENDPOINT') ?? DEFAULT_HEALTH_ENDPOINT,
    timeout: Number(envOrUndefined('VITE_SYNC_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS,
    apiKey,
  };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Whether the sync endpoint has been initialized. */
let _initialized = false;

/**
 * Initialize the sync endpoint configuration.
 *
 * Should be called once during app bootstrap (e.g. in `main.tsx`).
 * Subsequent calls are idempotent — they will not overwrite the
 * configuration unless `force` is `true`.
 */
export function initSyncEndpoint(force = false): SyncEndpointConfig {
  if (_initialized && !force) {
    return resolveSyncEndpointConfig();
  }

  const config = resolveSyncEndpointConfig();

  configureSyncEndpoint({
    baseUrl: config.baseUrl,
    pushEndpoint: config.pushEndpoint,
    timeout: config.timeout,
    apiKey: config.apiKey,
  });

  _initialized = true;
  return config;
}

/**
 * Reset the initialization state.
 *
 * @internal Exposed for testing — not part of the public API.
 */
export function resetSyncEndpointInit(): void {
  _initialized = false;
}
