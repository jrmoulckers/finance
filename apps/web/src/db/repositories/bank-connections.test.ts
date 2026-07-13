// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row, SqliteDb } from '../sqlite-wasm';

vi.mock('../sqlite-wasm', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

import { query } from '../sqlite-wasm';
import {
  listAggregatorProviders,
  listBankConnectionHealth,
  listHealthHistory,
} from './bank-connections';

const mockQuery = vi.mocked(query);
const mockDb = {} as SqliteDb;

function result(rows: Row[]) {
  return { columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listBankConnectionHealth', () => {
  it('maps a joined connection + latest health row', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'conn-1',
          provider: 'plaid',
          institution_name: 'Acme Bank',
          connection_status: 'active',
          connection_last_synced_at: '2026-04-01T00:00:00Z',
          error_code: null,
          health_status: 'stale',
          error_category: 'provider',
          staleness_minutes: 120,
          last_successful_sync: '2026-04-02T00:00:00Z',
          provider_type: 'aggregator',
        },
      ]),
    );

    const [connection] = listBankConnectionHealth(mockDb);

    expect(connection).toEqual({
      id: 'conn-1',
      provider: 'plaid',
      institutionName: 'Acme Bank',
      connectionStatus: 'active',
      healthStatus: 'stale',
      stalenessMinutes: 120,
      errorCategory: 'provider',
      errorCode: null,
      lastSyncedAt: '2026-04-02T00:00:00Z',
      permissionLevel: 'read_only',
      connectionType: 'aggregator',
      needsReauth: false,
    });
  });

  it('derives health status from connection status when no health row exists', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'conn-2',
          provider: 'mx',
          institution_name: 'Beta CU',
          connection_status: 'needs_reauth',
          connection_last_synced_at: '2026-03-01T00:00:00Z',
          error_code: 'ITEM_LOGIN_REQUIRED',
          health_status: null,
          error_category: null,
          staleness_minutes: null,
          last_successful_sync: null,
          provider_type: null,
        },
      ]),
    );

    const [connection] = listBankConnectionHealth(mockDb);

    expect(connection.healthStatus).toBe('auth_expired');
    expect(connection.needsReauth).toBe(true);
    expect(connection.stalenessMinutes).toBeNull();
    expect(connection.connectionType).toBe('aggregator');
    expect(connection.lastSyncedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('ignores unknown health/category values', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'conn-3',
          provider: 'plaid',
          institution_name: 'Gamma Bank',
          connection_status: 'active',
          connection_last_synced_at: null,
          error_code: null,
          health_status: 'not_a_real_status',
          error_category: 'bogus',
          staleness_minutes: 5,
          last_successful_sync: null,
          provider_type: 'open_banking',
        },
      ]),
    );

    const [connection] = listBankConnectionHealth(mockDb);

    expect(connection.healthStatus).toBe('healthy');
    expect(connection.errorCategory).toBeNull();
    expect(connection.connectionType).toBe('open_banking');
  });
});

describe('listAggregatorProviders', () => {
  it('parses JSON regions/capabilities and coerces booleans', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'prov-1',
          name: 'plaid',
          display_name: 'Plaid',
          provider_type: 'aggregator',
          status: 'active',
          health_score: 98,
          priority: 0,
          is_enabled: 1,
          supported_regions: '["US","CA"]',
          capabilities: '{"transactions":true,"identity":false}',
        },
      ]),
    );

    const [provider] = listAggregatorProviders(mockDb);

    expect(provider).toEqual({
      id: 'prov-1',
      name: 'plaid',
      displayName: 'Plaid',
      providerType: 'aggregator',
      status: 'active',
      healthScore: 98,
      priority: 0,
      isEnabled: true,
      supportedRegions: ['US', 'CA'],
      capabilities: { transactions: true, identity: false },
    });
  });

  it('tolerates malformed JSON', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'prov-2',
          name: 'mx',
          display_name: 'MX',
          provider_type: 'aggregator',
          status: 'degraded',
          health_score: 70,
          priority: 1,
          is_enabled: 0,
          supported_regions: 'not-json',
          capabilities: null,
        },
      ]),
    );

    const [provider] = listAggregatorProviders(mockDb);

    expect(provider.supportedRegions).toEqual([]);
    expect(provider.capabilities).toEqual({});
    expect(provider.isEnabled).toBe(false);
  });
});

describe('listHealthHistory', () => {
  it('maps history rows and passes the connection id + limit', () => {
    mockQuery.mockReturnValueOnce(
      result([
        {
          id: 'h-1',
          status: 'stale',
          error_category: 'provider',
          error_detail: 'slow',
          staleness_minutes: 60,
          resolved_at: null,
          resolution_action: null,
          created_at: '2026-04-03T00:00:00Z',
        },
      ]),
    );

    const events = listHealthHistory(mockDb, 'conn-1');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      id: 'h-1',
      status: 'stale',
      errorCategory: 'provider',
      errorDetail: 'slow',
      stalenessMinutes: 60,
      resolvedAt: null,
      resolutionAction: null,
      createdAt: '2026-04-03T00:00:00Z',
    });

    const params = mockQuery.mock.calls[0][2];
    expect(params).toEqual(['conn-1', 100]);
  });

  it('honours a custom limit', () => {
    mockQuery.mockReturnValueOnce(result([]));

    listHealthHistory(mockDb, 'conn-9', 25);

    expect(mockQuery.mock.calls[0][2]).toEqual(['conn-9', 25]);
  });
});
