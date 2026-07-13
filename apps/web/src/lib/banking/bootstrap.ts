// SPDX-License-Identifier: BUSL-1.1

/**
 * Banking bootstrap — one-time startup wiring for the banking layer.
 *
 * Historically {@link registerDefaultProviders} was only ever invoked from
 * tests, so at runtime the {@link defaultRegistry} was empty and no provider
 * routing could occur. This module is the single startup entry point that:
 *
 * 1. Registers the built-in providers into the shared {@link defaultRegistry}.
 * 2. Constructs the shared {@link ProviderRouter} used for app-routed provider
 *    selection.
 *
 * It is idempotent — safe to call across hot reloads and repeated imports — and
 * returns the shared singletons so callers can wire the router's metadata source
 * once the PowerSync-backed `aggregator_providers` query is available.
 *
 * @module banking/bootstrap
 */

import { defaultRegistry, type ProviderRegistry } from './provider-registry';
import { ProviderRouter, type ProviderMetaSource } from './provider-router';
import { registerDefaultProviders } from './register-default-providers';

/** The shared, lazily-constructed router singleton. */
let sharedRouter: ProviderRouter | undefined;
let bootstrapped = false;

/**
 * The result of {@link bootstrapBanking}: the shared registry and router.
 */
export interface BankingBootstrap {
  /** The registry the default providers were registered into. */
  registry: ProviderRegistry;
  /** The shared router for app-routed provider selection. */
  router: ProviderRouter;
}

/**
 * Register the default providers and build the shared router.
 *
 * Idempotent: subsequent calls return the same singletons without
 * re-registering providers.
 *
 * @param metaSource - Optional operational-metadata source for the router. When
 *   omitted, providers route with neutral defaults until
 *   {@link ProviderRouter.setMetaSource} is called (e.g. after PowerSync is ready).
 * @returns The shared {@link BankingBootstrap} singletons.
 */
export function bootstrapBanking(metaSource?: ProviderMetaSource): BankingBootstrap {
  if (!bootstrapped) {
    registerDefaultProviders(defaultRegistry);
    sharedRouter = new ProviderRouter(defaultRegistry, metaSource);
    bootstrapped = true;
  } else if (metaSource && sharedRouter) {
    sharedRouter.setMetaSource(metaSource);
  }

  return { registry: defaultRegistry, router: sharedRouter as ProviderRouter };
}

/**
 * Return the shared {@link ProviderRouter}, bootstrapping if necessary.
 *
 * @returns The shared router.
 */
export function getProviderRouter(): ProviderRouter {
  if (!sharedRouter) {
    return bootstrapBanking().router;
  }
  return sharedRouter;
}

/**
 * Reset bootstrap state. **Test-only** — lets suites re-bootstrap a clean
 * registry/router without cross-test leakage.
 *
 * @internal
 */
export function resetBankingBootstrapForTests(): void {
  sharedRouter = undefined;
  bootstrapped = false;
}
