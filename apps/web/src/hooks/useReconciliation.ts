// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  closeReconciliation as repoCloseReconciliation,
  getLastReconciliation,
  getReconciliationHistory,
  getUnclearedTransactionCount,
  type AccountReconciliationSnapshot,
  type CloseReconciliationInput,
} from '../db/repositories/reconciliations';
import type { SyncId } from '../kmp/bridge';

export interface UseAccountReconciliationResult {
  readonly history: AccountReconciliationSnapshot[];
  readonly lastReconciliation: AccountReconciliationSnapshot | null;
  readonly unclearedTransactionCount: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
  readonly closeReconciliation: (
    input: Omit<CloseReconciliationInput, 'accountId'>,
  ) => AccountReconciliationSnapshot | null;
}

export function useAccountReconciliation(
  accountId: SyncId | undefined,
): UseAccountReconciliationResult {
  const db = useDatabase();
  const [history, setHistory] = useState<AccountReconciliationSnapshot[]>([]);
  const [lastReconciliation, setLastReconciliation] =
    useState<AccountReconciliationSnapshot | null>(null);
  const [unclearedTransactionCount, setUnclearedTransactionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!accountId) {
      setHistory([]);
      setLastReconciliation(null);
      setUnclearedTransactionCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setHistory(getReconciliationHistory(db, accountId));
      setLastReconciliation(getLastReconciliation(db, accountId));
      setUnclearedTransactionCount(getUnclearedTransactionCount(db, accountId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reconciliation status.');
      setHistory([]);
      setLastReconciliation(null);
      setUnclearedTransactionCount(0);
    } finally {
      setLoading(false);
    }
  }, [accountId, db, refreshToken]);

  const closeReconciliation = useCallback(
    (input: Omit<CloseReconciliationInput, 'accountId'>): AccountReconciliationSnapshot | null => {
      if (!accountId) {
        return null;
      }

      try {
        const snapshot = repoCloseReconciliation(db, { ...input, accountId });
        refresh();
        return snapshot;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to close reconciliation.');
        setLoading(false);
        return null;
      }
    },
    [accountId, db, refresh],
  );

  return {
    history,
    lastReconciliation,
    unclearedTransactionCount,
    loading,
    error,
    refresh,
    closeReconciliation,
  };
}
