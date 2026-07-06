// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for remittance tracking (issue #2170), backed by the local database.
 *
 * Persists remittance history in the encrypted SQLite-WASM (OPFS) store via the
 * remittances repository — the same durable, sync-enabled path used by accounts
 * and transactions — instead of browser `localStorage`, so records survive a
 * cache clear and no plaintext financial data is written to disk (issue #3273).
 * Follows the project's hook conventions — captures errors in state (never
 * throws), exposes a `refresh()` and a `refreshToken`-driven effect, and returns
 * a consistent CRUD-style shape.
 *
 * References: issue #2170 (feature), issue #3273 (durable persistence)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDatabase } from '../db/DatabaseProvider';
import {
  deleteRemittanceRecord,
  getAllRemittances,
  importLegacyRemittances,
  insertRemittance,
} from '../db/repositories/remittances';
import { summarizeRemittances, summarizeByRecipient } from '../lib/remittance';
import type {
  CreateRemittanceInput,
  RemittanceRecord,
  RemittanceSummary,
  RemittanceRecipientBreakdown,
} from '../lib/remittance';

export interface UseRemittancesResult {
  readonly remittances: readonly RemittanceRecord[];
  readonly summary: RemittanceSummary;
  readonly recipientBreakdown: readonly RemittanceRecipientBreakdown[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
  readonly createRemittance: (input: CreateRemittanceInput) => RemittanceRecord | null;
  readonly deleteRemittance: (id: string) => boolean;
}

function generateId(): string {
  try {
    return (
      globalThis.crypto?.randomUUID() ?? `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  } catch {
    return `rem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function useRemittances(): UseRemittancesResult {
  const db = useDatabase();

  const [remittances, setRemittances] = useState<readonly RemittanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    try {
      // One-time migration of any records left in the pre-#3273 localStorage
      // store, then read the durable list back from the database (sorted).
      importLegacyRemittances(db);
      setRemittances(getAllRemittances(db));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load remittances.');
      setRemittances([]);
    } finally {
      setLoading(false);
    }
  }, [db, refreshToken]);

  const createRemittance = useCallback(
    (input: CreateRemittanceInput): RemittanceRecord | null => {
      try {
        const record: RemittanceRecord = {
          ...input,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
        const persisted = insertRemittance(db, record);
        refresh();
        return persisted;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save the remittance.');
        return null;
      }
    },
    [db, refresh],
  );

  const deleteRemittance = useCallback(
    (id: string): boolean => {
      try {
        const removed = deleteRemittanceRecord(db, id);
        if (removed) {
          refresh();
        }
        return removed;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete the remittance.');
        return false;
      }
    },
    [db, refresh],
  );

  const summary = useMemo(() => summarizeRemittances(remittances), [remittances]);
  const recipientBreakdown = useMemo(() => summarizeByRecipient(remittances), [remittances]);

  return {
    remittances,
    summary,
    recipientBreakdown,
    loading,
    error,
    refresh,
    createRemittance,
    deleteRemittance,
  };
}
