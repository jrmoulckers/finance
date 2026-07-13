// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import type { BankConnectionProvider, ProviderFeatures } from '../types';
import {
  defaultMetaForProvider,
  isStatusRoutable,
  type AggregatorStatus,
} from '../aggregator-metadata';

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

function stubProvider(id: string, countries: readonly string[] = ['US']): BankConnectionProvider {
  return {
    id,
    name: id,
    supportedCountries: countries,
    features: NO_FEATURES,
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

describe('defaultMetaForProvider', () => {
  it('derives enabled, healthy, lowest-precedence metadata', () => {
    const provider = stubProvider('plaid', ['US', 'CA']);
    const m = defaultMetaForProvider(provider);
    expect(m).toEqual({
      providerId: 'plaid',
      status: 'active',
      healthScore: 100,
      priority: Number.MAX_SAFE_INTEGER,
      isEnabled: true,
      supportedRegions: ['US', 'CA'],
    });
  });
});

describe('isStatusRoutable', () => {
  const cases: [AggregatorStatus, boolean, boolean][] = [
    ['active', true, true],
    ['degraded', true, true],
    ['degraded', false, false],
    ['down', true, false],
    ['maintenance', true, false],
  ];

  it.each(cases)('status=%s includeDegraded=%s -> %s', (status, includeDegraded, expected) => {
    expect(isStatusRoutable(status, includeDegraded)).toBe(expected);
  });

  it('includes degraded by default', () => {
    expect(isStatusRoutable('degraded')).toBe(true);
  });
});
