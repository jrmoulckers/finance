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

import { useCallback, useEffect, useState } from 'react';

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
import { createDbProviderMetaSource, getProviderRouter } from '../lib/banking';

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
  /** Human-readable error message. */
  error: string | null;
  /** Refresh all connection data. */
  refresh: () => void;
  /** Load health history for a specific connection. */
  loadHealthHistory: (connectionId: string) => void;
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
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  // Feed the synced provider directory into the shared router so app-routed
  // provider selection reflects live health/priority. Re-attached whenever the
  // database instance changes (e.g. after a reload).
  useEffect(() => {
    getProviderRouter().setMetaSource(createDbProviderMetaSource(db));
  }, [db]);

  // Load connections + providers from the local SQLite mirror.
  useEffect(() => {
    const load = async () => {
      try {
        setConnections(await listBankConnectionHealth(db));
        setProviders(await listAggregatorProviders(db));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load bank connections');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [db, refreshToken]);

  const loadHealthHistory = useCallback(
    (connectionId: string) => {
      const load = async () => {
        try {
          setHealthHistory(await listHealthHistory(db, connectionId));
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load health history');
        }
      };

      load();
    },
    [db],
  );

  return {
    connections,
    providers,
    healthHistory,
    loading,
    error,
    refresh,
    loadHealthHistory,
  };
}
