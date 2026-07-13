// SPDX-License-Identifier: BUSL-1.1

/**
 * Aggregator provider metadata — the runtime health/priority/region data used
 * to route between interchangeable banking providers.
 *
 * A registered {@link BankConnectionProvider} describes *what it can do*
 * (its `id`, `supportedCountries`, and capability `features`). This module adds
 * the *operational* dimension the router needs to choose between several
 * capable providers: whether the provider is enabled, its current health, and
 * its failover priority.
 *
 * This metadata mirrors the backend `aggregator_providers` table
 * (`services/api/.../20260331000001_bank_connectivity_foundation.sql`) so the
 * client can make the same routing decisions the server would. In production it
 * arrives via PowerSync-synced rows; in tests and bootstrap it can be supplied
 * from static defaults.
 *
 * @module banking/aggregator-metadata
 */

import type { BankConnectionProvider } from './types';

// ---------------------------------------------------------------------------
// Provider operational status
// ---------------------------------------------------------------------------

/**
 * Operational status of an aggregator provider.
 *
 * Mirrors the backend `aggregator_providers.status` CHECK constraint.
 *
 * - `active` — healthy and fully available.
 * - `degraded` — reachable but impaired (elevated latency/errors); still usable.
 * - `down` — unavailable; excluded from routing until recovered.
 * - `maintenance` — intentionally offline; excluded from routing.
 */
export type AggregatorStatus = 'active' | 'degraded' | 'down' | 'maintenance';

/**
 * Runtime metadata for a single aggregator provider, keyed by `providerId`.
 *
 * `providerId` must match a {@link BankConnectionProvider.id} registered in the
 * {@link ProviderRegistry} for the provider to be routable.
 */
export interface RoutableProviderMeta {
  /** Provider identifier — matches {@link BankConnectionProvider.id}. */
  providerId: string;
  /** Current operational status. */
  status: AggregatorStatus;
  /** Provider health score in the range [0, 100] (higher is healthier). */
  healthScore: number;
  /**
   * Failover priority. **Lower numbers are preferred** — this matches the
   * backend `ORDER BY priority ASC` used by the aggregator-health function, so
   * priority `0` outranks priority `1`.
   */
  priority: number;
  /** Whether the provider is enabled for routing. Disabled providers are skipped. */
  isEnabled: boolean;
  /**
   * ISO 3166-1 alpha-2 country codes this provider serves. An **empty array
   * means the provider is treated as global** (serves every region).
   */
  supportedRegions: readonly string[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default metadata applied to a registered provider that has no explicit
 * operational metadata (e.g. a code-registered provider that is not present in
 * the synced `aggregator_providers` table).
 *
 * Such providers are treated as enabled and healthy but ranked **last**
 * (maximum priority value) so that any explicitly-configured aggregator always
 * takes precedence.
 *
 * @param provider - The registered provider to derive defaults from.
 * @returns Neutral, lowest-precedence metadata for the provider.
 */
export function defaultMetaForProvider(provider: BankConnectionProvider): RoutableProviderMeta {
  return {
    providerId: provider.id,
    status: 'active',
    healthScore: 100,
    priority: Number.MAX_SAFE_INTEGER,
    isEnabled: true,
    supportedRegions: provider.supportedCountries,
  };
}

/**
 * Whether a provider's status permits it to be selected by the router.
 *
 * `down` and `maintenance` providers are never routable. `degraded` providers
 * are routable unless the caller opts out.
 *
 * @param status - The provider's operational status.
 * @param includeDegraded - Whether `degraded` providers are eligible. @default true
 * @returns `true` if the status permits routing.
 */
export function isStatusRoutable(status: AggregatorStatus, includeDegraded = true): boolean {
  if (status === 'down' || status === 'maintenance') return false;
  if (status === 'degraded') return includeDegraded;
  return true;
}
