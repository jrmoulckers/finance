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
 * @module hooks/useBankConnections
 * References: #1575, #1577
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Health status of a bank connection. */
export type ConnectionHealthStatus =
  | 'healthy'
  | 'stale'
  | 'auth_expired'
  | 'provider_down'
  | 'rate_limited'
  | 'institution_error'
  | 'unknown_error';

/** Error category for structured reporting. */
export type ErrorCategory = 'auth' | 'provider' | 'institution' | 'network' | 'data' | 'rate_limit';

/** A bank connection with health information. */
export interface BankConnectionHealth {
  /** Connection ID. */
  id: string;
  /** Provider name (plaid, mx, etc.). */
  provider: string;
  /** Institution display name. */
  institutionName: string;
  /** Current connection status. */
  connectionStatus: string;
  /** Computed health status. */
  healthStatus: ConnectionHealthStatus;
  /** Minutes since last successful sync. */
  stalenessMinutes: number | null;
  /** Structured error category (if any). */
  errorCategory: ErrorCategory | null;
  /** Error code from provider. */
  errorCode: string | null;
  /** Last successful sync timestamp. */
  lastSyncedAt: string | null;
  /** Permission level (read_only, etc.). */
  permissionLevel: string;
  /** Connection type (aggregator, open_banking, direct). */
  connectionType: string;
  /** Whether re-authentication is needed. */
  needsReauth: boolean;
}

/** A health history event. */
export interface HealthHistoryEvent {
  /** Event ID. */
  id: string;
  /** Health status at the time. */
  status: ConnectionHealthStatus;
  /** Error category. */
  errorCategory: ErrorCategory | null;
  /** Error detail. */
  errorDetail: string | null;
  /** Staleness in minutes at the time. */
  stalenessMinutes: number | null;
  /** When the issue was resolved (null if unresolved). */
  resolvedAt: string | null;
  /** How it was resolved. */
  resolutionAction: string | null;
  /** When this event was recorded. */
  createdAt: string;
}

/** An aggregator provider from the registry. */
export interface AggregatorProvider {
  /** Provider ID. */
  id: string;
  /** Short name (plaid, mx, etc.). */
  name: string;
  /** Display name. */
  displayName: string;
  /** Provider type. */
  providerType: string;
  /** Current health status. */
  status: string;
  /** Health score (0–100). */
  healthScore: number;
  /** Priority for failover ordering. */
  priority: number;
  /** Whether the provider is enabled. */
  isEnabled: boolean;
  /** Supported regions (ISO 3166-1 alpha-2). */
  supportedRegions: string[];
  /** Provider capabilities. */
  capabilities: Record<string, boolean>;
}

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

  // Load connections — in production this reads from local SQLite
  // via PowerSync sync. For now, initialise with empty state.
  useEffect(() => {
    try {
      // TODO: Wire to PowerSync local database query
      // const db = useDatabase();
      // const rows = query(db, 'SELECT ... FROM bank_connections WHERE deleted_at IS NULL');
      setConnections([]);
      setProviders([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank connections');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const loadHealthHistory = useCallback((_connectionId: string) => {
    try {
      // TODO: Wire to PowerSync local database query
      setHealthHistory([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health history');
    }
  }, []);

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
