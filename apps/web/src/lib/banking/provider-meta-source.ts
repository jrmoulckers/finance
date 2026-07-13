// SPDX-License-Identifier: BUSL-1.1

/**
 * DB-backed provider metadata source (#3852).
 *
 * Bridges the PowerSync-synced `aggregator_provider` directory into the
 * {@link ProviderRouter}. The router calls the returned function each time it
 * routes, so metadata always reflects the latest synced state without any
 * explicit refresh wiring.
 *
 * @module lib/banking/provider-meta-source
 */

import { listAggregatorProviders } from '../../db/repositories/bank-connections';
import type { SqliteDb } from '../../db/sqlite-wasm';
import type { AggregatorStatus, RoutableProviderMeta } from './aggregator-metadata';
import type { ProviderMetaSource } from './provider-router';

const VALID_STATUSES: ReadonlySet<string> = new Set(['active', 'degraded', 'down', 'maintenance']);

/**
 * Coerce a directory status string to a routable {@link AggregatorStatus}.
 * Unknown values are treated as `down` so an unrecognised provider is never
 * silently routed to.
 */
function toAggregatorStatus(value: string): AggregatorStatus {
  return VALID_STATUSES.has(value) ? (value as AggregatorStatus) : 'down';
}

/**
 * Build a {@link ProviderMetaSource} backed by the local SQLite provider
 * directory.
 *
 * The `providerId` is taken from the directory `name` column (e.g. `plaid`),
 * which matches the registered {@link BankConnectionProvider.id} — not the row
 * UUID.
 *
 * @param db - The local SQLite database.
 * @returns A metadata source the router can query on every route.
 */
export function createDbProviderMetaSource(db: SqliteDb): ProviderMetaSource {
  return (): readonly RoutableProviderMeta[] =>
    listAggregatorProviders(db).map((provider) => ({
      providerId: provider.name,
      status: toAggregatorStatus(provider.status),
      healthScore: provider.healthScore,
      priority: provider.priority,
      isEnabled: provider.isEnabled,
      supportedRegions: provider.supportedRegions,
    }));
}
