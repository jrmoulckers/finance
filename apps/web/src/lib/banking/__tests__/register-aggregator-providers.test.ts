// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderRegistry } from '../provider-registry';
import {
  ensureAggregatorProvidersRegistered,
  resetAggregatorRegistrationForTests,
} from '../register-aggregator-providers';

vi.mock('../../../auth/token-storage', () => ({
  getAccessToken: vi.fn(async () => 'token'),
}));

describe('ensureAggregatorProvidersRegistered', () => {
  afterEach(() => {
    resetAggregatorRegistrationForTests();
  });

  it('lazily registers the four aggregator providers', async () => {
    const registry = new ProviderRegistry();
    await ensureAggregatorProvidersRegistered({ registry });
    for (const id of ['plaid', 'mx', 'truelayer', 'finicity']) {
      expect(registry.getProvider(id)).toBeDefined();
    }
    resetAggregatorRegistrationForTests(registry);
  });

  it('is single-flighted — concurrent calls share one registration', async () => {
    const registry = new ProviderRegistry();
    const a = ensureAggregatorProvidersRegistered({ registry });
    const b = ensureAggregatorProvidersRegistered({ registry });
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(registry.getAllProviders()).toHaveLength(4);
    resetAggregatorRegistrationForTests(registry);
  });

  it('does not duplicate providers already present in the registry', async () => {
    const registry = new ProviderRegistry();
    await ensureAggregatorProvidersRegistered({ registry });
    resetAggregatorRegistrationForTests(registry);
    await ensureAggregatorProvidersRegistered({ registry });
    expect(registry.getAllProviders()).toHaveLength(4);
    resetAggregatorRegistrationForTests(registry);
  });
});
