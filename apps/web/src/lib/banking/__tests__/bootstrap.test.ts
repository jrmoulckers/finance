// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapBanking, getProviderRouter, resetBankingBootstrapForTests } from '../bootstrap';
import { defaultRegistry } from '../provider-registry';
import type { RoutableProviderMeta } from '../aggregator-metadata';

describe('bootstrapBanking', () => {
  beforeEach(() => {
    resetBankingBootstrapForTests();
    defaultRegistry.clear();
  });

  it('registers the default providers into the shared registry', () => {
    const { registry } = bootstrapBanking();
    const ids = registry.getAllProviders().map((p) => p.id);
    expect(ids).toContain('manual');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('does not eagerly register the aggregator providers', () => {
    const { registry } = bootstrapBanking();
    const ids = registry.getAllProviders().map((p) => p.id);
    expect(ids).not.toContain('plaid');
  });

  it('builds a router that routes against the registered providers', () => {
    const { router, registry } = bootstrapBanking();
    const ids = registry.getAllProviders().map((p) => p.id);
    const primaryId = router.selectPrimary()?.id;
    expect(primaryId).toBeDefined();
    expect(ids).toContain(primaryId);
  });

  it('is idempotent — repeated calls do not double-register', () => {
    const first = bootstrapBanking();
    const countAfterFirst = first.registry.getAllProviders().length;
    const second = bootstrapBanking();
    expect(second.registry.getAllProviders().length).toBe(countAfterFirst);
    expect(second.router).toBe(first.router);
  });

  it('attaches a metadata source on first bootstrap', () => {
    const metas: RoutableProviderMeta[] = [
      {
        providerId: 'manual',
        status: 'active',
        healthScore: 100,
        priority: 0,
        isEnabled: true,
        supportedRegions: [],
      },
    ];
    const { router } = bootstrapBanking(() => metas);
    expect(router.selectPrimary({ preferredProviderId: 'manual' })?.id).toBe('manual');
  });

  it('updates the metadata source on a later call once bootstrapped', () => {
    bootstrapBanking();
    const router = getProviderRouter();
    router.setMetaSource(() => []);
    // Re-bootstrapping with a new source should update the existing router.
    bootstrapBanking(() => [
      {
        providerId: 'manual',
        status: 'down',
        healthScore: 0,
        priority: 0,
        isEnabled: true,
        supportedRegions: [],
      },
    ]);
    // manual is now marked down, so it must not be selected.
    expect(router.selectPrimary({ preferredProviderId: 'manual' })?.id).not.toBe('manual');
  });

  it('getProviderRouter bootstraps lazily when called first', () => {
    const router = getProviderRouter();
    expect(router).toBeDefined();
    expect(defaultRegistry.getAllProviders().length).toBeGreaterThan(0);
  });
});
