// SPDX-License-Identifier: BUSL-1.1

/**
 * Lifecycle management for the live PowerSync database (browser-only).
 *
 * This is the ONLY module that touches the browser-only `@powersync/web`
 * package, and it does so exclusively through a guarded dynamic `import()`.
 * Each entry point begins with a literal
 * `import.meta.env.VITE_POWERSYNC_ENABLED !== 'true'` guard so that, in the
 * default build (the flag is unset in the deploy workflows), the guard folds to
 * an unconditional early return and the bundler drops `@powersync/web`,
 * `@powersync/common`, and the wa-sqlite WASM from the shipped bundle.
 *
 * When the flag is enabled at runtime the modules are loaded lazily on demand.
 *
 * References: sync-rules.yaml, issues #3941 / #3935.
 */

import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { isPowerSyncClientConfigured, resolvePowerSyncClientConfig } from './config';

/** Local database filename for the PowerSync-managed SQLite store. */
const DB_FILENAME = 'finance.db';

/** Singleton instance, created lazily on first use. */
let databasePromise: Promise<AbstractPowerSyncDatabase | null> | null = null;

/** Runtime check for whether the live PowerSync client is enabled. */
export function isPowerSyncEnabled(): boolean {
  return import.meta.env.VITE_POWERSYNC_ENABLED === 'true';
}

/**
 * Get (creating on first call) the live PowerSync database instance, or `null`
 * when the client is disabled or not fully configured.
 */
export async function getPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase | null> {
  if (import.meta.env.VITE_POWERSYNC_ENABLED !== 'true') {
    return null;
  }
  if (!isPowerSyncClientConfigured()) {
    return null;
  }
  if (!databasePromise) {
    databasePromise = (async () => {
      const { PowerSyncDatabase } = await import('@powersync/web');
      const { AppSchema } = await import('./schema');
      return new PowerSyncDatabase({
        schema: AppSchema,
        database: { dbFilename: DB_FILENAME },
      });
    })();
  }
  return databasePromise;
}

/**
 * Connect the live PowerSync database to the Supabase backend. Returns the
 * connected database, or `null` when the client is disabled/unconfigured.
 */
export async function connectPowerSync(): Promise<AbstractPowerSyncDatabase | null> {
  if (import.meta.env.VITE_POWERSYNC_ENABLED !== 'true') {
    return null;
  }
  const database = await getPowerSyncDatabase();
  if (!database) {
    return null;
  }
  const config = resolvePowerSyncClientConfig();
  const { SupabaseConnector } = await import('./connector');
  await database.connect(new SupabaseConnector(config));
  return database;
}

/** Disconnect the live PowerSync database if it exists (leaves data intact). */
export async function disconnectPowerSync(): Promise<void> {
  if (!databasePromise) {
    return;
  }
  const database = await databasePromise;
  await database?.disconnect();
}

/** Disconnect and dispose the live PowerSync database, clearing the singleton. */
export async function closePowerSync(): Promise<void> {
  if (!databasePromise) {
    return;
  }
  const database = await databasePromise;
  databasePromise = null;
  await database?.close();
}
