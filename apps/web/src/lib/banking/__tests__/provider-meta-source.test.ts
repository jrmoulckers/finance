// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncDb } from '../../../db/async-db';
import type { AggregatorProvider } from '../../../db/repositories/bank-connections';

vi.mock('../../../db/repositories/bank-connections', () => ({
  listAggregatorProviders: vi.fn(),
}));

import { listAggregatorProviders } from '../../../db/repositories/bank-connections';
import { createDbProviderMetaSource } from '../provider-meta-source';

const mockList = vi.mocked(listAggregatorProviders);

type ChangeHandler = () => void;

function createMockDb(): { db: AsyncDb; fireChange: () => void } {
  let handler: ChangeHandler | null = null;
  const db = {
    getAll: vi.fn(),
    getOptional: vi.fn(),
    execute: vi.fn(),
    onChange: vi.fn((_tables: readonly string[], cb: ChangeHandler) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
    close: vi.fn(),
  } as unknown as AsyncDb;
  return { db, fireChange: () => handler?.() };
}

async function flush(): Promise<void> {
  // Let the internal async refresh() settle before asserting on the snapshot.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
  it('maps directory rows to routable metadata keyed by provider name', async () => {
    mockList.mockResolvedValue([provider()]);
    const { db } = createMockDb();

    const source = createDbProviderMetaSource(db);
    await flush();
    const meta = source();

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

  it('treats unknown statuses as down so they are excluded from routing', async () => {
    mockList.mockResolvedValue([provider({ status: 'weird' })]);
    const { db } = createMockDb();

    const source = createDbProviderMetaSource(db);
    await flush();
    const [meta] = source();

    expect(meta.status).toBe('down');
  });

  it('refreshes the cached snapshot when the provider directory changes', async () => {
    mockList.mockResolvedValueOnce([]).mockResolvedValueOnce([provider()]);

    const { db, fireChange } = createMockDb();
    const source = createDbProviderMetaSource(db);
    await flush();

    expect(source()).toHaveLength(0);

    fireChange();
    await flush();

    expect(source()).toHaveLength(1);
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
