// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteDb } from '../../../db/sqlite-wasm';
import type { AggregatorProvider } from '../../../db/repositories/bank-connections';

vi.mock('../../../db/repositories/bank-connections', () => ({
  listAggregatorProviders: vi.fn(),
}));

import { listAggregatorProviders } from '../../../db/repositories/bank-connections';
import { createDbProviderMetaSource } from '../provider-meta-source';

const mockList = vi.mocked(listAggregatorProviders);
const mockDb = {} as SqliteDb;

function provider(overrides: Partial<AggregatorProvider> = {}): AggregatorProvider {
  return {
    id: 'prov-1',
    name: 'plaid',
    displayName: 'Plaid',
    providerType: 'aggregator',
    status: 'active',
    healthScore: 95,
    priority: 0,
    isEnabled: true,
    supportedRegions: ['US'],
    capabilities: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDbProviderMetaSource', () => {
  it('maps directory rows to routable metadata keyed by provider name', () => {
    mockList.mockReturnValue([provider()]);

    const meta = createDbProviderMetaSource(mockDb)();

    expect(meta).toEqual([
      {
        providerId: 'plaid',
        status: 'active',
        healthScore: 95,
        priority: 0,
        isEnabled: true,
        supportedRegions: ['US'],
      },
    ]);
  });

  it('treats unknown statuses as down so they are excluded from routing', () => {
    mockList.mockReturnValue([provider({ status: 'weird' })]);

    const [meta] = createDbProviderMetaSource(mockDb)();

    expect(meta.status).toBe('down');
  });

  it('re-reads the directory on every invocation', () => {
    mockList.mockReturnValueOnce([]).mockReturnValueOnce([provider()]);

    const source = createDbProviderMetaSource(mockDb);

    expect(source()).toHaveLength(0);
    expect(source()).toHaveLength(1);
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
