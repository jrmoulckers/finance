// SPDX-License-Identifier: BUSL-1.1

/**
 * useBankConnections — Hook for bank connection health and management.
 *
 * Provides connection health status, staleness detection, aggregator
 * provider info, and health history for the connection health dashboard.
 *
 * Data access follows the standard hook pattern:
 *   DatabaseProvider → Repository → Hook → Component
 *
 * Reads come from the PowerSync-synced local SQLite mirror tables
 * (`bank_connection`, `bank_connection_health`, `aggregator_provider`) — there
 * are no direct server calls on the read path. As a side effect the hook wires
 * the synced provider directory into the shared {@link ProviderRouter} so app
 * routing reflects live provider health.
 *
 * @module hooks/useBankConnections
 * References: #1575, #1577, #3852
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useDatabase } from '../db/DatabaseProvider';
import {
  listAggregatorProviders,
  listBankConnectionHealth,
  listHealthHistory,
} from '../db/repositories/bank-connections';
import type {
  AggregatorProvider,
  BankConnectionHealth,
  HealthHistoryEvent,
} from '../db/repositories/bank-connections';
import { createDbProviderMetaSource, defaultRegistry, getProviderRouter } from '../lib/banking';
import { ensureAggregatorProvidersRegistered } from '../lib/banking/register-aggregator-providers';

// ---------------------------------------------------------------------------
// Types (owned by the repository; re-exported here for existing consumers)
// ---------------------------------------------------------------------------

export type {
  AggregatorProvider,
  BankConnectionHealth,
  ConnectionHealthStatus,
  ErrorCategory,
  HealthHistoryEvent,
} from '../db/repositories/bank-connections';

/** Return type for the useBankConnections hook. */
export interface UseBankConnectionsResult {
  /** Connection health statuses. */
  connections: BankConnectionHealth[];
  /** Available aggregator providers. */
  providers: AggregatorProvider[];
  /** Health history for the selected connection. */
  healthHistory: HealthHistoryEvent[];
  /** Whether data is loading. */
  loading: boolean;
  /** Whether health history is loading. */
  historyLoading: boolean;
  /** Human-readable error message. */
  error: string | null;
  /** Refresh all connection data. */
  refresh: () => Promise<void>;
  /** Reload local PowerSync-backed data without triggering a server refresh. */
  reloadLocal: () => Promise<void>;
  /** Load health history for a specific connection. */
  loadHealthHistory: (connectionId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for bank connection health monitoring.
 *
 * Provides connection health statuses, aggregator provider info,
 * and health history. Data is sourced from local SQLite (synced
 * via PowerSync) — no direct server calls for reads.
 *
 * @returns Connection health data and management functions.
 */
export function useBankConnections(): UseBankConnectionsResult {
  const db = useDatabase();
  const [connections, setConnections] = useState<BankConnectionHealth[]>([]);
  const [providers, setProviders] = useState<AggregatorProvider[]>([]);
  const [healthHistory, setHealthHistory] = useState<HealthHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRequestId = useRef(0);

  const reloadLocal = useCallback(async () => {
    setLoading(true);
    try {
      setConnections(await listBankConnectionHealth(db));
      setProviders(await listAggregatorProviders(db));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank connections');
    } finally {
      setLoading(false);
    }
  }, [db]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAggregatorProvidersRegistered();
      for (const connection of connections.filter(
        (candidate) => candidate.connectionStatus === 'active',
      )) {
        const provider = defaultRegistry.getProvider(connection.provider);
        if (!provider) {
          throw new Error(`No refresh provider is registered for ${connection.provider}.`);
        }
        const result = await provider.refreshConnection(connection.id);
        if (!result.success) {
          throw new Error(`Refresh failed for ${connection.institutionName}.`);
        }
      }
      await reloadLocal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh bank connections');
      setLoading(false);
    }
  }, [connections, reloadLocal]);

  // Feed the synced provider directory into the shared router so app-routed
  // provider selection reflects live health/priority. Re-attached whenever the
  // database instance changes (e.g. after a reload).
  useEffect(() => {
    getProviderRouter().setMetaSource(createDbProviderMetaSource(db));
  }, [db]);

  // Load connections + providers from the local SQLite mirror.
  useEffect(() => {
    void reloadLocal();
  }, [reloadLocal]);

  const loadHealthHistory = useCallback(
    async (connectionId: string) => {
      const requestId = ++historyRequestId.current;
      setHealthHistory([]);
      setHistoryLoading(true);
      try {
        const history = await listHealthHistory(db, connectionId);
        if (historyRequestId.current === requestId) {
          setHealthHistory(history);
          setError(null);
        }
      } catch (err) {
        if (historyRequestId.current === requestId) {
          setError(err instanceof Error ? err.message : 'Failed to load health history');
        }
      } finally {
        if (historyRequestId.current === requestId) {
          setHistoryLoading(false);
        }
      }
    },
    [db],
  );

  return {
    connections,
    providers,
    healthHistory,
    loading,
    historyLoading,
    error,
    refresh,
    reloadLocal,
    loadHealthHistory,
  };
}
