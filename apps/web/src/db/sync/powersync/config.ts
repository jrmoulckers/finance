// SPDX-License-Identifier: BUSL-1.1

/**
 * Environment-derived configuration for the live PowerSync client.
 *
 * These values point the web client at the self-hosted Supabase + PowerSync
 * backend (`finance.jrmoulckers.com`). They are injected at build time by Vite
 * from `VITE_*` variables (see `.env.example` and the deploy workflows).
 *
 * The client stays completely inert unless `VITE_POWERSYNC_ENABLED === 'true'`.
 * This lets the real sync path land behind a flag while the data layer is
 * migrated onto it, without changing the behavior of the shipped app.
 */

/** Resolved PowerSync client configuration. */
export interface PowerSyncClientConfig {
  /** PowerSync sync-service URL, e.g. `https://finance.jrmoulckers.com/sync`. */
  readonly powersyncUrl: string;
  /** Supabase project URL, e.g. `https://finance.jrmoulckers.com`. */
  readonly supabaseUrl: string;
  /** Supabase anon/public key (used as the PostgREST `apikey`). */
  readonly supabaseAnonKey: string;
  /** Whether the live PowerSync client is enabled (feature flag). */
  readonly enabled: boolean;
}

/** Read a trimmed Vite env var, returning an empty string when unset. */
function readEnv(name: string): string {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env?.[name]?.trim() ?? '';
}

/** Resolve the PowerSync client configuration from the Vite environment. */
export function resolvePowerSyncClientConfig(): PowerSyncClientConfig {
  return {
    powersyncUrl: readEnv('VITE_POWERSYNC_URL'),
    supabaseUrl: readEnv('VITE_SUPABASE_URL'),
    supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
    enabled: readEnv('VITE_POWERSYNC_ENABLED') === 'true',
  };
}

/**
 * Whether the client is both enabled and fully configured.
 *
 * Requires the feature flag plus all three backend coordinates. A missing URL
 * or key means the client must not attempt to connect.
 */
export function isPowerSyncClientConfigured(
  config: PowerSyncClientConfig = resolvePowerSyncClientConfig(),
): boolean {
  return (
    config.enabled &&
    config.powersyncUrl.length > 0 &&
    config.supabaseUrl.length > 0 &&
    config.supabaseAnonKey.length > 0
  );
}

/** Build the Supabase PostgREST base URL (`<supabaseUrl>/rest/v1`). */
export function postgrestBaseUrl(config: PowerSyncClientConfig): string {
  return `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
}
