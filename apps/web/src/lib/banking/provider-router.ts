// SPDX-License-Identifier: BUSL-1.1

/**
 * Provider router — chooses which banking aggregator serves a connection.
 *
 * This is the core of the app's **"app-routed by default, optional override"**
 * provider-selection model. Given the user's region and the capabilities a
 * connection needs, the router produces an ordered **failover chain** of
 * interchangeable {@link BankConnectionProvider}s:
 *
 * 1. **Filter** to providers that are registered, enabled, capable of the
 *    required features, and serve the requested region.
 * 2. **Rank** the survivors by failover priority (ascending — lower is better,
 *    matching the backend `ORDER BY priority ASC`), breaking ties by health
 *    score (descending), then status (`active` before `degraded`), then
 *    provider id for deterministic ordering.
 * 3. **Override** — if the caller supplies a `preferredProviderId` that is
 *    itself routable, it is promoted to the front of the chain. This is the
 *    seam behind the optional advanced "choose your connection method" UX.
 *
 * The head of the chain is the primary provider; the remainder are ordered
 * fallbacks the {@link ConnectionManager} can escalate to when the primary is
 * unavailable.
 *
 * @module banking/provider-router
 */

import {
  defaultMetaForProvider,
  isStatusRoutable,
  type RoutableProviderMeta,
} from './aggregator-metadata';
import type { ProviderRegistry } from './provider-registry';
import type { BankConnectionProvider, ProviderFeatures } from './types';

// ---------------------------------------------------------------------------
// Request / result types
// ---------------------------------------------------------------------------

/**
 * Parameters describing the connection the caller wants to route.
 */
export interface RoutingRequest {
  /**
   * ISO 3166-1 alpha-2 country code the connection targets. When omitted, the
   * region filter is skipped and all providers are considered region-eligible.
   */
  countryCode?: string;
  /**
   * Capability flags the connection requires. Only providers whose
   * {@link ProviderFeatures} are truthy for **every** listed feature qualify.
   */
  requiredFeatures?: readonly (keyof ProviderFeatures)[];
  /**
   * Advanced override: force this provider to the front of the chain when it is
   * routable. Ignored if the provider is unregistered, disabled, unhealthy, or
   * fails the region/capability filter.
   */
  preferredProviderId?: string;
  /**
   * Whether `degraded` providers are eligible. @default true
   */
  includeDegraded?: boolean;
}

/** Why the router produced the chain it did. */
export type RoutingReason =
  /** No eligible provider was found for the request. */
  | 'none'
  /** The chain head came from a valid {@link RoutingRequest.preferredProviderId}. */
  | 'override'
  /** The chain head was selected automatically by priority/health. */
  | 'routed';

/**
 * The router's decision for a {@link RoutingRequest}.
 */
export interface RoutingDecision {
  /** The selected primary provider, or `null` when nothing is eligible. */
  primary: BankConnectionProvider | null;
  /** Ordered fallback providers to escalate to after the primary. */
  fallbacks: BankConnectionProvider[];
  /** The full ordered chain: `[primary, ...fallbacks]` (empty when none). */
  chain: BankConnectionProvider[];
  /** How the primary was chosen. */
  reason: RoutingReason;
}

// ---------------------------------------------------------------------------
// Pure resolution
// ---------------------------------------------------------------------------

/** @internal A provider paired with its resolved operational metadata. */
interface Candidate {
  provider: BankConnectionProvider;
  meta: RoutableProviderMeta;
}

/**
 * Does `provider` support every feature in `required`?
 *
 * @internal
 */
function hasAllFeatures(
  provider: BankConnectionProvider,
  required: readonly (keyof ProviderFeatures)[] | undefined,
): boolean {
  if (!required || required.length === 0) return true;
  return required.every((feature) => provider.features[feature]);
}

/**
 * Does `provider` (with `meta`) serve `countryCode`?
 *
 * A provider serves a region when either its registered `supportedCountries`
 * or its metadata `supportedRegions` list the country (case-insensitive), or
 * when both region lists are empty (global provider). When no `countryCode` is
 * requested, every provider is considered eligible.
 *
 * @internal
 */
function servesRegion(
  provider: BankConnectionProvider,
  meta: RoutableProviderMeta,
  countryCode: string | undefined,
): boolean {
  if (!countryCode) return true;
  const target = countryCode.toUpperCase();
  const regions = [...provider.supportedCountries, ...meta.supportedRegions];
  if (regions.length === 0) return true; // global provider
  return regions.some((c) => c.toUpperCase() === target);
}

