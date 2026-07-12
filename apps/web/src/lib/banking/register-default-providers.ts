// SPDX-License-Identifier: BUSL-1.1

/**
 * Default provider bootstrap.
 *
 * Registers the built-in {@link BankConnectionProvider} implementations into a
 * {@link ProviderRegistry}. Application startup calls {@link registerDefaultProviders}
 * with the {@link defaultRegistry} so that hooks and managers can discover providers —
 * including the crypto wallet/exchange bridge (#2164) — via a single source of truth.
 *
 * Registration is idempotent: providers whose `id` is already present are skipped rather
 * than throwing, so this is safe to call more than once (e.g., across hot reloads).
 *
 * @module banking/register-default-providers
 */

import { CryptoBankProvider } from './crypto-provider';
import { ManualImportProvider } from './manual-provider';
import { defaultRegistry, type ProviderRegistry } from './provider-registry';
import type { BankConnectionProvider } from './types';

/**
 * Register the built-in banking providers into [registry].
 *
 * @param registry - Target registry (defaults to the shared {@link defaultRegistry}).
 * @returns The providers that were newly registered by this call.
 */
export function registerDefaultProviders(
  registry: ProviderRegistry = defaultRegistry,
): BankConnectionProvider[] {
  const providers: BankConnectionProvider[] = [
    new ManualImportProvider(),
    new CryptoBankProvider(),
  ];
  const registered: BankConnectionProvider[] = [];
  for (const provider of providers) {
    if (registry.getProvider(provider.id)) continue;
    registry.registerProvider(provider);
    registered.push(provider);
  }
  return registered;
}
