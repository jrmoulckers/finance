// SPDX-License-Identifier: BUSL-1.1

/**
 * Lazy registration of the edge-backed aggregator providers (#3854).
 *
 * The concrete aggregator providers (Plaid/MX/TrueLayer/Finicity) and their
 * {@link BaseAggregatorProvider} base class are only needed once a user
 * interacts with live bank connections — never at first paint. This module
 * pulls them in through a **dynamic `import()`** so their implementation code is
 * code-split into a lazy chunk and kept out of the eager startup bundle (which
 * otherwise breached the `vendor-app` performance budget).
 *
 * Registration is idempotent and single-flighted: concurrent callers share one
 * in-flight promise, and providers already present in the registry are skipped.
 *
 * @module lib/banking/register-aggregator-providers
 */

import type { SyncedBankDataSource } from './base-aggregator-provider';
import { defaultRegistry, type ProviderRegistry } from './provider-registry';

/** Options for {@link ensureAggregatorProvidersRegistered}. */
export interface EnsureAggregatorProvidersOptions {
  /** Registry to register into (defaults to the shared {@link defaultRegistry}). */
  registry?: ProviderRegistry;
  /** Optional synced local read path injected into each aggregator provider. */
  dataSource?: SyncedBankDataSource;
}

/** In-flight/settled registration promise, keyed by registry, for single-flight. */
const inFlight = new WeakMap<ProviderRegistry, Promise<void>>();

/**
 * Lazily import and register the four concrete aggregator providers.
 *
 * Safe to call repeatedly (e.g. on every navigation to the banking area): the
 * first call performs the dynamic import + registration, and subsequent calls
 * reuse the same resolved promise. Routing eligibility remains governed by the
 * synced `aggregator_provider` directory, so disabled placeholders
 * (TrueLayer/Finicity) never get selected until their backends land.
 *
 * @param options - Optional registry/data-source overrides.
 * @returns A promise that resolves once the aggregator providers are registered.
 */
export function ensureAggregatorProvidersRegistered(
  options: EnsureAggregatorProvidersOptions = {},
): Promise<void> {
  const registry = options.registry ?? defaultRegistry;
  const existing = inFlight.get(registry);
  if (existing) return existing;

  const task = (async () => {
    const [{ createAggregatorProviders }, { createSupabaseEdgeTransport }] = await Promise.all([
      import('./aggregator-providers'),
      import('./aggregator-transport'),
    ]);
    const transport = createSupabaseEdgeTransport();
    for (const provider of createAggregatorProviders(transport, options.dataSource)) {
      if (registry.getProvider(provider.id)) continue;
      registry.registerProvider(provider);
    }
  })();

  inFlight.set(registry, task);
  return task;
}

/**
 * Clear the single-flight cache. **Test-only.**
 *
 * @param registry - Registry whose cached promise should be dropped
 *   (defaults to the shared {@link defaultRegistry}).
 * @internal
 */
export function resetAggregatorRegistrationForTests(
  registry: ProviderRegistry = defaultRegistry,
): void {
  inFlight.delete(registry);
}
