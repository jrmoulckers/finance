// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import type { BankConnectionProvider, ProviderFeatures } from '../types';
import { ProviderRegistry } from '../provider-registry';
import { resolveRoute, ProviderRouter } from '../provider-router';
import type { RoutableProviderMeta } from '../aggregator-metadata';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_FEATURES: ProviderFeatures = {
  realTimeBalance: false,
  transactionWebhooks: false,
  investmentAccounts: false,
  creditCards: false,
  loans: false,
  bnpl: false,
  crypto: false,
  internationalBanks: false,
};

function stubProvider(
  id: string,
  opts: {
    supportedCountries?: readonly string[];
    features?: Partial<ProviderFeatures>;
  } = {},
): BankConnectionProvider {
  return {
    id,
    name: id,
    supportedCountries: opts.supportedCountries ?? [],
    features: { ...NO_FEATURES, ...opts.features },
    initializeConnection: vi.fn(),
    completeConnection: vi.fn(),
    refreshConnection: vi.fn(),
    removeConnection: vi.fn(),
    getAccounts: vi.fn(),
    getTransactions: vi.fn(),
    getBalances: vi.fn(),
    getConnectionStatus: vi.fn(),
    getProviderHealth: vi.fn(),
  } as BankConnectionProvider;
}

function meta(
  providerId: string,
  overrides: Partial<RoutableProviderMeta> = {},
): RoutableProviderMeta {
  return {
    providerId,
    status: 'active',
    healthScore: 100,
    priority: 0,
    isEnabled: true,
    supportedRegions: [],
    ...overrides,
  };
}

function metaMap(...metas: RoutableProviderMeta[]): Map<string, RoutableProviderMeta> {
  return new Map(metas.map((m) => [m.providerId, m]));
}

// ---------------------------------------------------------------------------
// resolveRoute — ranking
// ---------------------------------------------------------------------------

