// SPDX-License-Identifier: BUSL-1.1

/**
 * useConnectorPermissions — Hook for third-party connector permissions.
 *
 * Provides permission data, access audit log, and permission management
 * functions for the safety center UI.
 *
 * @module hooks/useConnectorPermissions
 * References: #1583
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Permission level for a connector. */
export type PermissionLevel = 'read_only' | 'read_write' | 'read_balance' | 'read_transactions';

/** Token refresh status. */
export type TokenStatus = 'active' | 'expired' | 'revoked' | 'refreshing';

/** A connector permission record. */
export interface ConnectorPermission {
  /** Permission record ID. */
  id: string;
  /** Associated bank connection ID. */
  bankConnectionId: string;
  /** Permission level. */
  permissionLevel: PermissionLevel;
  /** Granted scopes (provider-specific). */
  grantedScopes: string[];
  /** Human-readable scope descriptions. */
  scopeDescriptions: string[];
  /** Whether permissions have been revoked. */
  isRevoked: boolean;
  /** When permissions were revoked. */
  revokedAt: string | null;
  /** Token status. */
  tokenStatus: TokenStatus;
  /** Token expiration. */
  tokenExpiresAt: string | null;
  /** Associated connection info. */
  connection: {
    provider: string;
    institutionName: string;
  } | null;
  /** When permissions were created. */
  createdAt: string;
}

/** An entry in the connector access audit log. */
export interface ConnectorAccessEntry {
  /** Entry ID. */
  id: string;
  /** Bank connection ID. */
  bankConnectionId: string;
  /** Type of access performed. */
  accessType: string;
  /** Provider that performed the access. */
  providerName: string;
  /** Outcome status. */
  status: 'success' | 'failure' | 'partial';
  /** Number of records accessed. */
  recordCount: number;
  /** Duration of the access in milliseconds. */
  durationMs: number | null;
  /** When the access occurred. */
  createdAt: string;
}

/** Return type for the useConnectorPermissions hook. */
export interface UseConnectorPermissionsResult {
  /** All connector permissions. */
  permissions: ConnectorPermission[];
  /** Access audit log entries. */
  accessLog: ConnectorAccessEntry[];
  /** Whether data is loading. */
  loading: boolean;
  /** Error message. */
  error: string | null;
  /** Refresh permissions data. */
  refresh: () => void;
  /** Load access audit log. */
  loadAccessLog: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for managing third-party connector permissions.
 *
 * @returns Permission data and management functions.
 */
export function useConnectorPermissions(): UseConnectorPermissionsResult {
  const [permissions, setPermissions] = useState<ConnectorPermission[]>([]);
  const [accessLog, setAccessLog] = useState<ConnectorAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    try {
      // TODO: Wire to PowerSync local database query
      setPermissions([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connector permissions');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const loadAccessLog = useCallback(() => {
    try {
      // TODO: Wire to PowerSync local database query
      setAccessLog([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load access log');
    }
  }, []);

  return {
    permissions,
    accessLog,
    loading,
    error,
    refresh,
    loadAccessLog,
  };
}
