// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for remittance tracking (issue #2170).
 *
 * Edge / client-side only: remittance entries are persisted to `localStorage`
 * (no SQLite repository, no network) so the workflow is fully offline. Follows
 * the project's hook conventions — captures errors in state (never throws),
 * exposes a `refresh()` and a `refreshToken`-driven effect, and returns a
 * consistent CRUD-style shape.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { summarizeRemittances, summarizeByRecipient } from '../lib/remittance';
import type {
  CreateRemittanceInput,
  RemittanceRecord,
  RemittanceSummary,
  RemittanceRecipientBreakdown,
} from '../lib/remittance';

const STORAGE_KEY = 'finance-remittances';

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

function readStorage(): RemittanceRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RemittanceRecord[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(records: readonly RemittanceRecord[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Best-effort persistence; storage may be unavailable (private mode, quota).
  }
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

/** Most recent first (by send date, then creation instant). */
function sortRecords(records: readonly RemittanceRecord[]): RemittanceRecord[] {
  return [...records].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function useRemittances(): UseRemittancesResult {
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
      setRemittances(sortRecords(readStorage()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load remittances.');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  const createRemittance = useCallback((input: CreateRemittanceInput): RemittanceRecord | null => {
    try {
      const record: RemittanceRecord = {
        ...input,
        id: generateId(),
        createdAt: new Date().toISOString(),
      };
      setRemittances((current) => {
        const next = sortRecords([record, ...current]);
        writeStorage(next);
        return next;
      });
      return record;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the remittance.');
      return null;
    }
  }, []);

  const deleteRemittance = useCallback((id: string): boolean => {
    try {
      let removed = false;
      setRemittances((current) => {
        const next = current.filter((record) => record.id !== id);
        removed = next.length !== current.length;
        writeStorage(next);
        return next;
      });
      return removed;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the remittance.');
      return false;
    }
  }, []);

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