describe('resolveRoute — ranking', () => {
  it('orders by priority ascending (lower is preferred)', () => {
    const plaid = stubProvider('plaid');
    const mx = stubProvider('mx');
    const decision = resolveRoute(
      [mx, plaid],
      metaMap(meta('plaid', { priority: 0 }), meta('mx', { priority: 1 })),
    );
    expect(decision.reason).toBe('routed');
    expect(decision.primary?.id).toBe('plaid');
    expect(decision.chain.map((p) => p.id)).toEqual(['plaid', 'mx']);
    expect(decision.fallbacks.map((p) => p.id)).toEqual(['mx']);
  });

  it('breaks priority ties by health score descending', () => {
    const a = stubProvider('a');
    const b = stubProvider('b');
    const decision = resolveRoute(
      [a, b],
      metaMap(
        meta('a', { priority: 0, healthScore: 70 }),
        meta('b', { priority: 0, healthScore: 95 }),
      ),
    );
    expect(decision.chain.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('breaks priority + health ties by active-before-degraded', () => {
    const a = stubProvider('a');
    const b = stubProvider('b');
    const decision = resolveRoute(
      [a, b],
      metaMap(meta('a', { status: 'degraded' }), meta('b', { status: 'active' })),
    );
    expect(decision.primary?.id).toBe('b');
  });

  it('is deterministic on full ties via provider id', () => {
    const zed = stubProvider('zed');
    const abe = stubProvider('abe');
    const decision = resolveRoute([zed, abe], metaMap(meta('zed'), meta('abe')));
    expect(decision.chain.map((p) => p.id)).toEqual(['abe', 'zed']);
  });
});

// ---------------------------------------------------------------------------
// resolveRoute — filtering
// ---------------------------------------------------------------------------

describe('resolveRoute — filtering', () => {
  it('excludes disabled providers', () => {
    const on = stubProvider('on');
    const off = stubProvider('off');
    const decision = resolveRoute(
      [off, on],
      metaMap(meta('off', { isEnabled: false, priority: 0 }), meta('on', { priority: 1 })),
    );
    expect(decision.chain.map((p) => p.id)).toEqual(['on']);
  });

  it('excludes down and maintenance providers', () => {
    const up = stubProvider('up');
    const down = stubProvider('down');
    const maint = stubProvider('maint');
    const decision = resolveRoute(
      [down, maint, up],
      metaMap(
        meta('down', { status: 'down', priority: 0 }),
        meta('maint', { status: 'maintenance', priority: 0 }),
        meta('up', { priority: 5 }),
      ),
    );
    expect(decision.chain.map((p) => p.id)).toEqual(['up']);
  });

  it('includes degraded providers by default but excludes when opted out', () => {
    const good = stubProvider('good');
    const degraded = stubProvider('degraded');
    const metas = metaMap(
      meta('good', { priority: 1 }),
      meta('degraded', { status: 'degraded', priority: 0 }),
    );

    const withDegraded = resolveRoute([good, degraded], metas);
    expect(withDegraded.chain.map((p) => p.id)).toEqual(['degraded', 'good']);

    const withoutDegraded = resolveRoute([good, degraded], metas, { includeDegraded: false });
    expect(withoutDegraded.chain.map((p) => p.id)).toEqual(['good']);
  });

  it('filters by required capabilities (must support every feature)', () => {
    const invest = stubProvider('invest', { features: { investmentAccounts: true } });
    const basic = stubProvider('basic');
    const decision = resolveRoute([invest, basic], metaMap(meta('invest'), meta('basic')), {
      requiredFeatures: ['investmentAccounts'],
    });
    expect(decision.chain.map((p) => p.id)).toEqual(['invest']);
  });

  it('filters by region using provider or metadata region lists (case-insensitive)', () => {
    const us = stubProvider('us', { supportedCountries: ['US'] });
    const gb = stubProvider('gb');
    const decision = resolveRoute(
      [us, gb],
      metaMap(meta('us'), meta('gb', { supportedRegions: ['GB'] })),
      { countryCode: 'gb' },
    );
    expect(decision.chain.map((p) => p.id)).toEqual(['gb']);
  });

  it('treats empty region lists as global (serves every country)', () => {
    const global = stubProvider('global');
    const decision = resolveRoute([global], metaMap(meta('global')), { countryCode: 'JP' });
    expect(decision.primary?.id).toBe('global');
  });

  it('skips region filtering when no countryCode is supplied', () => {
    const us = stubProvider('us', { supportedCountries: ['US'] });
    const decision = resolveRoute([us], metaMap(meta('us')));
    expect(decision.primary?.id).toBe('us');
  });

  it('returns reason "none" with an empty chain when nothing qualifies', () => {
    const us = stubProvider('us', { supportedCountries: ['US'] });
    const decision = resolveRoute([us], metaMap(meta('us')), { countryCode: 'FR' });
    expect(decision.reason).toBe('none');
    expect(decision.primary).toBeNull();
    expect(decision.chain).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveRoute — default metadata fallback
// ---------------------------------------------------------------------------

describe('resolveRoute — default metadata', () => {
  it('routes providers with no metadata but ranks them last', () => {
    const configured = stubProvider('configured');
    const bare = stubProvider('bare');
    const decision = resolveRoute(
      [bare, configured],
      metaMap(meta('configured', { priority: 10 })),
    );
    // `bare` gets MAX_SAFE_INTEGER priority, so `configured` wins.
    expect(decision.chain.map((p) => p.id)).toEqual(['configured', 'bare']);
  });
});

// ---------------------------------------------------------------------------
// resolveRoute — override
// ---------------------------------------------------------------------------

describe('resolveRoute — override', () => {
  it('promotes an eligible preferred provider to the front', () => {
    const plaid = stubProvider('plaid');
    const mx = stubProvider('mx');
    const decision = resolveRoute(
      [plaid, mx],
      metaMap(meta('plaid', { priority: 0 }), meta('mx', { priority: 1 })),
      { preferredProviderId: 'mx' },
    );
    expect(decision.reason).toBe('override');
    expect(decision.primary?.id).toBe('mx');
    expect(decision.chain.map((p) => p.id)).toEqual(['mx', 'plaid']);
  });

  it('reports "override" when the preferred provider is already primary', () => {
    const plaid = stubProvider('plaid');
    const decision = resolveRoute([plaid], metaMap(meta('plaid')), {
      preferredProviderId: 'plaid',
    });
    expect(decision.reason).toBe('override');
    expect(decision.primary?.id).toBe('plaid');
  });

  it('ignores an override that is not routable and falls back to routed', () => {
    const plaid = stubProvider('plaid');
    const mx = stubProvider('mx');
    const decision = resolveRoute(
      [plaid, mx],
      metaMap(meta('plaid', { priority: 0 }), meta('mx', { status: 'down', priority: 1 })),
      { preferredProviderId: 'mx' },
    );
    expect(decision.reason).toBe('routed');
    expect(decision.primary?.id).toBe('plaid');
  });
});

// ---------------------------------------------------------------------------
// ProviderRouter
// ---------------------------------------------------------------------------

describe('ProviderRouter', () => {
  it('routes against the current registry contents and metadata source', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(stubProvider('plaid'));
    registry.registerProvider(stubProvider('mx'));

    const router = new ProviderRouter(registry, () => [
      meta('plaid', { priority: 5 }),
      meta('mx', { priority: 0 }),
    ]);

    expect(router.selectPrimary()?.id).toBe('mx');
  });

  it('uses neutral defaults when no metadata source is provided', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(stubProvider('only'));
    const router = new ProviderRouter(registry);
    expect(router.selectPrimary()?.id).toBe('only');
  });

  it('reflects a swapped metadata source', () => {
    const registry = new ProviderRegistry();
    registry.registerProvider(stubProvider('a'));
    registry.registerProvider(stubProvider('b'));
    const router = new ProviderRouter(registry, () => [
      meta('a', { priority: 0 }),
      meta('b', { priority: 1 }),
    ]);
    expect(router.selectPrimary()?.id).toBe('a');

    router.setMetaSource(() => [meta('a', { priority: 1 }), meta('b', { priority: 0 })]);
    expect(router.selectPrimary()?.id).toBe('b');
  });
});
