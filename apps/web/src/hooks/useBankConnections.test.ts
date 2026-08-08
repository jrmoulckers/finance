// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listAggregatorProviders,
  listBankConnectionHealth,
  listHealthHistory,
} from '../db/repositories/bank-connections';
import { defaultRegistry } from '../lib/banking';
import { ensureAggregatorProvidersRegistered } from '../lib/banking/register-aggregator-providers';
import { useBankConnections } from './useBankConnections';

const mockDatabase = { __db: true };

vi.mock('../db/DatabaseProvider', () => ({
  useDatabase: () => mockDatabase,
}));

vi.mock('../db/repositories/bank-connections', () => ({
  listAggregatorProviders: vi.fn(),
  listBankConnectionHealth: vi.fn(),
  listHealthHistory: vi.fn(),
}));

vi.mock('../lib/banking', () => ({
  createDbProviderMetaSource: vi.fn(() => ({ __source: true })),
  defaultRegistry: { getProvider: vi.fn() },
  getProviderRouter: vi.fn(() => ({ setMetaSource: vi.fn() })),
}));

vi.mock('../lib/banking/register-aggregator-providers', () => ({
  ensureAggregatorProvidersRegistered: vi.fn(),
}));

const activeConnection = {
  id: 'conn-active',
  provider: 'plaid',
  institutionName: 'Example Bank',
  connectionStatus: 'active',
  healthStatus: 'healthy' as const,
  stalenessMinutes: 0,
  errorCategory: null,
  errorCode: null,
  lastSyncedAt: '2026-08-07T12:00:00.000Z',
  permissionLevel: 'read_only',
  connectionType: 'aggregator',
  needsReauth: false,
};

const inactiveConnection = {
  ...activeConnection,
  id: 'conn-inactive',
  provider: 'mx',
  institutionName: 'Inactive Bank',
  connectionStatus: 'disconnected',
};

describe('useBankConnections refresh', () => {
  const refreshConnection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBankConnectionHealth).mockResolvedValue([activeConnection, inactiveConnection]);
    vi.mocked(listAggregatorProviders).mockResolvedValue([]);
    vi.mocked(listHealthHistory).mockResolvedValue([]);
    vi.mocked(ensureAggregatorProvidersRegistered).mockResolvedValue(undefined);
    vi.mocked(defaultRegistry.getProvider).mockReturnValue({
      refreshConnection,
    } as never);
    refreshConnection.mockResolvedValue({
      connectionId: activeConnection.id,
      success: true,
      newTransactions: 3,
    });
  });

  it('refreshes every active displayed connection before reloading local data', async () => {
    const { result } = renderHook(() => useBankConnections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialLoadCount = vi.mocked(listBankConnectionHealth).mock.calls.length;

    await act(async () => {
      await result.current.refresh();
    });

    expect(ensureAggregatorProvidersRegistered).toHaveBeenCalledOnce();
    expect(defaultRegistry.getProvider).toHaveBeenCalledWith('plaid');
    expect(defaultRegistry.getProvider).not.toHaveBeenCalledWith('mx');
    expect(refreshConnection).toHaveBeenCalledWith('conn-active');
    expect(listBankConnectionHealth).toHaveBeenCalledTimes(initialLoadCount + 1);
  });

  it('surfaces provider refresh failures and does not report silent success', async () => {
    refreshConnection.mockRejectedValue(new Error('Provider refresh unavailable'));
    const { result } = renderHook(() => useBankConnections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialLoadCount = vi.mocked(listBankConnectionHealth).mock.calls.length;

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('Provider refresh unavailable');
    expect(listBankConnectionHealth).toHaveBeenCalledTimes(initialLoadCount);
  });

  it('discards stale health history responses after a newer selection', async () => {
    let resolveFirst: ((value: Awaited<ReturnType<typeof listHealthHistory>>) => void) | undefined;
    vi.mocked(listHealthHistory)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce([
        {
          id: 'newer-event',
          status: 'healthy',
          errorCategory: null,
          errorDetail: null,
          stalenessMinutes: 0,
          resolvedAt: null,
          resolutionAction: null,
          createdAt: '2026-08-07T13:00:00.000Z',
        },
      ]);
    const { result } = renderHook(() => useBankConnections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstRequest = Promise.resolve();
    await act(async () => {
      firstRequest = result.current.loadHealthHistory('conn-active');
      await result.current.loadHealthHistory('conn-inactive');
    });
    await act(async () => {
      resolveFirst?.([
        {
          id: 'stale-event',
          status: 'provider_down',
          errorCategory: 'provider',
          errorDetail: 'STALE',
          stalenessMinutes: null,
          resolvedAt: null,
          resolutionAction: null,
          createdAt: '2026-08-07T12:00:00.000Z',
        },
      ]);
      await firstRequest;
    });

    expect(result.current.healthHistory.map((event) => event.id)).toEqual(['newer-event']);
  });
});