/**
 * Rank comparator for eligible candidates.
 *
 * Ordering (best first): priority ascending, then health score descending,
 * then `active` before `degraded`, then provider id ascending for stability.
 *
 * @internal
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.meta.priority !== b.meta.priority) return a.meta.priority - b.meta.priority;
  if (a.meta.healthScore !== b.meta.healthScore) return b.meta.healthScore - a.meta.healthScore;
  const statusRank = (s: RoutableProviderMeta['status']): number => (s === 'active' ? 0 : 1);
  const statusDelta = statusRank(a.meta.status) - statusRank(b.meta.status);
  if (statusDelta !== 0) return statusDelta;
  return a.provider.id.localeCompare(b.provider.id);
}

/**
 * Resolve a routing decision from an explicit provider + metadata list.
 *
 * This is the pure core of the router, exported for unit testing and reuse.
 * The {@link ProviderRouter} class wraps it with a registry and a metadata
 * source.
 *
 * @param providers - Candidate provider implementations.
 * @param metaById - Operational metadata keyed by provider id. Providers absent
 *   from this map fall back to {@link defaultMetaForProvider} (enabled, healthy,
 *   lowest precedence).
 * @param request - The routing request.
 * @returns The ordered {@link RoutingDecision}.
 */
export function resolveRoute(
  providers: readonly BankConnectionProvider[],
  metaById: ReadonlyMap<string, RoutableProviderMeta>,
  request: RoutingRequest = {},
): RoutingDecision {
  const includeDegraded = request.includeDegraded ?? true;

  const eligible: Candidate[] = providers
    .map((provider) => ({
      provider,
      meta: metaById.get(provider.id) ?? defaultMetaForProvider(provider),
    }))
    .filter(({ provider, meta }) => {
      if (!meta.isEnabled) return false;
      if (!isStatusRoutable(meta.status, includeDegraded)) return false;
      if (!hasAllFeatures(provider, request.requiredFeatures)) return false;
      if (!servesRegion(provider, meta, request.countryCode)) return false;
      return true;
    })
    .sort(compareCandidates);

  if (eligible.length === 0) {
    return { primary: null, fallbacks: [], chain: [], reason: 'none' };
  }

  // Advanced override: promote the preferred provider iff it is eligible.
  let reason: RoutingReason = 'routed';
  const preferredId = request.preferredProviderId;
  if (preferredId) {
    const idx = eligible.findIndex((c) => c.provider.id === preferredId);
    if (idx > 0) {
      const [preferred] = eligible.splice(idx, 1);
      eligible.unshift(preferred);
      reason = 'override';
    } else if (idx === 0) {
      reason = 'override';
    }
  }

  const chain = eligible.map((c) => c.provider);
  return { primary: chain[0], fallbacks: chain.slice(1), chain, reason };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * A source of live provider metadata. In production this reads PowerSync-synced
 * `aggregator_providers` rows; in tests/bootstrap it returns static values.
 */
export type ProviderMetaSource = () => readonly RoutableProviderMeta[];

/**
 * Stateful router bound to a {@link ProviderRegistry} and a metadata source.
 *
 * Prefer this over the bare {@link resolveRoute} function in application code —
 * it always routes against the currently-registered providers and the latest
 * metadata each time {@link ProviderRouter.route} is called.
 */
export class ProviderRouter {
  private readonly registry: ProviderRegistry;
  private metaSource: ProviderMetaSource;

  /**
   * @param registry - Registry supplying available provider implementations.
   * @param metaSource - Supplies current operational metadata. Defaults to an
   *   empty list, in which case every provider uses {@link defaultMetaForProvider}.
   */
  constructor(registry: ProviderRegistry, metaSource: ProviderMetaSource = () => []) {
    this.registry = registry;
    this.metaSource = metaSource;
  }

  /**
   * Replace the metadata source (e.g. once the PowerSync query is available).
   *
   * @param metaSource - The new metadata source.
   */
  setMetaSource(metaSource: ProviderMetaSource): void {
    this.metaSource = metaSource;
  }

  /**
   * Route a request to an ordered failover chain of providers.
   *
   * @param request - The routing request.
   * @returns The {@link RoutingDecision}.
   */
  route(request: RoutingRequest = {}): RoutingDecision {
    const metaById = new Map<string, RoutableProviderMeta>();
    for (const meta of this.metaSource()) {
      metaById.set(meta.providerId, meta);
    }
    return resolveRoute(this.registry.getAllProviders(), metaById, request);
  }

  /**
   * Convenience: return only the primary provider for a request, or `null`.
   *
   * @param request - The routing request.
   * @returns The primary provider, or `null` when none is eligible.
   */
  selectPrimary(request: RoutingRequest = {}): BankConnectionProvider | null {
    return this.route(request).primary;
  }
}
