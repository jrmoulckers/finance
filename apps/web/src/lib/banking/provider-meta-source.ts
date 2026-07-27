// SPDX-License-Identifier: BUSL-1.1

/**
 * DB-backed provider metadata source (#3852).
 *
 * Bridges the PowerSync-synced `aggregator_provider` directory into the
 * {@link ProviderRouter}. Because the router routes synchronously, this source
 * keeps a cached snapshot of the directory that is loaded once on creation and
 * refreshed whenever the `aggregator_provider` table changes, so metadata stays
 * in sync without blocking the (synchronous) routing path.
 *
 * @module lib/banking/provider-meta-source
 */

import { listAggregatorProviders } from '../../db/repositories/bank-connections';
import type { AsyncDb } from '../../db/async-db';
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
 * @param db - The application database (`AsyncDb`).
 * @returns A metadata source the router can query synchronously on every route;
 *   it returns the most recently loaded snapshot of the provider directory.
 */
export function createDbProviderMetaSource(db: AsyncDb): ProviderMetaSource {
  let snapshot: readonly RoutableProviderMeta[] = [];

  const refresh = async (): Promise<void> => {
    try {
      const providers = await listAggregatorProviders(db);
      snapshot = providers.map((provider) => ({
        providerId: provider.name,
        status: toAggregatorStatus(provider.status),
        healthScore: provider.healthScore,
        priority: provider.priority,
        isEnabled: provider.isEnabled,
        supportedRegions: provider.supportedRegions,
      }));
    } catch {
      // Preserve the last good snapshot on a transient read failure so the
      // router keeps routing against previously synced metadata.
    }
  };

  void refresh();
  db.onChange(['aggregator_provider'], () => {
    void refresh();
  });

  return () => snapshot;
}
