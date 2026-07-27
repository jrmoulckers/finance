// SPDX-License-Identifier: BUSL-1.1

/**
 * Public surface for the live PowerSync client.
 *
 * Only the config helpers and the browser-safe lifecycle functions are
 * re-exported here. The schema and connector values are intentionally NOT
 * re-exported so that importing this barrel does not eagerly pull
 * `@powersync/common` into a consumer's bundle — those are loaded lazily by
 * `database.ts` (or imported directly by tests).
 *
 * References: issues #3941 / #3935.
 */

export {
  resolvePowerSyncClientConfig,
  isPowerSyncClientConfigured,
  postgrestBaseUrl,
  type PowerSyncClientConfig,
} from './config';

export {
  isPowerSyncEnabled,
  getPowerSyncDatabase,
  connectPowerSync,
  disconnectPowerSync,
  closePowerSync,
} from './database';

export type { SupabaseConnectorOptions } from './connector';
