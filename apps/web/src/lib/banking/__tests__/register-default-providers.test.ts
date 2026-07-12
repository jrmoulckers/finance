// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { ProviderRegistry } from '../provider-registry';
import { registerDefaultProviders } from '../register-default-providers';

describe('registerDefaultProviders', () => {
  it('registers the manual and crypto providers', () => {
    const registry = new ProviderRegistry();
    registerDefaultProviders(registry);
    expect(registry.getProvider('manual')).toBeDefined();
    expect(registry.getProvider('crypto')).toBeDefined();
  });

  it('exposes a crypto-capable provider via feature query', () => {
    const registry = new ProviderRegistry();
    registerDefaultProviders(registry);
    const cryptoProviders = registry.getProvidersWithFeature('crypto');
    expect(cryptoProviders.map((p) => p.id)).toContain('crypto');
  });

  it('is idempotent and does not throw on repeated registration', () => {
    const registry = new ProviderRegistry();
    const first = registerDefaultProviders(registry);
    expect(first.length).toBeGreaterThan(0);
    const second = registerDefaultProviders(registry);
    expect(second).toHaveLength(0);
    expect(registry.getAllProviders()).toHaveLength(first.length);
  });
});
